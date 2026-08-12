# Implementation Plan: M-Pesa Payment Gateway Integration

## Overview

This implementation plan breaks down the M-Pesa integration feature into discrete coding steps. The approach prioritizes core payment functionality first, then layers on reconciliation, offline support, and multi-store isolation. Each step builds on previous steps, with property-based tests validating correctness properties and unit tests covering edge cases.

## Implementation Language

**TypeScript** (for both frontend and backend)
- Frontend: React components in Next.js
- Backend: Node.js with Express
- Testing: fast-check for property-based testing, Jest for unit tests

## Tasks

### Phase 1: Core Infrastructure and Data Layer

- [x] 1. Set up project structure and database schema
  - Create directories: `backend/src/services/mpesa/`, `backend/src/repositories/`, `backend/src/handlers/`, `backend/src/types/`
  - Create directory: `app/pos/components/MpesaPayment/` for frontend components
  - Create TypeScript interfaces file: `backend/src/types/payment.ts` with Payment, PaymentStatus, PaymentAuditLog interfaces
  - Create database migration file for payments, payment_audit_logs, webhook_logs, offline_queue tables
  - Run migration to create all tables and indexes in Supabase
  - Create environment variables file: `.env.local` with M-Pesa API credentials template
  - _Requirements: 7.1, 10.1_

- [x] 2. Create M-Pesa API Client
  - Create `backend/src/services/mpesa/MpesaApiClient.ts` with methods: `initiatePayment()`, `queryPaymentStatus()`, `validateWebhookSignature()`
  - Implement OAuth2 authentication with M-Pesa using consumer_key and consumer_secret
  - Add exponential backoff retry logic for transient API failures (max 3 retries)
  - Add error mapping from M-Pesa error codes to human-readable messages
  - Create unit tests for each method with mocked M-Pesa responses
  - _Requirements: 1.2, 1.4, 10.3_

- [x] 3. Create Payment Repository
  - Create `backend/src/repositories/PaymentRepository.ts` with CRUD methods: `create()`, `findById()`, `findByStore()`, `updateStatus()`, `updateReconciled()`
  - Implement data validation on write (required fields, format validation)
  - Implement findByStore() to filter payments by store_id
  - Add pagination support with limit/offset parameters
  - Create method to create audit log entries on status changes
  - Create unit tests for all repository methods with Supabase mocks
  - _Requirements: 7.1, 7.4, 7.5_

### Phase 2: Payment Initiation and Basic Status Tracking

- [x] 4. Create Payment Service
  - Create `backend/src/services/PaymentService.ts` with method: `initiatePayment(transactionId, phone, amount, storeId, applyToCredit)`
  - Validate phone number format (254-prefixed format)
  - Create Payment record with status INITIATED
  - Call MpesaApiClient.initiatePayment()
  - Handle API errors and map to user-friendly messages
  - Return payment_id and checkout_request_id to frontend
  - Create unit tests for successful and failed initiation scenarios
  - _Requirements: 1.2, 1.5, 1.4_

- [ ]* 4.1 Write property test for payment initiation
  - **Property 1: Phone Number Input Triggers API Call**
  - **Property 2: API Error Codes Trigger Error Display**
  - **Property 3: Payment Initiation Persistence**
  - **Validates: Requirements 1.2, 1.4, 1.5**

- [x] 5. Create Payment Status Polling
  - Add method `pollPaymentStatus(paymentId)` to PaymentService
  - Implement polling loop that queries M-Pesa API at 5-second intervals
  - Update payment record status based on M-Pesa response
  - Handle payment completion: call ReconciliationService.reconcilePayment()
  - Handle payment failure: update error_message and display to operator
  - Create HTTP GET endpoint: `GET /api/payments/:payment_id/status`
  - Create unit tests for polling with various M-Pesa response codes
  - _Requirements: 2.1, 2.2, 2.3_

