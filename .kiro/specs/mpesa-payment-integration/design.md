# M-Pesa Payment Gateway Integration Design

## Overview

This design document specifies the architecture, components, and implementation approach for integrating M-Pesa payment processing into the existing POS system. The integration enables customers to pay via M-Pesa while maintaining transaction consistency, supporting offline scenarios, and providing reliable reconciliation.

The design prioritizes:
- **Transaction Safety**: Atomicity and consistency in payment and transaction records
- **Reliability**: Graceful handling of timeouts, failures, and network issues
- **Scalability**: Multi-store support with isolated credentials and data
- **Traceability**: Comprehensive audit logs and reconciliation tracking

## Architecture

### High-Level Integration Flow

```
POS Frontend (Next.js)
    ↓
Payment Service (Node.js/Express)
    ├─→ M-Pesa API Client
    ├─→ Payment Repository (Supabase)
    ├─→ Transaction Repository (Supabase)
    └─→ Webhook Handler
    
M-Pesa Platform
    ├─→ Payment Status Updates (Polling)
    └─→ Webhook Callbacks
    
Customer
    └─→ M-Pesa Mobile App
```

### System Components

#### 1. M-Pesa API Client (`backend/src/services/mpesa/MpesaApiClient.ts`)
Abstracts all communication with M-Pesa REST APIs.

**Responsibilities**:
- Initiate STK push payment requests
- Query payment status via callback/polling
- Handle M-Pesa API authentication (OAuth2)
- Map M-Pesa response codes to system status values
- Implement exponential backoff for transient failures

**Methods**:
- `initiatePayment(phone, amount, storeId): Promise<InitiateResponse>`
- `queryPaymentStatus(checkoutRequestId): Promise<StatusResponse>`
- `validateWebhookSignature(signature, payload): boolean`

#### 2. Payment Service (`backend/src/services/PaymentService.ts`)
Orchestrates the payment lifecycle and manages state transitions.

**Responsibilities**:
- Coordinate payment initiation with API client
- Manage payment status polling
- Handle timeout detection and expiration
- Orchestrate reconciliation on completion
- Handle offline queue processing
- Update customer credit when applicable

**Methods**:
- `initiatePayment(transactionId, phone, amount, storeId): Promise<Payment>`
- `pollPaymentStatus(paymentId): Promise<PaymentStatus>`
- `handlePaymentTimeout(paymentId): Promise<void>`
- `processOfflineQueue(): Promise<void>`
- `applyPaymentToCredit(paymentId, customerId): Promise<void>`

#### 3. Webhook Handler (`backend/src/handlers/WebhookHandler.ts`)
Receives and processes M-Pesa webhook callbacks.

**Responsibilities**:
- Validate webhook signatures
- Parse webhook payloads
- Update payment records from webhook data
- Queue webhooks for retry on failure
- Log all webhook processing attempts

**Methods**:
- `handleMpesaWebhook(payload, signature): Promise<WebhookResponse>`
- `retryFailedWebhooks(): Promise<void>`
- `logWebhookAttempt(webhookId, status, error): Promise<void>`

#### 4. Reconciliation Service (`backend/src/services/ReconciliationService.ts`)
Matches payments with transactions and maintains financial accuracy.

**Responsibilities**:
- Match payment records to sales transactions
- Flag orphaned payments for manual review
- Update transaction status to Paid
- Detect and log reconciliation discrepancies
- Generate reconciliation reports

**Methods**:
- `reconcilePayment(paymentId): Promise<ReconciliationResult>`
- `handleOrphanedPayment(paymentId): Promise<void>`
- `generateReconciliationReport(storeId, dateRange): Promise<Report>`

#### 5. Payment Repository (`backend/src/repositories/PaymentRepository.ts`)
Data access layer for payment records.

**Responsibilities**:
- Create, read, update payment records
- Implement proper transactional semantics
- Maintain audit logs of status changes
- Support querying by store, transaction, or date range
- Enforce data validation on write

