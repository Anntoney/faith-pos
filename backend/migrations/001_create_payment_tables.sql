-- Migration: Create Payment Integration Tables
-- Purpose: Set up database schema for M-Pesa payment processing
-- Requirements: 7.1, 10.1

-- Payments Table
-- Stores all payment records with full lifecycle tracking
CREATE TABLE IF NOT EXISTS payments (
  payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL,
  store_id UUID NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL, -- Amount in cents
  status VARCHAR(50) NOT NULL DEFAULT 'INITIATED',
  mpesa_checkout_request_id VARCHAR(255),
  mpesa_response_code VARCHAR(50),
  error_message TEXT,
  applied_to_credit BOOLEAN DEFAULT FALSE,
  customer_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reconciled_at TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_payments_store_id ON payments(store_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_store ON payments(status, store_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);

-- Payment Audit Log Table
-- Immutable log of all payment status changes for audit trail
CREATE TABLE IF NOT EXISTS payment_audit_logs (
  audit_log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  changed_by VARCHAR(50) NOT NULL, -- 'system', 'operator', 'webhook'
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  metadata JSONB,
  FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE CASCADE
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_payment_id ON payment_audit_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON payment_audit_logs(changed_at);

-- Webhook Log Table
-- Records all webhook callbacks received from M-Pesa for debugging and retry
CREATE TABLE IF NOT EXISTS webhook_logs (
  webhook_log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID,
  webhook_payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  processing_status VARCHAR(50) NOT NULL, -- 'SUCCESS', 'FAILED', 'QUEUED_FOR_RETRY'
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE SET NULL
);

-- Indexes for webhook queries
CREATE INDEX IF NOT EXISTS idx_webhook_logs_payment_id ON webhook_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processing_status ON webhook_logs(processing_status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON webhook_logs(received_at);

-- Offline Queue Table
-- Stores payment requests queued during offline mode for batch processing
CREATE TABLE IF NOT EXISTS offline_queue (
  queue_entry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL,
  store_id UUID NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL, -- Amount in cents
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP,
  queued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  error_message TEXT
);

-- Indexes for queue queries
CREATE INDEX IF NOT EXISTS idx_offline_queue_store_id ON offline_queue(store_id);
CREATE INDEX IF NOT EXISTS idx_offline_queue_processed_at ON offline_queue(processed_at);
CREATE INDEX IF NOT EXISTS idx_offline_queue_queued_at ON offline_queue(queued_at);

-- Customer Credit Table
-- Tracks pre-paid funds for each customer per store
CREATE TABLE IF NOT EXISTS customer_credit (
  credit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL,
  store_id UUID NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0, -- Balance in cents
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_transaction_id UUID
);

-- Indexes for credit queries
CREATE INDEX IF NOT EXISTS idx_customer_credit_customer_store ON customer_credit(customer_id, store_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_store_id ON customer_credit(store_id);

-- Add payment-related columns to transactions table if they don't exist
-- Note: This assumes transactions table already exists
-- ALTER TABLE transactions
-- ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(payment_id),
-- ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
-- ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON transactions(payment_id);
