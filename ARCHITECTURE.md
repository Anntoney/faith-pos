# WhatsApp AI Agent - System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SYSTEMS                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐       │
│  │  WhatsApp    │    │   Twilio     │    │  Anthropic      │       │
│  │  User        │◄──►│  WhatsApp    │◄──►│  Claude AI      │       │
│  │  (Customer)  │    │  Gateway     │    │  (Intelligence) │       │
│  └──────────────┘    └──────────────┘    └─────────────────┘       │
│                             │                                        │
│                             │ Webhook (POST)                        │
│                             ▼                                        │
├─────────────────────────────────────────────────────────────────────┤
│                    BACKEND SERVICE (Node.js)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Express Server                             │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │           Message Router (/whatsapp/webhook)            │  │   │
│  │  └────────────┬─────────────────────────────────────────────┘  │   │
│  │               │                                                 │   │
│  │  ┌────────────▼─────────────────────────────────────────────┐  │   │
│  │  │          AI Agent Service                               │  │   │
│  │  │  ┌─────────────────────────────────────────────────┐   │  │   │
│  │  │  │  Query Processor                                 │   │  │   │
│  │  │  │  • Parse user message                           │   │  │   │
│  │  │  │  • Build context from database                  │   │  │   │
│  │  │  │  • Send to Claude with system prompt            │   │  │   │
│  │  │  │  • Format response for WhatsApp                 │   │  │   │
│  │  │  └─────────────────────────────────────────────────┘   │  │   │
│  │  └────────────┬─────────────────────────────────────────────┘  │   │
│  │               │                                                 │   │
│  │  ┌────────────▼─────────────────────────────────────────────┐  │   │
│  │  │          Data Layer Services                            │  │   │
│  │  │  ┌──────────────────────────────────────────────────┐   │  │   │
│  │  │  │  • getSalesSummary()                             │   │  │   │
│  │  │  │  • getCreditSummary()                            │   │  │   │
│  │  │  │  • getStockSummary()                             │   │  │   │
│  │  │  │  • getCustomers()                                │   │  │   │
│  │  │  │  • getStores()                                   │   │  │   │
│  │  │  └──────────────────────────────────────────────────┘   │  │   │
│  │  └────────────┬─────────────────────────────────────────────┘  │   │
│  │               │                                                 │   │
│  │  ┌────────────▼─────────────────────────────────────────────┐  │   │
│  │  │          Report Generation Services                     │  │   │
│  │  │  ┌──────────────────────────────────────────────────┐   │  │   │
│  │  │  │  • generateDailyReport()                         │   │  │   │
│  │  │  │  • generateMonthlyReport()                       │   │  │   │
│  │  │  │  • PDF formatting                                │   │  │   │
│  │  │  └──────────────────────────────────────────────────┘   │  │   │
│  │  └────────────┬─────────────────────────────────────────────┘  │   │
│  │               │                                                 │   │
│  │  ┌────────────▼─────────────────────────────────────────────┐  │   │
│  │  │          Message Dispatch Services                      │  │   │
│  │  │  ┌──────────────────────────────────────────────────┐   │  │   │
│  │  │  │  • sendMessage()                                 │   │  │   │
│  │  │  │  • sendMessageWithAttachment()                   │   │  │   │
│  │  │  │  • validateWebhook()                             │   │  │   │
│  │  │  └──────────────────────────────────────────────────┘   │  │   │
│  │  └────────────────────────────────────────────────────────────┘  │   │
│  │                                                                    │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │           Scheduled Jobs (node-cron)                    │   │   │
│  │  │  ┌────────────────────────────────────────────────────┐ │   │   │
│  │  │  │  Daily Job: 0 8 * * * (8 AM daily)                │ │   │   │
│  │  │  │  → Query DB for daily metrics                     │ │   │   │
│  │  │  │  → Generate report                                │ │   │   │
│  │  │  │  → Send via WhatsApp                              │ │   │   │
│  │  │  └────────────────────────────────────────────────────┘ │   │   │
│  │  │  ┌────────────────────────────────────────────────────┐ │   │   │
│  │  │  │  Monthly Job: 0 8 1 * * (1st, 8 AM)             │ │   │   │
│  │  │  │  → Query DB for monthly metrics                   │ │   │   │
│  │  │  │  → Generate comprehensive report                  │ │   │   │
│  │  │  │  → Send via WhatsApp                              │ │   │   │
│  │  │  └────────────────────────────────────────────────────┘ │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                        │   │
├─────────────────────────────────────────────────────────────────────┤
│                      DATA LAYER (Supabase)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   sales      │  │   customers  │  │   stock      │              │
│  │   table      │  │   table      │  │   table      │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL Database                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### 1. Message Handling Flow