#### 6. Offline Queue Manager (`backend/src/services/OfflineQueueManager.ts`)
Manages payment requests when connectivity is lost.

**Responsibilities**:
- Queue payment initiation requests when offline
- Detect connectivity restoration
- Process queued requests in FIFO order
- Track retry attempts and failures
- Clean up successfully processed entries

**Methods**:
- `queuePayment(transactionId, phone, amount, storeId): Promise<void>`
- `processQueue(): Promise<void>`
- `detectConnectivity(): Promise<boolean>`

#### 7. POS UI Components (`app/pos/components/MpesaPayment*`)
Frontend components for payment workflow.

**Components**:
- `MpesaPaymentMethod`: Selection and phone number input
- `MpesaPaymentProgress`: Status tracking during payment
- `MpesaPaymentResult`: Success/failure message display
- `MpesaPaymentModal`: Wrapper modal for payment flow

## Components and Interfaces

### Core Data Models

```typescript
// Payment Record
interface Payment {
  payment_id: string;           // UUID
  transaction_id: string;       // Reference to transaction
  store_id: string;             // Store identifier
  phone_number: string;         // Customer M-Pesa account
  amount: number;               // Payment amount in cents
  status: PaymentStatus;        // Initiated | Pending | Completed | Failed | Expired | Cancelled
  mpesa_checkout_request_id: string;  // M-Pesa checkout request ID
  mpesa_response_code: string;  // M-Pesa response code
  error_message: string | null; // Human-readable error
  created_at: timestamp;
  updated_at: timestamp;
  reconciled_at: timestamp | null;
  applied_to_credit: boolean;   // Whether payment was added to customer credit
  customer_id: string | null;   // Optional customer reference
}

enum PaymentStatus {
  Initiated = 'INITIATED',
  Pending = 'PENDING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  Expired = 'EXPIRED',
  Cancelled = 'CANCELLED'
}

// Audit Log Entry
interface PaymentAuditLog {
  audit_log_id: string;
  payment_id: string;
  previous_status: PaymentStatus;
  new_status: PaymentStatus;
  changed_by: string;           // 'system' | 'operator' | 'webhook'
  changed_at: timestamp;
  reason: string;               // Reason for status change
  metadata: JSON;               // Additional context
}

// Webhook Log Entry
interface WebhookLog {
  webhook_log_id: string;
  payment_id: string;
  webhook_payload: JSON;
  signature_valid: boolean;
  processing_status: 'SUCCESS' | 'FAILED' | 'QUEUED_FOR_RETRY';
  error_message: string | null;
  retry_count: number;
  next_retry_at: timestamp | null;
  received_at: timestamp;
  processed_at: timestamp | null;
}

// Offline Queue Entry
interface OfflineQueueEntry {
  queue_entry_id: string;
  transaction_id: string;
  store_id: string;
  phone_number: string;
  amount: number;
  retry_count: number;
  last_retry_at: timestamp | null;
  queued_at: timestamp;
  processed_at: timestamp | null;
  error_message: string | null;
}

// Customer Credit
interface CustomerCredit {
  credit_id: string;
  customer_id: string;
  store_id: string;
  balance: number;              // Balance in cents
  updated_at: timestamp;
  last_transaction_id: string;  // Reference to last transaction affecting this credit
}

// Transaction (extended)
interface Transaction {
  transaction_id: string;
  store_id: string;
  customer_id: string | null;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  payment_method: 'cash' | 'card' | 'mpesa' | 'credit';
  payment_id: string | null;    // Reference to Payment record (if applicable)
  status: 'pending' | 'paid' | 'cancelled';
  created_at: timestamp;
  paid_at: timestamp | null;
}
```

### API Interfaces

#### Payment Initiation Request
```typescript
POST /api/payments/initiate
{
  transaction_id: string;
  phone_number: string;        // Validated phone number (format: 254...)
  amount: number;              // Amount in cents
  store_id: string;
  apply_to_credit?: boolean;   // Default: false
}

Response: 200 OK
{
  payment_id: string;
  checkout_request_id: string;
  status: 'INITIATED';
  message: 'Please enter your M-Pesa PIN'
}

Response: 400 Bad Request
{
  error: 'string';
  details: {
    field?: string;
    reason: string;
  }
}

Response: 502 Bad Gateway
{
  error: 'M-Pesa API unreachable';
  details: {
    message: 'Could not connect to M-Pesa. Please try again.'
  }
}
```

