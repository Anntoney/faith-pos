/**
 * Transaction Repository
 * Data access for sales transactions used by payment reconciliation/locking
 * Requirements: 4.4, 6.5
 *
 * Maps to the existing `sales` table in FAITH-POS.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface SaleTransaction {
  transaction_id: string;
  store_id: string;
  total: number; // Amount in cents
  status: 'pending' | 'paid' | 'partial' | 'cancelled';
  payment_method?: string | null;
  payment_id?: string | null;
  paid_at?: Date | null;
  locked_at?: Date | null;
  locked_by?: string | null;
}

export class TransactionRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Find sale by ID scoped to store (multi-store isolation)
   */
  async findById(transactionId: string, storeId?: string): Promise<SaleTransaction | null> {
    let query = this.supabase.from('sales').select('*').eq('id', transactionId);

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to find transaction: ${error.message}`);
    }

    return this.mapRow(data);
  }

  /**
   * Lock a transaction during payment processing
   * Requirements: 4.4
   */
  async lockTransaction(transactionId: string, lockedBy: string = 'mpesa'): Promise<boolean> {
    const { data: existing, error: findError } = await this.supabase
      .from('sales')
      .select('id, locked_at, locked_by, payment_status')
      .eq('id', transactionId)
      .single();

    if (findError || !existing) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (existing.locked_at && existing.locked_by && existing.locked_by !== lockedBy) {
      throw new Error(`Transaction ${transactionId} is already locked by ${existing.locked_by}`);
    }

    const { error } = await this.supabase
      .from('sales')
      .update({
        locked_at: new Date().toISOString(),
        locked_by: lockedBy,
        payment_method: 'mpesa',
      })
      .eq('id', transactionId);

    if (error) {
      // Columns may not exist yet — soft-fail so STK still works
      console.warn(`lockTransaction update failed (migration may be needed): ${error.message}`);
      return false;
    }

    return true;
  }

  /**
   * Unlock a transaction after payment completes/fails/cancels
   */
  async unlockTransaction(transactionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('sales')
      .update({
        locked_at: null,
        locked_by: null,
      })
      .eq('id', transactionId);

    if (error) {
      console.warn(`unlockTransaction failed: ${error.message}`);
    }
  }

  /**
   * Mark sale as paid and attach payment_id
   */
  async markPaid(
    transactionId: string,
    paymentId: string,
    paidAt: Date = new Date()
  ): Promise<void> {
    const { error } = await this.supabase
      .from('sales')
      .update({
        payment_status: 'paid',
        payment_method: 'mpesa',
        payment_id: paymentId,
        paid_at: paidAt.toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq('id', transactionId);

    if (error) {
      // Fallback without optional columns
      const { error: fallbackError } = await this.supabase
        .from('sales')
        .update({
          payment_status: 'paid',
          payment_method: 'mpesa',
        })
        .eq('id', transactionId);

      if (fallbackError) {
        throw new Error(`Failed to mark transaction paid: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Cancel transaction and clear payment lock
   * Requirements: 4.4
   */
  async cancelTransaction(transactionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('sales')
      .update({
        payment_status: 'cancelled',
        locked_at: null,
        locked_by: null,
      })
      .eq('id', transactionId);

    if (error) {
      throw new Error(`Failed to cancel transaction: ${error.message}`);
    }
  }

  private mapRow(row: any): SaleTransaction {
    const totalMajor = Number(row.total_amount ?? row.total ?? 0);
    return {
      transaction_id: row.id || row.transaction_id,
      store_id: row.store_id,
      // Convert major units (KES) to cents for comparison with Payment.amount
      total: Math.round(totalMajor * 100),
      status:
        row.payment_status === 'paid'
          ? 'paid'
          : row.payment_status === 'cancelled'
            ? 'cancelled'
            : row.payment_status === 'partial'
              ? 'partial'
              : 'pending',
      payment_method: row.payment_method,
      payment_id: row.payment_id,
      paid_at: row.paid_at ? new Date(row.paid_at) : null,
      locked_at: row.locked_at ? new Date(row.locked_at) : null,
      locked_by: row.locked_by,
    };
  }
}