```
User sends WhatsApp message
        │
        ▼
Twilio receives & routes
        │
        ▼
Backend: POST /whatsapp/webhook
        │
        ▼
Extract message & sender
        │
        ▼
AI Agent Service
        │
        ├─────────────────────────────┐
        │                             │
        ▼                             ▼
    Query DB              Prepare context
        │                       │
        │                       ▼
        │                  Build prompt
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
            Send to Claude AI
                    │
                    ▼
            Receive response
                    │
                    ▼
            Format for WhatsApp
                    │
                    ▼
        Send response via Twilio
                    │
                    ▼
        User receives on WhatsApp
```

### 2. Daily Report Generation Flow

```
Cron triggers at 8 AM
        │
        ▼
Scheduler job starts
        │
        ▼
Query Database (today's data)
        │
        ├─── getSalesSummary()
        ├─── getCreditSummary()
        ├─── getStores()
        └─── Aggregate results
        │
        ▼
Generate Report Data Structure
        │
        ├─── Calculate totals
        ├─── Format numbers
        └─── Structure for PDF
        │
        ▼
Create PDF Document
        │
        ├─── Add headers
        ├─── Add tables/charts
        └─── Format content
        │
        ▼
Format WhatsApp message
        │
        ▼
Send via Twilio to owner
        │
        ▼
Owner receives report
```

### 3. Database Query Pattern

```
Service receives request
        │
        ▼
Build SQL with date ranges
        │
        ▼
Execute via Supabase client
        │
        ├─── Joins with related tables
        └─── Filters by date/store
        │
        ▼
Supabase processes query
        │
        ├─── Checks RLS policies
        └─── Returns results
        │
        ▼
Process results in code
        │
        ├─── Transform format
        ├─── Calculate aggregates
        └─── Return to caller
        │
        ▼
Use in report/response
```

## System Components

### Core Services

#### 1. WhatsApp Service (`services/whatsapp.ts`)
- **Responsibility**: Twilio integration
- **Methods**:
  - `sendMessage()` - Send text response
  - `sendMessageWithAttachment()` - Send with PDF
  - `validateWebhook()` - Verify Twilio signature

#### 2. AI Agent Service (`services/ai-agent.ts`)
- **Responsibility**: Claude integration & query processing
- **Methods**:
  - `processQuery()` - Main entry point
  - `buildContext()` - Prepare database context

#### 3. Supabase Service (`services/supabase.ts`)
- **Responsibility**: Database queries
- **Methods**:
  - `getSalesSummary()` - Daily sales data
  - `getCreditSummary()` - Credit transactions
  - `getStockSummary()` - Inventory levels
  - `getCustomers()` - Customer list
  - `getStores()` - Store information

#### 4. PDF Generator (`services/pdf-generator.ts`)
- **Responsibility**: Report PDF creation
- **Methods**:
  - `generateDailyReport()` - Daily PDF
  - `generateMonthlyReport()` - Monthly PDF

### Route Handlers

#### 1. WhatsApp Routes (`routes/whatsapp.ts`)
- `POST /whatsapp/webhook` - Incoming messages
- `GET /whatsapp/webhook` - Webhook validation

#### 2. Report Routes (`routes/reports.ts`)
- `GET /reports/daily` - Download daily PDF
- `GET /reports/monthly` - Download monthly PDF

### Scheduled Jobs

#### 1. Job Scheduler (`jobs/scheduler.ts`)
- Daily reports: `0 8 * * *` (8 AM)
- Monthly reports: `0 8 1 * *` (1st at 8 AM)

