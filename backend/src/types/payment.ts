/**
 * Payment-related TypeScript interfaces
 * Requirements: 7.1, 10.1
 */

/**
 * Payment status enum representing the lifecycle of a payment
 */
export enum PaymentStatus {
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

/**
 * Main Payment record interface
 * Represents a single M-Pesa payment transaction
 */
export interface Payment {
  payment_id: string; // UUID
  transaction_id: string; // Reference to transaction
  store_id: string; // Store identifier
  phone_number: string; // Customer M-Pesa account
  amount: number; // Payment amount in cents
  status: PaymentStatus; // Current payment status
  mpesa_checkout_request_id?: string; // M-Pesa checkout request ID
  mpesa_response_code?: string; // M-Pesa response code
  error_message?: string | null; // Human-readable error
  created_at: Date;
  updated_at: Date;
  reconciled_at?: Date | null;
  applied_to_credit: boolean; // Whether payment was added to customer credit
  customer_id?: string | null; // Optional customer reference
}

/**
 * Payment audit log entry
 * Immutable record of all payment status changes
 * Requirements: 7.2
 */
export interface PaymentAuditLog {
  audit_log_id: string; // UUID
  payment_id: string; // Reference to payment
  previous_status?: PaymentStatus | null;
  new_status: PaymentStatus;
  changed_by: 'system' | 'operator' | 'webhook'; // Who triggered the change
  changed_at: Date;
  reason?: string; // Reason for status change
  metadata?: Record<string, unknown>; // Additional context
}

/**
 * Webhook log entry
 * Record of all webhook callbacks received from M-Pesa
 * Requirements: 3.5
 */
export interface WebhookLog {
  webhook_log_id: string; // UUID
  payment_id?: string; // Reference to payment (may be null for orphaned webhooks)
  webhook_payload: Record<string, unknown>; // Full webhook payload
  signature_valid: boolean;
  processing_status: 'SUCCESS' | 'FAILED' | 'QUEUED_FOR_RETRY';
  error_message?: string | null;
  retry_count: number;
  next_retry_at?: Date | null;
  received_at: Date;
  processed_at?: Date | null;
}

/**
 * Offline queue entry
 * Represents a payment request queued during offline mode
 * Requirements: 8.1, 8.5
 */
export interface OfflineQueueEntry {
  queue_entry_id: string; // UUID
  transaction_id: string;
  store_id: string;
  phone_number: string;
  amount: number;
  retry_count: number;
  last_retry_at?: Date | null;
  queued_at: Date;
  processed_at?: Date | null;
  error_message?: string | null;
}

/**
 * Customer credit record
 * Represents pre-paid funds or account balance for a customer
 * Requirements: 9.2, 9.3
 */
export interface CustomerCredit {
  credit_id: string; // UUID
  customer_id: string;
  store_id: string;
  balance: number; // Balance in cents
  updated_at: Date;
  last_transaction_id?: string; // Reference to last transaction affecting this credit
}

/**
 * Extended transaction interface
 * Includes payment-related fields
 * Requirements: 4.1, 4.2
 */
export interface Transaction {
  transaction_id: string;
  store_id: string;
  customer_id?: string | null;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  payment_method: 'cash' | 'card' | 'mpesa' | 'credit';
  payment_id?: string | null; // Reference to Payment record (if applicable)
  status: 'pending' | 'paid' | 'cancelled';
  created_at: Date;
  paid_at?: Date | null;
}

/**
 * Line item in a transaction
 */
export interface LineItem {
  item_id: string;
  product_id: string;
  quantity: number;
  unit_price: number; // In cents
  total_price: number; // In cents
}

/**
 * M-Pesa API request/response types
 */

/**
 * Payment initiation request to M-Pesa API
 */
export interface MpesaInitiateRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: string;
  Amount: number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

/**
 * Payment initiation response from M-Pesa API
 */
export interface MpesaInitiateResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

/**
 * Payment status query response from M-Pesa API
 */
export interface MpesaStatusResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  Amount?: number;
  MpesaReceiptNumber?: string;
  PhoneNumber?: string;
}

/**
 * M-Pesa webhook callback payload
 */
export interface MpesaWebhookPayload {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number; // 0 = success, non-zero = failure
      ResultDesc: string;
      Amount?: number;
      MpesaReceiptNumber?: string;
      PhoneNumber?: string;
      [key: string]: unknown;
    };
  };
}

/**
 * Error response types
 */
export interface PaymentError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * System context for payment operations
 */
export interface PaymentContext {
  storeId: string;
  userId?: string;
  timestamp: Date;
  [key: string]: unknown;
}