- [ ]* 5.1 Write property test for status polling
  - **Property 4: Payment Status Polling Interval**
  - **Property 5: Completed Payment Updates All Records**
  - **Property 6: Failed Payment Updates With Reason**
  - **Property 7: UI Updates Reflect Status Changes**
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**

- [x] 6. Implement Payment Timeout Detection
  - Add timeout mechanism to PaymentService: set 2-minute timer on payment initiation
  - Implement method `handlePaymentTimeout(paymentId)` to mark payment as EXPIRED
  - Release transaction lock and cancel pending state
  - Create timer cleanup to prevent memory leaks
  - Update payment record with EXPIRED status and appropriate error message
  - Create unit tests for timeout at exactly 120 seconds
  - _Requirements: 2.4, 5.1_

- [ ]* 6.1 Write edge-case test for timeout boundary
  - Test payment status exactly at 120-second mark
  - **Validates: Requirements 2.4, 5.1**


### Phase 3: Webhook Handling and Reconciliation

- [x] 7. Create Webhook Handler
  - Create `backend/src/handlers/WebhookHandler.ts` with method: `handleMpesaWebhook(payload, signature)`
  - Implement signature validation using M-Pesa public key
  - Parse webhook payload and extract payment status, result code, etc.
  - Create HTTP POST endpoint: `POST /api/webhooks/mpesa`
  - Validate store_id in webhook matches current store
  - Create WebhookLog entry for all received webhooks
  - Return 200 OK for all valid webhooks (even if processing fails)
  - Create unit tests for valid and invalid signatures
  - _Requirements: 3.1, 3.2, 3.5_

- [ ]* 7.1 Write property test for webhook handling
  - **Property 9: Webhook Signature Validation**
  - **Property 10: Valid Webhooks Update Payment Status**
  - **Property 12: Webhook Logging Completeness**
  - **Validates: Requirements 3.1, 3.2, 3.5**

- [x] 8. Create Webhook Retry Mechanism
  - Add method `queueWebhookForRetry(webhookId, retryCount)` to WebhookHandler
  - Implement exponential backoff: 30s, 2m, 8m (max 3 retries)
  - Create background job to process queued webhooks: `processFailedWebhooks()`
  - Update WebhookLog with retry_count and next_retry_at
  - Create unit tests for retry logic and queue processing
  - _Requirements: 3.6_

- [ ]* 8.1 Write property test for webhook retries
  - **Property 13: Failed Webhooks Queue for Retry**
  - **Validates: Requirements 3.6**

- [x] 9. Create Reconciliation Service
  - Create `backend/src/services/ReconciliationService.ts` with method: `reconcilePayment(paymentId)`
  - Query Transaction by transaction_id matching payment record
  - Verify store_id matches between payment and transaction
  - Verify amount matches (within cents precision)
  - Mark both Payment and Transaction as reconciled
  - Set Transaction status to PAID and paid_at timestamp
  - Create AuditLog entry for successful reconciliation
  - Create unit tests for successful and failed reconciliation scenarios
  - _Requirements: 4.1, 4.2, 6.5_

- [ ]* 9.1 Write property test for reconciliation
  - **Property 14: Payment-to-Transaction Reconciliation**
  - **Property 15: Successful Reconciliation Updates Both Records**
  - **Property 22: Reconciliation Store Isolation**
  - **Validates: Requirements 4.1, 4.2, 6.5**

- [x] 10. Handle Orphaned Payments
  - Add method `handleOrphanedPayment(paymentId)` to ReconciliationService
  - Detect when payment has no matching transaction
  - Mark payment with flag for manual review
  - Create AuditLog entry with reason "No matching transaction found"
  - Create HTTP GET endpoint to retrieve orphaned payments: `GET /api/payments/orphaned`
  - Create unit tests for orphaned payment detection and logging
  - _Requirements: 4.3_

- [ ]* 10.1 Write edge-case test for orphaned payments
  - Test webhook for payment with non-existent transaction
  - **Validates: Requirements 4.3**


### Phase 4: Multi-Store and Transaction Isolation

