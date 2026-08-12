# M-Pesa Payment Gateway Integration Requirements

## Introduction

This document specifies the requirements for integrating M-Pesa as a payment method into the existing POS system. The system enables customers to pay for transactions via M-Pesa (a mobile money platform predominantly used in East Africa), handles payment lifecycle management, and maintains reconciliation with sales transactions.

## Glossary

- **M-Pesa**: Mobile money payment platform primarily used in Kenya and other East African countries
- **POS_System**: The Point of Sale application where transactions are initiated and payments are processed
- **Payment_Initiation**: The process of requesting a payment from the customer's M-Pesa account
- **STK_Push**: M-Pesa's service that prompts the customer's phone with a payment dialog
- **Webhook**: HTTP callback mechanism used by M-Pesa to notify the system of payment events
- **Payment_Status**: The current state of a payment (Initiated, Pending, Completed, Failed, Expired)
- **Reconciliation**: The process of matching payment records with sales transactions
- **Store**: A distinct business location managing its own inventory and transactions
- **Transaction**: A sale record containing items, amounts, customer info, and payment method
- **Customer_Credit**: Pre-paid funds or account balance available for purchase
- **Offline_Mode**: POS operating without internet connectivity, queueing payments for later processing
- **Online_Mode**: POS connected to internet, processing payments in real-time

## Requirements

### Requirement 1: M-Pesa Payment Initiation

**User Story:** As a POS operator, I want to initiate M-Pesa payments at checkout, so that customers can pay using their mobile money accounts.

#### Acceptance Criteria

1. WHEN a customer selects M-Pesa as payment method on the POS, THE POS_System SHALL display a form requesting the customer's M-Pesa phone number
2. WHEN the M-Pesa phone number is validated, THE POS_System SHALL initiate an M-Pesa payment request via the M-Pesa API
3. WHEN the payment initiation is successful, THE POS_System SHALL display a confirmation message stating the customer should enter their M-Pesa PIN
4. WHEN the POS_System receives a 400-series or 500-series error from M-Pesa API, THE POS_System SHALL display a user-friendly error message and prevent transaction completion
5. WHEN a payment is initiated, THE POS_System SHALL store the payment record with Initiated status, transaction ID, M-Pesa phone number, and timestamp

### Requirement 2: Payment Status Tracking and Polling

**User Story:** As a POS operator, I want the system to track payment status, so that I know when customer payments are confirmed or failed.

#### Acceptance Criteria

1. WHEN a payment is in Initiated status, THE POS_System SHALL poll the M-Pesa API at regular intervals (every 5 seconds) to check payment status
2. WHEN the payment status changes to Completed, THE POS_System SHALL update the payment record, mark the transaction as paid, and update customer credit if applicable
3. WHEN the payment status changes to Failed, THE POS_System SHALL update the payment record with failure reason and display the reason to the operator
4. WHEN a payment exceeds 2 minutes without confirmation, THE POS_System SHALL mark the payment as Expired and cancel the transaction
5. WHEN polling detects a status change, THE POS_System SHALL immediately update the UI to reflect the new payment status

### Requirement 3: Webhook Callback Handling

**User Story:** As a system administrator, I want webhook callbacks to be processed reliably, so that payment updates from M-Pesa are recorded accurately.

#### Acceptance Criteria

1. WHEN the M-Pesa API sends a webhook callback to the system, THE Payment_Webhook_Handler SHALL validate the webhook signature for authenticity
2. WHEN a webhook callback is valid and contains payment status data, THE Payment_Webhook_Handler SHALL update the corresponding payment record status
3. WHEN a webhook callback indicates payment completion, THE Payment_Webhook_Handler SHALL trigger transaction reconciliation
4. WHEN a webhook callback is received for a payment record that does not exist, THE Payment_Webhook_Handler SHALL log the orphaned callback and return a 200 OK response
5. WHEN the webhook handler processes a valid callback, THE system SHALL store a webhook log entry including timestamp, payload, status code, and processing outcome
6. IF a webhook callback cannot be processed immediately, THEN THE system SHALL queue it for retry with exponential backoff (maximum 3 retries over 15 minutes)

