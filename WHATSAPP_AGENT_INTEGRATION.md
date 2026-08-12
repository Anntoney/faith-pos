# WhatsApp AI Agent Integration

This document explains how the new WhatsApp AI agent integrates with your existing system.

## Architecture

```
WhatsApp Message → Twilio → Backend Service → AI Agent (Claude)
                                 ↓
                          Supabase Database
                                 ↓
                          Generate Reports/Insights
                                 ↓
                          Send Response via WhatsApp
```

## Backend Service Structure

```
backend/
├── src/
│   ├── index.ts                 # Main server entry
│   ├── config/env.ts            # Environment configuration
│   ├── services/
│   │   ├── supabase.ts          # Database queries
│   │   ├── ai-agent.ts          # Claude AI integration
│   │   ├── whatsapp.ts          # Twilio WhatsApp API
│   │   └── pdf-generator.ts     # Report PDF generation
│   ├── routes/
│   │   ├── whatsapp.ts          # Message webhook & routing
│   │   └── reports.ts           # Report generation endpoints
│   └── jobs/
│       └── scheduler.ts         # Cron jobs for automated reports
├── package.json
├── tsconfig.json
├── .env.example
└── SETUP.md
```

## Key Features

### 1. Real-time Message Processing
- Receives messages via Twilio webhook
- AI agent interprets queries
- Sends back insights/data summaries

### 2. Daily Reports (8 AM)
- Aggregates daily sales
- Summarizes credit transactions
- Shows store performance
- Sent automatically to owner's WhatsApp

### 3. Monthly Reports (1st of month, 8 AM)
- Comprehensive monthly performance
- Revenue analysis
- Store comparisons
- Sent automatically

### 4. Available Commands
- "daily sales" → Today's sales summary
- "daily credit" → Today's credit summary
- "stock status" → Current inventory levels
- "customer info [name]" → Customer details
- Any natural language query → AI interprets

## Database Tables Used

The agent queries these tables from your Supabase:
- `sales` - Transaction history
- `customer_payments` - Credit transactions
- `stock` - Inventory levels
- `customers` - Customer data
- `stores` - Store information
- `products` - Product catalog

## Environment Variables Needed

```env
# Twilio (from Twilio Console)
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_NUMBER

# Anthropic (from Anthropic Console)
ANTHROPIC_API_KEY

# Supabase (use your existing keys)
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Owner contact
OWNER_WHATSAPP_NUMBER
```

## Getting Started

1. **Setup Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env.local
   # Fill in environment variables
   ```

2. **Create Twilio Account**
   - Sign up at [Twilio](https://www.twilio.com)
   - Enable WhatsApp messaging
   - Get API credentials and WhatsApp number

3. **Create Anthropic Account**
   - Sign up at [Anthropic](https://www.anthropic.com)
   - Get API key

4. **Configure Webhook in Twilio**
   - Set webhook to: `https://your-backend.com/whatsapp/webhook`
   - This is where Twilio sends incoming messages

5. **Deploy Backend**
   - Follow instructions in `backend/SETUP.md`
   - Run locally for testing with ngrok
   - Deploy to production server/cloud

## Testing Flow

1. Send WhatsApp message to Twilio number
2. Backend receives via webhook
3. AI agent processes query
4. Response sent back via WhatsApp
5. Check logs: `tail -f logs/server.log`

## Customization

### Add Custom Reports
Edit `backend/src/services/pdf-generator.ts` to add new report types.

### Change Report Schedule
Edit cron patterns in `backend/src/jobs/scheduler.ts`:
- `"0 8 * * *"` = 8 AM daily
- `"0 8 1 * *"` = 1st of month at 8 AM
- [Cron format reference](https://crontab.guru)

### Customize AI Prompts
Edit the system prompt in `backend/src/services/ai-agent.ts` to change how Claude responds.

### Add More AI Commands
Extend the `processQuery` function to recognize and handle new commands.

## Monitoring

### Check Service Status
```bash
# Health check
curl http://localhost:3001/health
```

### View Logs
```bash
# Development
npm run dev

# Production (PM2)
pm2 logs whatsapp-agent
```

### Test Report Generation
```bash
# Daily report
curl http://localhost:3001/reports/daily

# Monthly report
curl http://localhost:3001/reports/monthly?month=2024-01
```

## Cost Estimate

- **Twilio**: $0.0075 per message (WhatsApp)
- **Anthropic**: Claude pricing based on tokens (~$0.003/1K tokens)
- **Supabase**: Included in your existing plan

For typical daily usage (10 messages + 1 report): ~$0.10/day

## Troubleshooting

See `backend/SETUP.md` for detailed troubleshooting guide.

## Security Considerations

1. **API Keys**: Never commit `.env` file, use `.env.local`
2. **Webhook Validation**: Verify Twilio signatures (implemented)
3. **Rate Limiting**: Add rate limiting to prevent abuse
4. **Data Access**: Service role key has full DB access - keep secure
5. **HTTPS Only**: Always use HTTPS for production webhook URL

## Next Phase Enhancements

- [ ] Customer notifications (payment reminders, etc.)
- [ ] Inventory alerts (low stock notifications)
- [ ] Sales analytics with charts
- [ ] Multi-language support
- [ ] Voice message responses
- [ ] File upload processing (invoices, receipts)