- [x] 11. Implement Multi-Store Payment Isolation
  - Add store_id parameter to all payment queries
  - Add store_id validation in PaymentService.initiatePayment()
  - Add store_id check in WebhookHandler for webhook authentication
  - Ensure ReconciliationService only matches payments and transactions from same store
  - Update all repository queries to filter by store_id
  - Create unit tests verifying store A payments are not visible to store B
  - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [ ]* 11.1 Write property test for store isolation
  - **Property 19: Multi-Store Payment Isolation**
  - **Property 20: Webhook Store ID Validation**
  - **Property 21: Store Credential Isolation**
  - **Property 22: Reconciliation Store Isolation**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**

- [x] 12. Implement Transaction State Management
  - Add payment_method field to Transaction model
  - Add payment_id foreign key to Transaction
  - Implement transaction locking mechanism during payment processing
  - Add method to Transaction repository: `lockTransaction(transactionId)` and `unlockTransaction(transactionId)`
  - Implement transaction cancellation: `cancelTransaction(transactionId)` which reverts associated payment status
  - Create unit tests for transaction state transitions
  - _Requirements: 4.4_

- [ ]* 12.1 Write property test for transaction cancellation
  - **Property 16: Transaction Cancellation Reverts Payment**
  - **Validates: Requirements 4.4**

### Phase 5: Customer Credit Integration

- [x] 13. Create Customer Credit Service
  - Create `backend/src/services/CustomerCreditService.ts`
  - Add method `applyPaymentToCredit(paymentId, customerId, amount)`
  - Update customer_credit.balance by adding amount
  - Create transaction record referencing the M-Pesa payment_id
  - Add method `getCustomerCredit(customerId, storeId)` to retrieve balance
  - Add method `deductCredit(customerId, storeId, amount)` for purchase
  - Validate sufficient balance before deducting
  - Create unit tests for credit operations
  - _Requirements: 9.2, 9.3, 9.4_

- [ ]* 13.1 Write property test for customer credit
  - **Property 17: Credit Application on Reconciliation**
  - **Property 32: Credit Option Available for M-Pesa**
  - **Property 33: Sufficient Credit Validation**
  - **Property 34: Credit Transaction Recording**
  - **Validates: Requirements 9.2, 9.3, 9.4, 9.1, 9.5**

- [x] 14. Update Payment Service for Credit
  - Modify PaymentService.initiatePayment() to accept apply_to_credit parameter
  - Store apply_to_credit flag in Payment record
  - When payment completes with apply_to_credit=true, call CustomerCreditService.applyPaymentToCredit()
  - Update ReconciliationService to handle credit application on completion
  - Create unit tests for credit application workflows
  - _Requirements: 9.2_

### Phase 6: Offline Mode Support

- [x] 15. Create Offline Queue Manager
  - Create `backend/src/services/OfflineQueueManager.ts`
  - Add method `queuePayment(transactionId, phone, amount, storeId)` for offline requests
  - Create HTTP endpoint to add to queue: `POST /api/payments/queue` (returns queued status)
  - Implement connectivity detection using HTTP heartbeat check
  - Add method `processQueue()` to handle queued payments in FIFO order
  - Process each queued payment through normal PaymentService.initiatePayment() flow
  - Update retry_count and error_message on failure
  - Create unit tests for queue operations
  - _Requirements: 8.1, 8.3, 8.4, 8.5_

- [ ]* 15.1 Write property test for offline queue
  - **Property 27: Offline Mode Activation**
  - **Property 28: Offline Queue FIFO Processing**
  - **Property 30: Queued Payment Processing**
  - **Property 31: Offline Queue Retry Tracking**
  - **Validates: Requirements 8.1, 8.3, 8.4, 8.5**

- [x] 16. Implement Offline Mode Detection
  - Create middleware to detect network errors in PaymentService
  - When network error detected, route payment request to OfflineQueueManager instead of API
  - Add connectivity check: periodic HTTP request to M-Pesa API (or simple health check)
  - On connectivity restoration, trigger OfflineQueueManager.processQueue()
  - Return offline mode status in `GET /api/system/status` endpoint
  - Create unit tests for connectivity detection and mode switching
  - _Requirements: 8.1, 8.2_