### Requirement 4: Sales Transaction Reconciliation

**User Story:** As an accountant, I want payment records to be reconciled with sales transactions, so that financial records are accurate and complete.

#### Acceptance Criteria

1. WHEN a payment is completed via webhook or polling, THE Reconciliation_Service SHALL match the payment record with the corresponding sales transaction
2. WHEN a payment is successfully matched with a transaction, THE Reconciliation_Service SHALL mark both records as reconciled and set the transaction status to Paid
3. WHEN a payment cannot be matched to any transaction (orphaned payment), THE Reconciliation_Service SHALL flag the payment for manual review and create an audit log entry
4. WHEN a sales transaction is cancelled, THE Reconciliation_Service SHALL release any associated payment record and revert its status to Cancelled
5. WHEN reconciliation is completed, THE system SHALL update customer credit balance if the payment was posted to account credit rather than immediate payment

### Requirement 5: Payment Timeout and Failure Handling

**User Story:** As a POS operator, I want the system to handle payment timeouts and failures gracefully, so that customers can retry or choose alternative payment methods.

#### Acceptance Criteria

1. WHEN a payment reaches the 2-minute timeout threshold, THE POS_System SHALL mark the payment as Expired and release the transaction lock
2. WHEN a payment is marked as Expired, THE POS_System SHALL display a message to the operator: "Payment expired. Customer can retry or select another payment method."
3. WHEN a payment fails with a specific error code from M-Pesa, THE POS_System SHALL map the error code to a user-friendly message and display it
4. IF an operator cancels a payment before confirmation, THEN THE POS_System SHALL mark the payment as Cancelled and release the transaction lock
5. WHEN a payment fails or expires, THE POS_System SHALL allow the operator to initiate a new payment attempt without re-entering transaction details

### Requirement 6: Multi-Store Payment Isolation

**User Story:** As a multi-store business owner, I want each store to have isolated payment processing, so that payments and credentials are not mixed between locations.

#### Acceptance Criteria

1. WHEN a payment is initiated from a store, THE POS_System SHALL associate the payment record with the specific store ID
2. WHEN retrieving payment history or status, THE POS_System SHALL filter results by the current store's ID only
3. WHEN a webhook callback is received, THE Payment_Webhook_Handler SHALL validate that the store ID in the payload matches the receiving store's ID
4. WHEN a store's M-Pesa credentials are updated, THE POS_System SHALL ensure the change only affects that store and does not impact other stores
5. WHEN reconciling transactions, THE Reconciliation_Service SHALL only match payments with transactions from the same store

### Requirement 7: Payment Record Storage and Data Integrity

**User Story:** As a system administrator, I want payment records to be stored reliably, so that audit trails and financial reporting are accurate.

#### Acceptance Criteria

1. THE POS_System SHALL store payment records in the database with fields: payment_id, transaction_id, store_id, phone_number, amount, status, created_at, updated_at, error_message, reconciled_at
2. WHEN a payment status is updated, THE POS_System SHALL preserve the previous status in an audit log and maintain immutable records of all changes
3. WHEN the database records a payment completion, THE POS_System SHALL use database transactions to ensure either all related records are updated or none are updated (atomicity)
4. WHEN a payment record is created, THE POS_System SHALL validate that all required fields are present and valid before persisting to the database
5. WHEN querying payment history, THE POS_System SHALL return results ordered by created_at descending with proper pagination support

### Requirement 8: Online and Offline Mode Support

**User Story:** As a POS operator in areas with intermittent connectivity, I want the system to handle offline scenarios, so that payments can be initiated even without internet.

#### Acceptance Criteria