## External Integrations

### Twilio (WhatsApp Gateway)
- Receives/sends WhatsApp messages
- Validates webhook signatures
- Provides phone number for business

### Anthropic (AI Engine)
- Claude 3.5 Sonnet model
- Processes natural language queries
- Generates insights & responses

### Supabase (Database)
- PostgreSQL instance
- Real-time data access
- Row-level security policies

## Data Models

### Business Data (from Supabase)
```
Sales:
├── id
├── total_amount
├── created_at
├── customer_id
├── store_id

Customer Payments:
├── id
├── amount
├── status
├── created_at
├── customer_id
├── store_id

Stock:
├── id
├── product_id
├── quantity
├── store_id
├── product details (name, code)

Stores:
├── id
├── name
├── location

Customers:
├── id
├── name
├── email
├── phone
```

### Report Data
```
DailyReportData:
├── date
├── totalSales
├── salesCount
├── totalCredits
├── creditCount
├── topProducts[]
└── stores[]

MonthlyReportData:
├── month
├── totalSales
├── totalCredits
├── stockValue
├── topProducts[]
└── storePerformance[]
```

## Deployment Architecture

### Development
```
Local Machine
├── Node.js Process (npm run dev)
├── ngrok tunnel
└── Connected to Supabase
```

### Production (PM2)
```
Server
├── PM2 Process Manager
│   └── Node.js Application
├── Nginx Reverse Proxy
├── SSL Certificate
└── Connected to Supabase
```

### Production (Docker)
```
Server
├── Docker Engine
│   └── Container
│       └── Node.js Application
├── Docker Network
├── Nginx (optional)
└── Connected to Supabase
```

## Request/Response Cycle

### Message Request Cycle
```
Time: ~2-5 seconds

1. User sends message (0ms)
2. Twilio receives (instant)
3. Backend receives webhook (100ms)
4. Extract message content (10ms)
5. Query AI agent service (20ms)
6. Query database for context (50ms)
7. Call Claude API (2000-3000ms)
8. Process AI response (50ms)
9. Format for WhatsApp (20ms)
10. Send via Twilio (100ms)
11. User receives (100-200ms)

Total: 2000-3500ms (2-3.5 seconds)
```

## Cron Job Execution

### Daily Report Job (8 AM)
```
Time: <1 second latency, ~1500ms to generate

0:00 - Cron triggers
1:00 - Query sales data
2:00 - Query credit data
3:00 - Query store data
50:00 - Generate PDF
100:00 - Format message
150:00 - Send via Twilio
```

## Error Handling Flow

```
Request arrives
    │
    ▼
Try to process
    │
    ├─── Success ──► Send response
    │
    └─── Error ──► Log error
             │
             ▼
        Identify type
             │
        ├─── DB Error ──► Return 500 + message
        ├─── AI Error ──► Return error response
        ├─── Twilio Error ──► Log & retry
        └─── Validation Error ──► Return 400
```

## Security Architecture

```
Incoming Request
    │
    ├─── Webhook validation
    │    └─── Verify Twilio signature
    │
    ├─── Environment validation
    │    └─── Check API keys present
    │
    ├─── Database access
    │    └─── Service role key (server-side only)
    │
    ├─── API rate limiting
    │    └─── Per IP address
    │
    └─── Logging
         └─── Track all requests
```

## Scaling Strategy

### Horizontal Scaling
```
Load Balancer
    │
    ├─── Instance 1 (port 3001)
    ├─── Instance 2 (port 3002)
    └─── Instance 3 (port 3003)
         │
         └─── Shared Supabase Database
```

### Message Queue Pattern (Future)
```
Request
    │
    ▼
Message Queue (Bull/RabbitMQ)
    │
    ├─── Worker Process 1
    ├─── Worker Process 2
    └─── Worker Process 3
         │
         └─► Database
```

---

This architecture ensures:
- **Scalability**: Can handle multiple concurrent messages
- **Reliability**: Error handling & retry logic
- **Performance**: Optimized queries & caching
- **Security**: API key management & validation
- **Maintainability**: Clean separation of concerns
