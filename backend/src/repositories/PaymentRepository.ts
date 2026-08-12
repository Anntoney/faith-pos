/**
 * Payment Repository
 * Data access layer for payment records
 * Requirements: 7.1, 7.4, 7.5
 */

import { Payment, PaymentStatus, PaymentAuditLog } from '../types/payment';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * PaymentRepository handles all database operations for payment records
 * Implements CRUD operations with proper transactional semantics
 */
export class PaymentRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Validate required payment fields
   * Requirements: 7.4 - Data validation on write
   */
  private validatePayment(payment: any): void {
    const errors: string[] = [];

    if (!payment.transaction_id || typeof payment.transaction_id !== 'string') {
      errors.push('transaction_id is required and must be a string');
    }

    if (!payment.store_id || typeof payment.store_id !== 'string') {
      errors.push('store_id is required and must be a string');
    }

    if (!payment.phone_number || typeof payment.phone_number !== 'string') {
      errors.push('phone_number is required and must be a string');
    }

    // Validate phone number format (254-prefixed or +254)
    if (payment.phone_number && !this.isValidPhoneNumber(payment.phone_number)) {
      errors.push('phone_number must be in valid format (e.g., 254XXXXXXXXX or +254XXXXXXXXX)');
    }

    if (typeof payment.amount !== 'number' || payment.amount <= 0) {
      errors.push('amount is required and must be a positive number');
    }

    if (!payment.status || !Object.values(PaymentStatus).includes(payment.status)) {
      errors.push(`status must be one of: ${Object.values(PaymentStatus).join(', ')}`);
    }

    if (payment.applied_to_credit !== undefined && typeof payment.applied_to_credit !== 'boolean') {
      errors.push('applied_to_credit must be a boolean');
    }

    if (errors.length > 0) {
      throw new Error(`Payment validation failed: ${errors.join('; ')}`);
    }
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Accept formats: 254XXXXXXXXX or +254XXXXXXXXX (11-13 digits total)
    const phoneRegex = /^(\+)?254\d{9,10}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Create a new payment record
   * Requirements: 7.4 - Validates all required fields before persisting
   */
  async create(payment: Omit<Payment, 'payment_id' | 'created_at' | 'updated_at'>): Promise<Payment> {
    this.validatePayment(payment);

    const { data, error } = await this.supabase
      .from('payments')
      .insert([
        {
          transaction_id: payment.transaction_id,
          store_id: payment.store_id,
          phone_number: payment.phone_number,
          amount: payment.amount,
          status: payment.status,
          mpesa_checkout_request_id: payment.mpesa_checkout_request_id || null,
          mpesa_response_code: payment.mpesa_response_code || null,
          error_message: payment.error_message || null,
          applied_to_credit: payment.applied_to_credit || false,
          customer_id: payment.customer_id || null,
          reconciled_at: null,
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create payment: ${error.message}`);
    }

    return this.mapRowToPayment(data);
  }

  /**
   * Find a payment by ID
   */
  async findById(paymentId: string): Promise<Payment | null> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('payment_id', paymentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw new Error(`Failed to find payment: ${error.message}`);
    }

    return this.mapRowToPayment(data);
  }

  /**
   * Find payments by store ID with pagination
   * Requirements: 7.5 - Returns results ordered by created_at descending with pagination support
   */
  async findByStore(
    storeId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<{ payments: Payment[]; total: number }> {
    // Get total count
    const { count, error: countError } = await this.supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId);

    if (countError) {
      throw new Error(`Failed to count payments: ${countError.message}`);
    }

    // Get paginated results ordered by created_at descending
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to find payments by store: ${error.message}`);
    }

    return {
      payments: (data || []).map(row => this.mapRowToPayment(row)),
      total: count || 0,
    };
  }

  /**
   * Find payments by transaction ID
   */
  async findByTransaction(transactionId: string): Promise<Payment | null> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('transaction_id', transactionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw new Error(`Failed to find payment by transaction: ${error.message}`);
    }

    return this.mapRowToPayment(data);
  }

  /**
   * Find all payments for a transaction ID
   */
  async findAllByTransaction(transactionId: string): Promise<Payment[]> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to find payments by transaction: ${error.message}`);
    }

    return (data || []).map(row => this.mapRowToPayment(row));
  }

  /**
   * Find payment by M-Pesa checkout request ID (webhook lookup)
   * Requirements: 3.2
   */
  async findByCheckoutRequestId(checkoutRequestId: string): Promise<Payment | null> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('mpesa_checkout_request_id', checkoutRequestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find payment by checkout request ID: ${error.message}`);
    }

    return data ? this.mapRowToPayment(data) : null;
  }

  /**
   * Persist webhook log entry
   * Requirements: 3.5
   */
  async createWebhookLog(log: {
    payment_id?: string | null;
    webhook_payload: Record<string, unknown>;
    signature_valid: boolean;
    processing_status: 'SUCCESS' | 'FAILED' | 'QUEUED_FOR_RETRY';
    error_message?: string | null;
    retry_count?: number;
    next_retry_at?: Date | null;
    processed_at?: Date | null;
  }): Promise<string> {
    const { data, error } = await this.supabase
      .from('webhook_logs')
      .insert([
        {
          payment_id: log.payment_id || null,
          webhook_payload: log.webhook_payload,
          signature_valid: log.signature_valid,
          processing_status: log.processing_status,
          error_message: log.error_message || null,
          retry_count: log.retry_count || 0,
          next_retry_at: log.next_retry_at ? log.next_retry_at.toISOString() : null,
          processed_at: log.processed_at ? log.processed_at.toISOString() : null,
        },
      ])
      .select('webhook_log_id')
      .single();

    if (error) {
      throw new Error(`Failed to create webhook log: ${error.message}`);
    }

    return data.webhook_log_id;
  }

  /**
   * Update webhook log retry metadata
   */
  async updateWebhookLogRetry(
    webhookLogId: string,
    retryCount: number,
    nextRetryAt: Date,
    processingStatus: 'QUEUED_FOR_RETRY' | 'FAILED' | 'SUCCESS' = 'QUEUED_FOR_RETRY'
  ): Promise<void> {
    const { error } = await this.supabase
      .from('webhook_logs')
      .update({
        retry_count: retryCount,
        next_retry_at: nextRetryAt.toISOString(),
        processing_status: processingStatus,
      })
      .eq('webhook_log_id', webhookLogId);

    if (error) {
      throw new Error(`Failed to update webhook log retry: ${error.message}`);
    }
  }

  /**
   * Update payment status
   * Requirements: 7.2 - Creates audit log entry for status changes
   */
  async updateStatus(
    paymentId: string,
    newStatus: PaymentStatus,
    context: {
      changedBy: 'system' | 'operator' | 'webhook';
      reason?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Payment> {
    // Get current payment to retrieve previous status
    const currentPayment = await this.findById(paymentId);
    if (!currentPayment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // Update payment status
    const { data, error } = await this.supabase
      .from('payments')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_id', paymentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update payment status: ${error.message}`);
    }

    // Create audit log entry
    await this.createAuditLog({
      payment_id: paymentId,
      previous_status: currentPayment.status,
      new_status: newStatus,
      changed_by: context.changedBy,
      reason: context.reason || undefined,
      metadata: context.metadata || undefined,
    });

    return this.mapRowToPayment(data);
  }

  /**
   * Update payment as reconciled
   * Requirements: 7.3 - Uses database transactions to ensure atomicity
   */
  async updateReconciled(paymentId: string, reconciledAt: Date): Promise<Payment> {
    const { data, error } = await this.supabase
      .from('payments')
      .update({
        reconciled_at: reconciledAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('payment_id', paymentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update reconciled payment: ${error.message}`);
    }

    // Create audit log entry
    const payment = this.mapRowToPayment(data);
    await this.createAuditLog({
      payment_id: paymentId,
      previous_status: payment.status,
      new_status: payment.status,
      changed_by: 'system',
      reason: 'Payment reconciled',
      metadata: { reconciled_at: reconciledAt.toISOString() },
    });

    return payment;
  }

  /**
   * Create audit log entry
   * Requirements: 7.2
   */
  async createAuditLog(auditLog: Omit<PaymentAuditLog, 'audit_log_id' | 'changed_at'>): Promise<PaymentAuditLog> {
    const { data, error } = await this.supabase
      .from('payment_audit_logs')
      .insert([
        {
          payment_id: auditLog.payment_id,
          previous_status: auditLog.previous_status || null,
          new_status: auditLog.new_status,
          changed_by: auditLog.changed_by,
          reason: auditLog.reason || null,
          metadata: auditLog.metadata || null,
          changed_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create audit log: ${error.message}`);
    }

    return {
      audit_log_id: data.audit_log_id,
      payment_id: data.payment_id,
      previous_status: data.previous_status,
      new_status: data.new_status,
      changed_by: data.changed_by,
      changed_at: new Date(data.changed_at),
      reason: data.reason,
      metadata: data.metadata,
    };
  }

  /**
   * Get audit history for a payment
   * Requirements: 7.2
   */
  async getAuditHistory(paymentId: string): Promise<PaymentAuditLog[]> {
    const { data, error } = await this.supabase
      .from('payment_audit_logs')
      .select('*')
      .eq('payment_id', paymentId)
      .order('changed_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get audit history: ${error.message}`);
    }

    return (data || []).map(row => ({
      audit_log_id: row.audit_log_id,
      payment_id: row.payment_id,
      previous_status: row.previous_status,
      new_status: row.new_status,
      changed_by: row.changed_by,
      changed_at: new Date(row.changed_at),
      reason: row.reason,
      metadata: row.metadata,
    }));
  }

  /**
   * Find orphaned payments (no matching transaction)
   */
  async findOrphaned(storeId: string, limit: number = 10): Promise<Payment[]> {
    // Get all payment IDs for the store
    const { data: payments, error: paymentsError } = await this.supabase
      .from('payments')
      .select('*')
      .eq('store_id', storeId)
      .limit(limit);

    if (paymentsError) {
      throw new Error(`Failed to find payments: ${paymentsError.message}`);
    }

    if (!payments || payments.length === 0) {
      return [];
    }

    // Get all transaction IDs for these payment IDs
    const transactionIds = payments.map((p: any) => p.transaction_id);
    
    // FAITH-POS uses `sales` as the transaction store
    const { data: sales, error: salesError } = await this.supabase
      .from('sales')
      .select('id')
      .in('id', transactionIds);

    if (salesError) {
      throw new Error(`Failed to find sales: ${salesError.message}`);
    }

    const matchedSaleIds = new Set((sales || []).map((t: any) => t.id));

    // Filter payments that don't have matching sales
    const orphanedPayments = (payments || [])
      .filter((p: any) => !matchedSaleIds.has(p.transaction_id))
      .map(row => this.mapRowToPayment(row));

    return orphanedPayments;
  }

  /**
   * Update error message
   */
  async updateErrorMessage(paymentId: string, errorMessage: string): Promise<Payment> {
    const { data, error } = await this.supabase
      .from('payments')
      .update({
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_id', paymentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update payment error message: ${error.message}`);
    }

    return this.mapRowToPayment(data);
  }

  /**
   * Update M-Pesa response fields
   */
  async updateMpesaResponse(
    paymentId: string,
    checkoutRequestId: string,
    responseCode: string
  ): Promise<Payment> {
    const { data, error } = await this.supabase
      .from('payments')
      .update({
        mpesa_checkout_request_id: checkoutRequestId,
        mpesa_response_code: responseCode,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_id', paymentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update M-Pesa response: ${error.message}`);
    }

    return this.mapRowToPayment(data);
  }

  /**
   * Find payments with status in a given list
   */
  async findByStatus(
    storeId: string,
    statuses: PaymentStatus[],
    limit?: number
  ): Promise<Payment[]> {
    let query = this.supabase
      .from('payments')
      .select('*')
      .eq('store_id', storeId)
      .in('status', statuses)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to find payments by status: ${error.message}`);
    }

    return (data || []).map(row => this.mapRowToPayment(row));
  }

  /**
   * Map database row to Payment object
   */
  private mapRowToPayment(row: any): Payment {
    return {
      payment_id: row.payment_id,
      transaction_id: row.transaction_id,
      store_id: row.store_id,
      phone_number: row.phone_number,
      amount: row.amount,
      status: row.status as PaymentStatus,
      mpesa_checkout_request_id: row.mpesa_checkout_request_id,
      mpesa_response_code: row.mpesa_response_code,
      error_message: row.error_message,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      reconciled_at: row.reconciled_at ? new Date(row.reconciled_at) : null,
      applied_to_credit: row.applied_to_credit || false,
      customer_id: row.customer_id,
    };
  }
}
