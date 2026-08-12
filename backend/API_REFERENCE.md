# WhatsApp AI Agent - API Reference

## Base URL
- Development: `http://localhost:3001`
- Production: `https://your-domain.com`

## Endpoints

### 1. WhatsApp Message Webhook

**Endpoint:** `POST /whatsapp/webhook`

Receives incoming WhatsApp messages from Twilio.

**Request Headers:**
```
Content-Type: application/x-www-form-urlencoded
X-Twilio-Signature: <signature>
```

**Request Body:**
```
MessageSid=<msg_id>
AccountSid=<account_id>
MessagingServiceSid=<svc_id>
From=whatsapp:+1234567890
To=whatsapp:+0987654321
Body=Hello, can you give me today's sales?
NumMedia=0
```

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200`: Message processed successfully
- `500`: Processing error

**Example:**
```bash
curl -X POST http://localhost:3001/whatsapp/webhook \
  -d "From=whatsapp:%2B1234567890" \
  -d "Body=daily sales"
```

---

### 2. Webhook Challenge (GET)

**Endpoint:** `GET /whatsapp/webhook`

Twilio sends this request to validate webhook URL.

**Query Parameters:**
```
hub.challenge=<challenge_token>
```

**Response:**
```
<challenge_token>
```

**Status Codes:**
- `200`: Challenge validated

---

### 3. Generate Daily Report

**Endpoint:** `GET /reports/daily`

Generates and downloads daily PDF report.

**Query Parameters:**
None (uses current date)

**Response Headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="daily-report-2024-01-15.pdf"
```

**Response Body:**
Binary PDF file

**Status Codes:**
- `200`: Report generated successfully
- `500`: Report generation error

**Example:**
```bash
curl http://localhost:3001/reports/daily --output daily.pdf
```

---

### 4. Generate Monthly Report

**Endpoint:** `GET /reports/monthly`

Generates and downloads monthly PDF report.

**Query Parameters:**
| Parameter | Type | Required | Format | Example |
|-----------|------|----------|--------|---------|
| month | string | Yes | YYYY-MM | 2024-01 |

**Response Headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="monthly-report-2024-01.pdf"
```

**Response Body:**
Binary PDF file

**Status Codes:**
- `200`: Report generated successfully
- `400`: Invalid month format
- `500`: Report generation error

**Example:**
```bash
curl "http://localhost:3001/reports/monthly?month=2024-01" --output monthly.pdf
```

---

### 5. Health Check

**Endpoint:** `GET /health`

Checks if service is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T08:30:00.000Z"
}
```

**Status Codes:**
- `200`: Service is healthy

**Example:**
```bash
curl http://localhost:3001/health
```

---

## Message Commands

The AI agent recognizes these natural language queries:

### Common Commands

| Query | Response |
|-------|----------|
| "hello" | Greeting with available commands |
| "daily sales" | Today's sales summary with total and count |
| "daily credit" | Today's credit transactions summary |
| "daily report" | Complete daily report (sales + credits) |
| "stock status" | Current inventory levels by store |
| "customer info [name]" | Details about specific customer |
| "how much did we sell today?" | Today's sales total |
| "show me credits" | Today's credit summary |

### AI Processing

The AI uses Claude 3.5 Sonnet with context:
```
Today's Metrics:
- Total Sales: 5000
- Total Credit Transactions: 2500
- Number of Transactions: 25
- Stock Items: 150
```

Responses are tailored to WhatsApp format (short, clear, bullet points).

---

## Data Models

### DailyReportData

```typescript
interface DailyReportData {
  date: Date;
  totalSales: number;
  salesCount: number;
  totalCredits: number;
  creditCount: number;
  topProducts?: {
    name: string;
    quantity: number;
  }[];
  stores?: {
    name: string;
    sales: number;
  }[];
}
```

### MonthlyReportData

```typescript
interface MonthlyReportData {
  month: string;
  totalSales: number;
  totalCredits: number;
  stockValue: number;
  topProducts?: {
    name: string;
    revenue: number;
  }[];
  storePerformance?: {
    name: string;
    sales: number;
  }[];
}
```

### QueryResult

```typescript
interface QueryResult {
  type: 'report' | 'insight' | 'error';
  content: string;
  data?: unknown;
}
```

---

## Supabase Tables Queried

### sales
```sql
SELECT id, total_amount, created_at, customer_id, store_id
FROM sales
WHERE created_at >= start_date AND created_at < end_date
```

### customer_payments
```sql
SELECT id, amount, status, created_at, customer_id, store_id
FROM customer_payments
WHERE created_at >= start_date AND created_at < end_date
```

### stock
```sql
SELECT id, product_id, quantity, store_id, products(name, code)
FROM stock
```

