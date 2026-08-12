# M-Pesa Payment Gateway Integration Specification

## Overview

This directory contains the complete specification for implementing M-Pesa payment gateway integration into the POS system. The specification follows a requirements-first workflow, ensuring business needs drive technical decisions.

## Documents

### 1. [requirements.md](./requirements.md)
**Purpose**: Business and functional requirements for the feature

**Contents**:
- 12 detailed requirements covering payment flow, reconciliation, offline support, multi-store isolation, and error handling
- User stories describing the value from operator, accountant, business owner, and system admin perspectives
- Acceptance criteria using EARS patterns for structural clarity
- Glossary of key terms used throughout the specification

**Key Requirements**:
- Payment initiation with M-Pesa STK push
- Status tracking with 2-minute timeout
- Webhook callback handling with retry logic
- Sales transaction reconciliation
- Multi-store payment isolation
- Offline mode support for areas with intermittent connectivity
- Customer credit integration
- Comprehensive error logging and audit trails

### 2. [design.md](./design.md)
**Purpose**: Technical architecture and design for implementation

**Contents**:
- High-level system architecture showing component interactions
- 7 core service components with responsibilities and methods
- Complete data models with TypeScript interfaces and SQL schema
- API interface specifications with request/response formats
- State diagrams and sequence diagrams for key flows
- Error handling matrix mapping M-Pesa codes to system responses
- 42 Correctness Properties validated through property-based testing

**Key Design Decisions**:
- TypeScript throughout (backend and frontend) for type safety
- Supabase for relational data storage with proper indexing
- Asynchronous polling for payment status (5-second interval)
- Webhook callbacks for immediate payment updates
- FIFO offline queue for intermittent connectivity
- Store-specific credential isolation for multi-tenant support
- Audit log for all payment status changes

### 3. [tasks.md](./tasks.md)
**Purpose**: Actionable implementation plan with proper sequencing

**Contents**:
- 30 discrete implementation tasks organized in 12 phases
- Each task specifies code to write, files to create/modify, tests to implement
- Property-based tests (marked optional with *) for universal properties
- Unit tests for edge cases and error scenarios
- Integration tests for end-to-end flows
- Checkpoints to validate progress and ensure quality

**Execution Phases**:
1. Core Infrastructure & Database Schema
2. Payment Initiation & Status Tracking
3. Webhook Handling & Reconciliation
4. Multi-Store & Transaction Isolation
5. Customer Credit Integration
6. Offline Mode Support
7. Configuration & Credentials
8. Error Logging & Observability
9. API Endpoints & Integration
10. Frontend UI Components
11. Integration Testing
12. Checkpoint & Validation

## Quick Start

### For Understanding the Feature
1. Start with requirements.md to understand what needs to be built
2. Review the Glossary for terminology
3. Read through user stories to understand different user perspectives

### For Implementation
1. Open tasks.md
2. Click "Start task" next to task 1 to begin implementation
3. Follow each task sequentially - each builds on the previous
4. Optional tasks (marked with *) can be skipped for faster MVP
5. Checkpoints (tasks 28, 30) validate progress before moving forward

### For Testing Strategy
1. Refer to design.md section "Testing Strategy" for overview
2. Each task includes referenced properties it validates
3. Property-based tests use fast-check library (100+ iterations)
4. Unit tests cover edge cases and error scenarios
5. Integration tests verify end-to-end flows

## Key Specifications

### Database Schema
- `payments`: Core payment records with status tracking
- `payment_audit_logs`: Immutable history of all status changes
- `webhook_logs`: All received webhooks and retry attempts
- `offline_queue`: Payments initiated while offline
- `customer_credit`: Customer prepaid credit balances

### Core Services
- **MpesaApiClient**: All M-Pesa API communication
- **PaymentService**: Payment lifecycle orchestration
- **WebhookHandler**: Callback processing and validation
- **ReconciliationService**: Matching payments to transactions
- **OfflineQueueManager**: Offline request queuing
- **CustomerCreditService**: Credit operations
- **ConfigurationService**: Credential management

### Frontend Components
- `MpesaPaymentMethod`: Payment selection and phone input
- `MpesaPaymentProgress`: Status tracking during payment
- `MpesaPaymentResult`: Success/failure display
- `MpesaPaymentModal`: Wrapper for complete flow

## Correctness Properties (42 Total)