#### Payment Status Query
```typescript
GET /api/payments/:payment_id/status

Response: 200 OK
{
  payment_id: string;
  status: PaymentStatus;
  transaction_id: string;
  amount: number;
  updated_at: timestamp;
}
```

#### Webhook Endpoint
```typescript
POST /api/webhooks/mpesa
Content-Type: application/json
X-M-Pesa-Signature: <signature>

{
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;       // 0 = success, non-zero = failure
      ResultDesc: string;
      Amount: number;
      PhoneNumber: string;
      // Additional M-Pesa fields
    }
  }
}

Response: 200 OK
{
  success: boolean;
  message: string;
}
```

### State Diagram

```
[Initiated]
    ↓ (polling/webhook)
[Pending] → [Completed] → [Reconciled]
    ↓                        ↑
    └─→ [Failed]             │
         ↓                    │
    [Review] ────────────────┘
    
    ↓ (2 min timeout)
[Expired]

[Initiated] → [Cancelled] (operator action)
```

### Sequence Diagrams

#### Success Flow
```
Operator: Selects M-Pesa
    ↓
POS Frontend: Shows phone number input
Operator: Enters phone number
    ↓
Frontend: Calls POST /api/payments/initiate
    ↓
PaymentService: Creates Payment record (INITIATED)
    ↓
MpesaApiClient: Calls M-Pesa STK Push API
    ↓
M-Pesa: Sends prompt to customer phone
    ↓
POS Frontend: Starts polling GET /api/payments/{id}/status (5s interval)
    ↓
Customer: Enters PIN on phone
    ↓
M-Pesa: Sends webhook callback with COMPLETED status
    ↓
WebhookHandler: Validates signature, updates Payment record
    ↓
ReconciliationService: Matches payment to transaction
    ↓
PaymentService: Updates Transaction status to PAID
    ↓
POS Frontend: (polling detects completion) Shows success message
```

#### Timeout Flow
```
PaymentService: Starts payment, sets 2-minute timeout timer
    ↓
(2 minutes elapse without status update)
    ↓
PaymentService: Detects timeout
    ↓
PaymentService: Updates Payment status to EXPIRED
    ↓
PaymentService: Releases transaction lock
    ↓
POS Frontend: (polling detects EXPIRED) Shows "Payment expired" message
    ↓
Operator: Can retry or select different payment method
```

#### Offline Flow
```
POS Frontend: Detects no internet (connection error on API call)
    ↓
OfflineQueueManager: Receives payment initiation request
    ↓
OfflineQueueManager: Adds to offline queue, returns "queued" status
    ↓
POS Frontend: Shows "Offline - will process when online"
    ↓
(internet restored)
    ↓
OfflineQueueManager: Detects connectivity, processes queue
    ↓
PaymentService: Initiates all queued payments in FIFO order
    ↓
MpesaApiClient: Calls M-Pesa API for each queued payment
    ↓
(Processing continues as normal flow)
```

## Data Models

### Database Schema (Supabase)