### customers
```sql
SELECT id, name, email, phone
FROM customers
```

### stores
```sql
SELECT id, name, location
FROM stores
```

---

## Cron Jobs

### Daily Report Job
```
Schedule: 0 8 * * * (8 AM daily)
Trigger: Automatic
Action: Send WhatsApp message with daily summary
```

### Monthly Report Job
```
Schedule: 0 8 1 * * (1st of month, 8 AM)
Trigger: Automatic
Action: Send WhatsApp message with monthly summary
```

---

## Error Handling

### Common Error Responses

#### Missing Environment Variables
```json
{
  "error": "Missing required environment variable: ANTHROPIC_API_KEY"
}
```

#### Database Connection Error
```json
{
  "error": "Failed to connect to Supabase"
}
```

#### Twilio API Error
```json
{
  "error": "Failed to send WhatsApp message"
}
```

#### AI Processing Error
```json
{
  "type": "error",
  "content": "Sorry, I encountered an error processing your request."
}
```

#### Invalid Report Parameters
```json
{
  "error": "Failed to generate report"
}
```

---

## Rate Limiting

Currently no rate limiting. In production, add:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
```

---

## Authentication

Currently no authentication required. For production, add:

```typescript
const validateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  // Verify token
  next();
};

app.post('/reports/*', validateToken);
```

---

## Response Times

Typical response times:
- WhatsApp message: 2-5 seconds (AI processing + response)
- Daily report generation: 1-2 seconds
- Monthly report generation: 2-3 seconds
- Automated reports: Sent within 5 seconds of schedule

---

## Webhooks Configuration

### Twilio Configuration

**URL:** `https://your-domain.com/whatsapp/webhook`
**Method:** POST
**Content-Type:** application/x-www-form-urlencoded

### Signature Validation

Twilio includes `X-Twilio-Signature` header. Validate:

```typescript
const crypto = require('crypto');

function validateTwilioRequest(url, body, signature, authToken) {
  const hash = crypto
    .createHmac('sha1', authToken)
    .update(url + body, 'utf8')
    .digest('base64');
  return hash === signature;
}
```

---

## Database Transactions

Reports are generated from read-only queries. No transactions used.

---

## Logging

Logs include:
- Incoming messages: "Received message from {phone}: {message}"
- Outgoing messages: "Message sent to {phone}"
- Job execution: "Running daily report job..."
- Errors: Full error stack trace

View logs:
```bash
pm2 logs whatsapp-agent
```

---

## Performance Metrics

### Query Performance
- Sales query: ~50ms
- Credits query: ~50ms
- Stock query: ~100ms
- Customers query: ~30ms
- Stores query: ~20ms

### Report Generation
- PDF generation: ~1000ms
- Total report time: ~1500ms (includes DB queries)

### Message Processing
- Twilio receipt: <100ms
- AI processing: 2-3 seconds
- Response send: <100ms
- Total: 2-3 seconds

---

## Scaling Considerations

For high volume:
1. Add message queue (Bull, RabbitMQ)
2. Scale to multiple instances
3. Add caching layer (Redis)
4. Implement rate limiting
5. Setup load balancer
6. Monitor and alert on errors

---

## Webhook Payload Example

```
POST /whatsapp/webhook HTTP/1.1
Host: your-domain.com
Content-Type: application/x-www-form-urlencoded
X-Twilio-Signature: abc123def456

MessageSid=SM1234567890abcdef1234567890abcdef
AccountSid=YOUR_TWILIO_ACCOUNT_SID
MessagingServiceSid=MG1234567890abcdef1234567890abcdef
From=whatsapp:%2B12025551234
To=whatsapp:%2B15017122661
Body=Hello%2C+can+you+give+me+today%27s+sales%3F
NumMedia=0
```

---

## Integration Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

// Get daily report
const response = await axios.get('http://localhost:3001/reports/daily', {
  responseType: 'arraybuffer'
});

fs.writeFileSync('daily.pdf', response.data);
```

### Python
```python
import requests

# Health check
response = requests.get('http://localhost:3001/health')
print(response.json())
```

### cURL
```bash
# Monthly report
curl "http://localhost:3001/reports/monthly?month=2024-01" \
  -o report.pdf
```

---

## Version Info

- API Version: 1.0.0
- Node.js: 18+
- Express: 4.18+
- TypeScript: 5.3+
- Claude Model: claude-3-5-sonnet-20241022

---

## Support

For API issues:
1. Check error message in response
2. View logs: `pm2 logs whatsapp-agent`
3. Test connectivity: `curl http://localhost:3001/health`
4. Verify environment variables
5. Check Supabase/Twilio/Anthropic status
