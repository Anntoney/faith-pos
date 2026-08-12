-- Migration: Add M-Pesa payment columns to sales table
-- Requirements: 4.4, 6.5
-- TASK 12: Transaction state management

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_id UUID,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sales_payment_id ON sales(payment_id);

-- Index for webhook lookup by checkout request ID
CREATE INDEX IF NOT EXISTS idx_payments_checkout_request_id
  ON payments(mpesa_checkout_request_id);