```sql
-- Payments Table
CREATE TABLE payments (
  payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(transaction_id),
  store_id UUID NOT NULL REFERENCES stores(store_id),
  phone_number VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'INITIATED',
  mpesa_checkout_request_id VARCHAR(255),
  mpesa_response_code VARCHAR(50),
  error_message TEXT,
  applied_to_credit BOOLEAN DEFAULT FALSE,
  customer_id UUID REFERENCES customers(customer_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reconciled_at TIMESTAMP,
  INDEX idx_store_id (store_id),
  INDEX idx_transaction_id (transaction_id),
  INDEX idx_status_store (status, store_id),
  INDEX idx_created_at (created_at)
);

-- Payment Audit Log Table
CREATE TABLE payment_audit_logs (
  audit_log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(payment_id),
  previous_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  changed_by VARCHAR(50) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  metadata JSONB,
  INDEX idx_payment_id (payment_id),
  INDEX idx_changed_at (changed_at)
);

-- Webhook Log Table
CREATE TABLE webhook_logs (
  webhook_log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(payment_id),
  webhook_payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  processing_status VARCHAR(50) NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  INDEX idx_payment_id (payment_id),
  INDEX idx_processing_status (processing_status),
  INDEX idx_received_at (received_at)
);

-- Offline Queue Table
CREATE TABLE offline_queue (
  queue_entry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(store_id),
  phone_number VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP,
  queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  error_message TEXT,
  INDEX idx_store_id (store_id),
  INDEX idx_processed_at (processed_at),
  INDEX idx_queued_at (queued_at)
);

-- Extend Transactions Table (if not already present)
ALTER TABLE transactions
ADD COLUMN payment_id UUID REFERENCES payments(payment_id),
ADD COLUMN payment_method VARCHAR(50),
ADD COLUMN paid_at TIMESTAMP,
ADD INDEX idx_payment_id (payment_id);

-- Customer Credit Table
CREATE TABLE customer_credit (
  credit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  store_id UUID NOT NULL REFERENCES stores(store_id),
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_transaction_id UUID,
  INDEX idx_customer_id_store_id (customer_id, store_id),
  INDEX idx_store_id (store_id)
);
```

## Error Handling

### M-Pesa API Error Codes (Mapped)

| M-Pesa Code | Description | User Message | Action |
|---|---|---|---|
| 0 | Success | Payment processing | Continue to polling |
| 1001 | Incorrect password | Invalid M-Pesa credentials | Contact support |
| 1002 | Transaction timed out | Customer didn't enter PIN | Show timeout message |
| 1032 | Transaction cancelled by customer | Customer cancelled payment | Show cancellation message |
| 1037 | Duplicate transaction | Duplicate request | Retry with new request ID |
| 500.x | System error | M-Pesa service temporarily unavailable | Suggest retry |

### System Error Scenarios

| Scenario | Detection | Recovery |
|---|---|---|
| Network timeout during payment initiation | No response within 30 seconds | Queue for offline or show error |
| M-Pesa webhook not received within timeout | 2 minutes without status update | Mark EXPIRED, allow retry |
| Orphaned payment (no matching transaction) | Reconciliation detects mismatch | Flag for manual review |
| Database transaction failure | Transaction commit error | Rollback, retry, log for alert |
| Webhook signature invalid | Signature validation fails | Log security event, ignore webhook |
| Offline queue processing fails | Retry attempt fails 3 times | Mark as failed, log for manual review |

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property-Based Testing Overview

Property-based testing (PBT) validates software correctness by testing universal properties across many generated inputs. Each property is a formal specification that should hold for all valid inputs.

### Core Principles

1. **Universal Quantification**: Every property must contain an explicit "for all" statement
2. **Requirements Traceability**: Each property must reference the requirements it validates
3. **Executable Specifications**: Properties must be implementable as automated tests
4. **Comprehensive Coverage**: Properties should cover all testable acceptance criteria

### Correctness Properties

#### Property 1: Phone Number Input Triggers API Call
*For any* valid M-Pesa phone number, initiating a payment with that phone number SHALL result in an M-Pesa API call being made with the correct parameters.

**Validates: Requirements 1.2**

#### Property 2: API Error Codes Trigger Error Display
*For any* M-Pesa API response with a 400-series or 500-series error code, the POS_System SHALL display a user-friendly error message and not mark the transaction as paid.

**Validates: Requirements 1.4**

#### Property 3: Payment Initiation Persistence
*For any* successful payment initiation, the system SHALL store a payment record in the database with status INITIATED, the correct transaction_id, phone_number, amount, and a created_at timestamp.

**Validates: Requirements 1.5**