- [ ]* 16.1 Write property test for non-blocking offline transactions
  - **Property 29: Non-Blocking Offline Transactions**
  - **Validates: Requirements 8.6**


### Phase 7: Configuration and Credentials

- [x] 17. Create Configuration Service
  - Create `backend/src/services/ConfigurationService.ts`
  - Add method `validateAndSaveStoreCredentials(storeId, apiKey, consumerKey, consumerSecret, businessShortCode)`
  - Implement credential validation by making test API call to M-Pesa
  - Store credentials securely in environment variables or secrets manager (use Node process.env)
  - Add method `getStoreCredentials(storeId)` to retrieve store-specific credentials
  - Add method `rotateCredentials(storeId, newApiKey)` for credential updates
  - Ensure new credentials are used immediately without restart
  - Create unit tests for credential validation and retrieval
  - _Requirements: 10.2, 10.3, 10.4_

- [ ]* 17.1 Write property test for credentials
  - **Property 35: Credentials Validation Before Save**
  - **Property 36: Store-Specific Credential Retrieval**
  - **Property 37: Credential Update Propagation**
  - **Validates: Requirements 10.2, 10.3, 10.4**

- [x] 18. Create Error Handling for Invalid Credentials
  - Add method `handleInvalidCredentials(storeId, error)` to PaymentService
  - Log error with store_id, error code, and message
  - Return user-friendly error: "M-Pesa configuration error. Please contact support."
  - Prevent payment initiation with invalid credentials
  - Create unit tests for invalid credential scenarios
  - _Requirements: 10.5_

- [ ]* 18.1 Write property test for invalid credentials
  - **Property 38: Invalid Credentials Error Handling**
  - **Validates: Requirements 10.5**

### Phase 8: Error Logging and Observability

- [x] 19. Create Comprehensive Error Logging
  - Create `backend/src/services/LoggingService.ts` with method: `logPaymentError(error, context)`
  - Implement structured logging with timestamp, error code, message, store_id, transaction_id, payment_id
  - Create method `logApiError(error, request, response)` for M-Pesa API failures
  - Log HTTP status, method, endpoint, request headers (without sensitive info), response status, body
  - Create method `logWebhookError(webhook, error, reason)` for webhook failures
  - Create method `logTimeoutError(paymentId, elapsedTime)` for timeout events
  - Store logs in centralized location (file, cloud logging, etc.)
  - Create unit tests for logging completeness
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ]* 19.1 Write property test for error logging
  - **Property 39: Error Logging Completeness**
  - **Property 40: API Failure Logging**
  - **Property 41: Webhook Failure Logging**
  - **Property 42: Timeout Logging**
  - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**

### Phase 9: API Endpoints and Integration

- [x] 20. Create Payment API Endpoints
  - Create `backend/src/routes/payments.routes.ts` with routes:
    - `POST /api/payments/initiate` - Payment initiation
    - `GET /api/payments/:payment_id/status` - Status check
    - `POST /api/webhooks/mpesa` - Webhook callback
    - `GET /api/payments/store/:store_id` - Payment history (paginated)
  - Add input validation middleware for all endpoints
  - Add error handling middleware to catch and log errors
  - Return proper HTTP status codes (200, 400, 502, etc.)
  - Create integration tests for all endpoints
  - _Requirements: 1.2, 2.1, 3.2_

- [x] 21. Add Data Validation Middleware
  - Create middleware: `validatePaymentRequest()` to validate phone number, amount, store_id
  - Create middleware: `validateWebhookRequest()` to validate webhook signature
  - Add proper error responses for validation failures
  - Create unit tests for validation middleware
  - _Requirements: 1.4, 3.1, 7.4_


### Phase 10: Frontend UI Components