1. WHEN the POS_System detects loss of internet connectivity, THE POS_System SHALL switch to Offline_Mode and queue any new payment initiation requests
2. WHEN in Offline_Mode, THE POS_System SHALL display a clear indicator to the operator that the system is offline
3. WHEN internet connectivity is restored, THE POS_System SHALL attempt to process queued payment requests in FIFO order
4. WHEN a queued payment is being processed, THE POS_System SHALL retrieve the payment from the queue and initiate it with M-Pesa API
5. WHEN a queued payment fails to process, THE POS_System SHALL log the failure and mark the payment for retry with a retry attempt counter
6. WHILE in Offline_Mode, THE POS_System SHALL not block transaction creation; instead, it SHALL queue payment processing for later

### Requirement 9: Customer Credit Integration

**User Story:** As a business owner, I want M-Pesa payments to integrate with customer credit accounts, so that customers can build credit or prepay for purchases.

#### Acceptance Criteria

1. WHEN a customer selects M-Pesa payment, THE POS_System SHALL offer an option to apply the payment toward customer credit instead of immediate transaction payment
2. WHEN a payment is completed and applied to customer credit, THE POS_System SHALL update the customer's credit balance in the database
3. WHEN a customer with available credit makes a purchase, THE POS_System SHALL allow applying credit and deducting the appropriate amount
4. WHEN customer credit is applied to a transaction, THE Payment_Service SHALL verify the credit balance is sufficient before completing the transaction
5. WHEN a payment is posted to customer credit, THE system SHALL create a transaction record showing the credit was added, with a reference to the M-Pesa payment record

### Requirement 10: M-Pesa API Configuration and Credentials

**User Story:** As a system administrator, I want to manage M-Pesa API credentials per store, so that each location can have its own M-Pesa merchant account.

#### Acceptance Criteria

1. THE system SHALL store M-Pesa API credentials (API key, consumer key, consumer secret, business short code) securely in environment variables or a secrets management system
2. WHEN a store's credentials are configured, THE system SHALL validate connectivity to M-Pesa API before saving the credentials
3. WHEN retrieving credentials for payment processing, THE system SHALL fetch store-specific credentials from the configuration
4. WHEN M-Pesa credentials are rotated or updated, THE system SHALL ensure the new credentials are used for all subsequent API calls without requiring a system restart
5. IF M-Pesa API credentials are invalid or expired, THEN THE system SHALL log the error and prevent payment initiation with a clear error message to the operator

### Requirement 11: Payment UI Components

**User Story:** As a POS interface designer, I want dedicated UI components for M-Pesa payment workflow, so that operators have a smooth, intuitive checkout experience.

#### Acceptance Criteria

1. WHEN the POS checkout page loads, THE UI SHALL display M-Pesa as one of the available payment method options
2. WHEN M-Pesa is selected, THE UI SHALL display an input field for the customer's M-Pesa phone number with real-time validation
3. WHEN a payment is being processed, THE UI SHALL display a progress indicator with status updates (Initiated, Awaiting confirmation, Processing)
4. WHEN a payment completes or fails, THE UI SHALL display a clear result message with appropriate next actions for the operator
5. WHEN the operator hovers over the M-Pesa payment method, THE UI SHALL display a help tooltip explaining the payment flow

### Requirement 12: Error Handling and Logging

**User Story:** As a support specialist, I want comprehensive error logs for M-Pesa integration, so that I can troubleshoot issues and provide customer support.

#### Acceptance Criteria

1. WHEN an error occurs in any M-Pesa integration component, THE system SHALL log the error with timestamp, error code, error message, and relevant context (store_id, transaction_id, payment_id)
2. WHEN an M-Pesa API call fails, THE system SHALL log the HTTP status code, request details, and response body for debugging
3. WHEN a webhook callback fails to process, THE system SHALL log the callback payload and the reason for failure
4. WHEN a payment timeout occurs, THE system SHALL log the payment_id, elapsed time, and the reason for timeout determination
5. THE system SHALL store logs in a centralized location accessible to support team with proper access controls