#### Property 4: Payment Status Polling Interval
*For any* payment in INITIATED status, the system SHALL make API calls to check payment status at approximately 5-second intervals (with ±1 second tolerance).

**Validates: Requirements 2.1**

#### Property 5: Completed Payment Updates All Records
*For any* completed payment, the system SHALL atomically update the payment record status to COMPLETED, mark the associated transaction as PAID, and update customer credit balance if apply_to_credit was true.

**Validates: Requirements 2.2, 7.3**

#### Property 6: Failed Payment Updates With Reason
*For any* failed payment from M-Pesa, the system SHALL update the payment record status to FAILED, store the failure reason in error_message, and make that reason visible to the operator.

**Validates: Requirements 2.3**

#### Property 7: UI Updates Reflect Status Changes
*For any* payment status change detected by polling, the frontend UI SHALL reflect the new status within 1 second of detection.

**Validates: Requirements 2.5**

#### Property 8: Payment Timeout Expires After 120 Seconds
*For any* payment that does not receive a status update within 120 seconds (2 minutes), the system SHALL mark the payment as EXPIRED and release the transaction lock.

**Validates: Requirements 2.4, 5.1**

#### Property 9: Webhook Signature Validation
*For any* webhook callback, the system SHALL validate the signature is authentic before processing; webhooks with invalid signatures SHALL be rejected and logged.

**Validates: Requirements 3.1**

#### Property 10: Valid Webhooks Update Payment Status
*For any* valid webhook callback containing payment status data, the system SHALL update the corresponding payment record with the new status.

**Validates: Requirements 3.2**

#### Property 11: Completion Webhooks Trigger Reconciliation
*For any* webhook callback indicating payment completion (result code 0), the system SHALL invoke the ReconciliationService to match the payment with its transaction.

**Validates: Requirements 3.3**

#### Property 12: Webhook Logging Completeness
*For any* valid webhook processed, the system SHALL store a webhook log entry containing timestamp, payload, signature validity, processing status, and any error message.

**Validates: Requirements 3.5**

#### Property 13: Failed Webhooks Queue for Retry
*For any* webhook callback that fails to process on first attempt, the system SHALL queue it for retry with exponential backoff (delays: 30s, 2m, 8m, with maximum 3 retries).

**Validates: Requirements 3.6**

#### Property 14: Payment-to-Transaction Reconciliation
*For any* completed payment, the ReconciliationService SHALL find the matching transaction by matching payment_id, store_id, and amount within 5 seconds of payment completion.

**Validates: Requirements 4.1**

#### Property 15: Successful Reconciliation Updates Both Records
*For any* successfully reconciled payment, the system SHALL mark the payment as reconciled_at timestamp, mark the transaction as PAID, and both records SHALL show reconciled = true.

**Validates: Requirements 4.2**

#### Property 16: Transaction Cancellation Reverts Payment
*For any* cancelled sales transaction with an associated payment, the system SHALL revert the payment status to CANCELLED and release any holds on the transaction.

**Validates: Requirements 4.4**

#### Property 17: Credit Application on Reconciliation
*For any* completed payment with apply_to_credit = true, reconciliation SHALL update the customer's credit balance by adding the payment amount.

**Validates: Requirements 4.5, 9.2**

#### Property 18: Payment Retry After Failure
*For any* failed or expired payment, the operator SHALL be able to initiate a new payment for the same transaction without re-entering transaction details (amount, items remain in context).

**Validates: Requirements 5.5**

#### Property 19: Multi-Store Payment Isolation
*For any* payment initiated from store A, querying payment records as store B SHALL not return that payment; all payment queries SHALL filter by store_id.

**Validates: Requirements 6.1, 6.2**

#### Property 20: Webhook Store ID Validation
*For any* webhook callback received by store A with a store_id in the payload that differs from store A's ID, the webhook SHALL be rejected and logged as a security event.

**Validates: Requirements 6.3**

#### Property 21: Store Credential Isolation
*For any* payment initiated from store A, the system SHALL use store A's M-Pesa credentials; updating store A's credentials SHALL not affect payments from store B.