Key properties include:
- **Payment Initiation**: Phone input triggers API call, errors display properly
- **Status Tracking**: Polling interval, status updates, timeout at 120s
- **Webhook Handling**: Signature validation, proper status updates, retry logic
- **Reconciliation**: Payment-to-transaction matching, audit logging
- **Multi-Store**: Store isolation, credential isolation, query filtering
- **Offline Mode**: Queue activation, FIFO processing, non-blocking transactions
- **Customer Credit**: Credit application, balance validation, transaction recording
- **Error Logging**: Comprehensive context logging for debugging

## Error Handling

| Scenario | Detection | Recovery |
|---|---|---|
| M-Pesa API timeout | No response within 30s | Queue for offline or show error |
| Payment timeout | 2 min without status | Mark EXPIRED, allow retry |
| Orphaned payment | No matching transaction | Flag for manual review |
| Webhook failure | Processing error | Queue for retry (3 attempts, exponential backoff) |
| Invalid credentials | Test call fails | Log error, prevent payment initiation |
| Network loss | Connection error | Switch to offline mode, queue payments |

## Testing Coverage

- **Property-Based Tests**: 30+ properties tested with 100+ iterations each
- **Unit Tests**: Edge cases, error scenarios, data validation
- **Integration Tests**: End-to-end flows (success, failure, timeout, offline)
- **Coverage Target**: 85% line coverage, 100% for error paths

## Dependencies

### Backend
- express: HTTP server
- supabase-js: Database client
- axios: HTTP client for M-Pesa API
- fast-check: Property-based testing
- jest: Unit testing framework

### Frontend
- react: UI framework (via Next.js)
- next: Full-stack framework
- typescript: Type safety

## Environment Configuration

Required environment variables:
```
MPESA_API_KEY=<from M-Pesa merchant console>
MPESA_CONSUMER_KEY=<from M-Pesa merchant console>
MPESA_CONSUMER_SECRET=<from M-Pesa merchant console>
MPESA_BUSINESS_SHORTCODE=<merchant code>
SUPABASE_URL=<project URL>
SUPABASE_KEY=<public key>
```

## Project Structure

```
.kiro/specs/mpesa-payment-integration/
├── requirements.md      # Business requirements (12 requirements)
├── design.md           # Technical design (42 properties, architecture)
├── tasks.md            # Implementation plan (30 tasks)
└── README.md           # This file

backend/
├── src/
│   ├── services/
│   │   ├── mpesa/
│   │   │   └── MpesaApiClient.ts
│   │   ├── PaymentService.ts
│   │   ├── ReconciliationService.ts
│   │   ├── OfflineQueueManager.ts
│   │   ├── CustomerCreditService.ts
│   │   ├── ConfigurationService.ts
│   │   └── LoggingService.ts
│   ├── repositories/
│   │   ├── PaymentRepository.ts
│   │   ├── TransactionRepository.ts
│   │   └── CustomerCreditRepository.ts
│   ├── handlers/
│   │   └── WebhookHandler.ts
│   ├── routes/
│   │   └── payments.routes.ts
│   ├── types/
│   │   └── payment.ts
│   └── middleware/
│       ├── validatePaymentRequest.ts
│       └── validateWebhookRequest.ts
├── tests/
│   ├── properties/        # Property-based tests
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
└── migrations/
    └── 001_create_payment_tables.sql

app/
├── pos/
│   ├── page.tsx          # Updated checkout with M-Pesa
│   └── components/
│       └── MpesaPayment/
│           ├── MpesaPaymentMethod.tsx
│           ├── MpesaPaymentProgress.tsx
│           ├── MpesaPaymentResult.tsx
│           └── MpesaPaymentModal.tsx
```

## Next Steps

1. **Review Requirements**: Ensure all business needs are captured
2. **Review Design**: Validate technical approach and architecture
3. **Start Implementation**: Click "Start task" on task 1 in tasks.md
4. **Execute Sequentially**: Each task builds on previous steps
5. **Validate with Tests**: Run property and unit tests at checkpoints
6. **Ship with Confidence**: 42 properties + comprehensive tests ensure correctness

## Support

For questions about:
- **Requirements**: Refer to requirements.md and Glossary
- **Architecture**: Refer to design.md Architecture and Components sections
- **Implementation**: Refer to specific task instructions and Requirements references
- **Properties**: Refer to design.md Correctness Properties section
- **Testing**: Refer to design.md Testing Strategy section