- [x] 22. Create M-Pesa Payment UI Components
  - Create `app/pos/components/MpesaPayment/MpesaPaymentMethod.tsx` - Selection and phone input
  - Create `app/pos/components/MpesaPayment/MpesaPaymentProgress.tsx` - Status progress indicator
  - Create `app/pos/components/MpesaPayment/MpesaPaymentResult.tsx` - Success/failure message
  - Create `app/pos/components/MpesaPayment/MpesaPaymentModal.tsx` - Wrapper modal component
  - Implement phone number input with real-time validation
  - Implement error message display for API failures
  - Create component tests for rendering and user interactions
  - _Requirements: 11.1, 11.2, 11.4_

- [x] 23. Integrate M-Pesa into Checkout Flow
  - Update `app/pos/page.tsx` (or checkout component) to include M-Pesa payment option
  - Add M-Pesa option to payment method selector alongside cash, card, credit
  - Connect M-Pesa payment button to call `POST /api/payments/initiate`
  - Implement polling loop to call `GET /api/payments/:payment_id/status` every 5 seconds
  - Display payment result (success/failure/timeout) after polling completes
  - Handle timeout: display timeout message and allow retry
  - Create component integration tests
  - _Requirements: 1.2, 2.1, 2.5, 5.1, 5.2, 5.5_

- [x] 24. Add Payment Status UI Display
  - Create component to display payment status: "Initiated", "Awaiting confirmation", "Processing"
  - Show progress indicator during payment processing
  - Display error messages with clear next actions for operator
  - Show success message with transaction confirmation when payment completes
  - Create unit tests for status display components
  - _Requirements: 2.5, 11.3, 11.4, 11.5_

- [x] 25. Add Offline Mode Indicator
  - Add UI indicator showing system is in offline mode
  - Display on POS page when connectivity is lost
  - Show clear message: "System Offline - Payments will be processed when online"
  - Hide M-Pesa button or show "Offline" state during offline mode
  - Update indicator when connectivity is restored
  - Create unit tests for offline indicator
  - _Requirements: 8.2_

### Phase 11: Integration and Testing

- [~] 26. Create Integration Tests
  - Write end-to-end test: successful payment flow (initiate → complete → reconcile)
  - Write end-to-end test: failed payment flow (initiate → failure → retry)
  - Write end-to-end test: timeout flow (initiate → expire after 2 min → retry)
  - Write end-to-end test: webhook callback flow (webhook received → payment updated → reconciled)
  - Write end-to-end test: offline flow (initiate offline → queue → process on restore)
  - Write end-to-end test: credit application flow (initiate → complete → credit updated)
  - All integration tests with real Supabase mock and M-Pesa mocks
  - _Requirements: Multiple_

- [~] 27. Implement Database Audit Trail
  - Add triggers to audit all changes to payment records
  - Verify audit_logs table captures all status changes
  - Verify previous_status and new_status are correctly recorded
  - Create query to retrieve full payment history with all status changes
  - Create unit tests for audit trail completeness
  - _Requirements: 7.2_

- [ ]* 27.1 Write property test for audit trail
  - **Property 24: Audit Log Captures Status Changes**
  - **Validates: Requirements 7.2**

### Phase 12: Data Integrity and Final Testing

- [~] 28. Verify Payment Record Schema and Completeness
  - Ensure all payment records contain required fields: payment_id, transaction_id, store_id, phone_number, amount, status, created_at, updated_at
  - Verify immutability of payment records (no updates to created_at or phone_number after creation)
  - Create database constraints to enforce schema completeness
  - Create unit tests validating schema enforcement
  - _Requirements: 7.1, 7.3_

- [ ]* 28.1 Write property test for data completeness
  - **Property 23: Payment Record Schema Completeness**
  - **Property 25: Payment Data Validation on Creation**
  - **Validates: Requirements 7.1, 7.4_