**Validates: Requirements 6.4**

#### Property 22: Reconciliation Store Isolation
*For any* reconciliation process, matching SHALL only occur between payments and transactions from the same store_id.

**Validates: Requirements 6.5**

#### Property 23: Payment Record Schema Completeness
*For any* payment record stored in the database, it SHALL contain all required fields: payment_id, transaction_id, store_id, phone_number, amount, status, created_at, updated_at, and reconciled_at (nullable).

**Validates: Requirements 7.1**

#### Property 24: Audit Log Captures Status Changes
*For any* payment status change, the system SHALL create an audit log entry with previous_status, new_status, changed_by, changed_at, and reason.

**Validates: Requirements 7.2**

#### Property 25: Payment Data Validation on Creation
*For any* payment record creation, if required fields are missing or invalid (e.g., phone_number doesn't match expected format, amount is negative), the system SHALL reject creation and return a validation error.

**Validates: Requirements 7.4**

#### Property 26: Payment History Ordering and Pagination
*For any* query retrieving payment history, results SHALL be ordered by created_at descending, support limit/offset parameters, and return consistent results across paginated queries.

**Validates: Requirements 7.5**

#### Property 27: Offline Mode Activation
*When* the POS system detects network connectivity loss (connection timeout or error), it SHALL switch to offline mode and queue subsequent payment initiation requests.

**Validates: Requirements 8.1**

#### Property 28: Offline Queue FIFO Processing
*For any* offline queue, when connectivity is restored, the system SHALL process queued payments in FIFO order (first queued = first processed).

**Validates: Requirements 8.3**

#### Property 29: Non-Blocking Offline Transactions
*While* in offline mode, creating new transactions SHALL not be blocked; transactions SHALL be created and payment initiation requests SHALL be queued for later processing.

**Validates: Requirements 8.6**

#### Property 30: Queued Payment Processing
*For any* payment in the offline queue when connectivity restores, the system SHALL retrieve it from the queue and initiate it with M-Pesa API.

**Validates: Requirements 8.4**

#### Property 31: Offline Queue Retry Tracking
*For any* queued payment that fails to process, the system SHALL increment retry_count, log the error_message, and attempt retry up to 3 times with exponential backoff.

**Validates: Requirements 8.5**

#### Property 32: Credit Option Available for M-Pesa
*When* a customer selects M-Pesa as payment method, the system SHALL offer an option to apply the payment to customer credit.

**Validates: Requirements 9.1**

#### Property 33: Sufficient Credit Validation
*For any* transaction applying customer credit, if the available credit balance is less than the required amount, the system SHALL reject the credit application and prevent transaction completion.

**Validates: Requirements 9.4**

#### Property 34: Credit Transaction Recording
*For any* payment applied to customer credit, the system SHALL create or update a transaction record with the credit added, referencing the M-Pesa payment_id.

**Validates: Requirements 9.5**

#### Property 35: Credentials Validation Before Save
*When* a store's M-Pesa credentials are configured, the system SHALL validate connectivity to M-Pesa API (test call) before persisting credentials to configuration.

**Validates: Requirements 10.2**

#### Property 36: Store-Specific Credential Retrieval
*For any* payment processing, the system SHALL fetch and use the store-specific M-Pesa credentials (not credentials from another store).

**Validates: Requirements 10.3**

#### Property 37: Credential Update Propagation
*When* M-Pesa credentials are updated for a store, all subsequent API calls from that store SHALL use the new credentials within 10 seconds (without system restart).

**Validates: Requirements 10.4**

#### Property 38: Invalid Credentials Error Handling
*When* payment initiation is attempted with invalid or expired M-Pesa credentials, the system SHALL log an error with credential context and display a message: "M-Pesa configuration error. Please contact support."

**Validates: Requirements 10.5**

#### Property 39: Error Logging Completeness
*For any* error occurring in M-Pesa integration components, the system SHALL log a message containing: ISO timestamp, error code, error message, store_id, transaction_id (if applicable), and payment_id (if applicable).

**Validates: Requirements 12.1**

#### Property 40: API Failure Logging
*For any* M-Pesa API call that fails, the system SHALL log the HTTP status code, request method/endpoint, request headers (excluding sensitive auth), response status, and response body (if available).

**Validates: Requirements 12.2**

#### Property 41: Webhook Failure Logging
*For any* webhook callback that fails to process, the system SHALL log the webhook payload and a description of the processing failure reason.

**Validates: Requirements 12.3**

#### Property 42: Timeout Logging
*When* a payment reaches the 2-minute timeout threshold, the system SHALL log: payment_id, exact elapsed time in milliseconds, and reason ("No status update received within timeout period").

**Validates: Requirements 12.4**

## Testing Strategy

### Dual Testing Approach

The correctness properties defined above will be validated using two complementary approaches:

#### 1. Property-Based Testing (PBT)

Property-based tests verify universal properties across many generated inputs. These tests:
- Generate randomized valid inputs (phone numbers, amounts, store IDs, etc.)
- Execute the system with each input
- Assert that the property holds true for all executions
- Run minimum 100 iterations per property to ensure coverage
- Are tagged with references to design properties

**Property Test Configuration**:
- Framework: `fast-check` (for Node.js/TypeScript)
- Minimum iterations: 100 per property
- Tag format in code: `// Feature: mpesa-payment-integration, Property N: [Property Title]`
- Each test file validates 3-5 related properties

**Property Test Organization**:
- `tests/properties/payment-initiation.property.ts`: Properties 1-3
- `tests/properties/payment-status.property.ts`: Properties 4-8
- `tests/properties/webhook-handling.property.ts`: Properties 9-13
- `tests/properties/reconciliation.property.ts`: Properties 14-17
- `tests/properties/multi-store.property.ts`: Properties 19-22
- `tests/properties/offline-mode.property.ts`: Properties 27-31
- `tests/properties/customer-credit.property.ts`: Properties 32-34
- `tests/properties/configuration.property.ts`: Properties 35-38
- `tests/properties/error-logging.property.ts`: Properties 39-42

#### 2. Unit Testing

Unit tests validate specific examples, edge cases, and integration scenarios that property tests may not fully cover:

**Unit Test Focus Areas**:
- Specific error scenarios: network errors, database failures, malformed webhooks
- Edge cases: timeout at exactly 120 seconds, empty offline queue, orphaned payments
- UI integration: button clicks, form submission, component rendering
- Database operations: concurrent updates, transaction rollback scenarios
- Configuration validation: invalid credentials, connectivity failures

**Unit Test Organization**:
- `tests/unit/payment.service.spec.ts`: Payment service methods
- `tests/unit/webhook.handler.spec.ts`: Webhook processing
- `tests/unit/reconciliation.service.spec.ts`: Reconciliation logic
- `tests/unit/offline-queue.spec.ts`: Offline queue management
- `tests/unit/mpesa-api-client.spec.ts`: M-Pesa API interactions
- `tests/unit/customer-credit.spec.ts`: Credit operations

### Test Execution Flow

1. **Unit tests** run first (fast feedback, ~500ms)
2. **Property tests** run next (comprehensive validation, ~5-10s depending on iteration count)
3. **Integration tests** run last (end-to-end flows, ~30s)

### Mocking Strategy

**External Dependencies Mocked**:
- M-Pesa API calls → Mock responses with various status codes and result codes
- Supabase database → In-memory mock or local PostgreSQL for testing
- Network connectivity → Simulated with controllable connection state
- Timestamps → Frozen or mocked for timeout testing

**Real Components Tested**:
- Payment status state machine
- Reconciliation matching logic
- Offline queue processing
- Error handling paths
- Audit log creation

### Coverage Goals

- **Line coverage**: Minimum 85% for payment-critical paths
- **Branch coverage**: 100% for error handling paths
- **Property coverage**: Every correctness property has at least one property-based test
- **Edge case coverage**: Every identified edge case (timeouts, orphaned payments, etc.) has specific unit tests