- [~] 29. Verify Multi-Store Data Isolation
  - Create test to verify store A cannot query store B payments
  - Create test to verify store A cannot process store B webhooks
  - Verify reconciliation respects store boundaries
  - Verify orphaned payment detection per-store
  - Create audit log showing all cross-store access attempts
  - _Requirements: 6.1, 6.2, 6.3, 4.3_

- [~] 30. Verify Payment History Pagination
  - Test that payment history queries return results ordered by created_at descending
  - Test limit/offset pagination returns correct subsets
  - Test pagination consistency across repeated queries
  - Create unit tests for pagination edge cases (empty results, boundary conditions)
  - _Requirements: 7.5_

- [ ]* 30.1 Write property test for pagination
  - **Property 26: Payment History Ordering and Pagination**
  - **Validates: Requirements 7.5**


### Phase 13: Checkpoint and Final Validation

- [x] 31. Checkpoint - All core functionality passing
  - Ensure all property-based tests pass (minimum 100 iterations each per property)
  - Ensure all unit tests pass without errors
  - Ensure all integration tests pass without errors
  - Run code coverage check: minimum 85% for payment-critical paths (Payment*, Reconciliation*, Webhook*, Offline* services)
  - Verify no console errors or warnings in frontend tests
  - Verify no TypeScript compilation errors in backend
  - Fix any failing tests and re-run suite
  - Review test logs for any warnings or issues
  - Ask the user if questions arise about any test failures or implementation details.

- [~] 32. Verify End-to-End Workflows
  - Test complete payment success workflow: select M-Pesa → enter phone → receive STK push confirmation → payment completes → transaction reconciles → UI shows success
  - Test failure recovery workflow: payment fails → operator sees error reason → operator retries → new payment initiated
  - Test timeout handling: payment initiated → 2 minutes elapse → system marks EXPIRED → operator can retry
  - Test offline queue workflow: connectivity lost → payment queued → connectivity restored → queued payment processed
  - Test credit application: payment with apply_to_credit=true → credit balance updated → customer credit reflected in system
  - Test multi-store isolation: store A initiates payment → verify store B cannot see payment → verify store A credentials used
  - Document results and any issues found
  - _Requirements: 1.2, 2.4, 8.1, 9.2, 6.1_

- [~] 33. Verify Error Handling and Logging
  - Verify all error paths produce logs with required fields: timestamp, error code, message, store_id, transaction_id
  - Verify M-Pesa API errors log HTTP status, method, endpoint, request/response details
  - Verify webhook processing failures log payload and failure reason
  - Verify timeout events log payment_id and elapsed time in milliseconds
  - Test that invalid credentials prevent payment initiation and display correct error message
  - Verify orphaned payments are flagged and logged for manual review
  - Create manual audit of logs for completeness and proper formatting
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 10.5, 4.3_

- [~] 34. Final checkpoint - All tests passing and system stable
  - Run full test suite: all property-based tests, unit tests, integration tests
  - Verify all tests pass without warnings or errors
  - Verify offline queue handles rapid reconnections gracefully
  - Verify store isolation prevents all cross-store data leakage
  - Verify configuration service allows credential rotation without restart
  - Verify audit logs capture all payment status changes
  - Verify reconciliation service handles orphaned payments correctly
  - Run code coverage one final time: confirm 85%+ on payment-critical paths
  - Create summary document of test results
  - Ask the user if questions arise about the implementation or any concerns remain.

## Notes

- Tasks marked with `*` are optional sub-tasks (property-based tests and edge case tests) that can be skipped for faster MVP delivery
- Each task references specific requirements for full traceability
- Property-based tests use `fast-check` library configured for minimum 100 iterations per property
- Unit tests use `Jest` testing framework
- All frontend code is TypeScript with React
- All backend code is Node.js/Express with TypeScript
- Database migrations should be version-controlled in `backend/migrations/`
- Environment variables for M-Pesa credentials should be secured using a secrets manager in production
- Audit logs and webhook logs must be retained for regulatory compliance (recommend 90+ day retention)
- Payment records are immutable; status changes create new audit log entries rather than updating original records
