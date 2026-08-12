# WhatsApp AI Agent Setup Guide

## Prerequisites
- Node.js 18+
- Twilio account with WhatsApp Business API access
- Anthropic API key
- Supabase account (already configured in your project)

## Installation

1. Install dependencies:
```bash
cd backend
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env.local
```

3. Fill in `.env.local` with your credentials:
   - **Twilio**: Get from Twilio console (Account SID, Auth Token, WhatsApp Number)
   - **Anthropic**: Get from Anthropic console
   - **Supabase**: Use existing keys from your Supabase project
   - **Owner Phone**: Your WhatsApp number to receive reports

## Twilio Setup

1. Go to [Twilio Console](https://www.twilio.com/console)
2. Enable WhatsApp via Programmable Messaging
3. Create a WhatsApp sender (get phone number)
4. Add your number as approved recipient for testing
5. Configure webhook URL:
   - Production: `https://your-domain.com/whatsapp/webhook`
   - Testing: Use ngrok or similar for local testing

## Running Locally

```bash
# Development with auto-reload
npm run dev

# For production
npm run build
npm start
```

## Testing the Agent

### Test via WhatsApp
1. Send a message to your Twilio WhatsApp number
2. Try commands like:
   - "daily sales"
   - "daily credit"
   - "stock status"
   - "customer info"

### Test Reports
- Daily reports sent at 8 AM
- Monthly reports sent on 1st of month at 8 AM

## Webhook Configuration

In Twilio console, set webhook URL to:
```
POST: https://your-backend.com/whatsapp/webhook
```

## API Endpoints

- `POST /whatsapp/webhook` - Receives WhatsApp messages
- `GET /reports/daily` - Generate daily PDF report
- `GET /reports/monthly?month=2024-01` - Generate monthly report
- `GET /health` - Health check

## Deployment

### Option 1: PM2 (Production Server)
```bash
pm2 start backend/dist/index.js --name "whatsapp-agent"
pm2 save
pm2 startup
```

### Option 2: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

### Option 3: Cloud Functions (Google Cloud, AWS Lambda)
Deploy the handler function separately for serverless execution.

## Troubleshooting

### Messages not received
- Check Twilio webhook URL is correct
- Verify webhook is receiving POST requests
- Check your phone number is approved in Twilio sandbox

### Reports not sending
- Verify cron jobs are running (check server logs)
- Ensure OWNER_WHATSAPP_NUMBER is in correct format
- Check Supabase credentials

### AI responses not working
- Verify ANTHROPIC_API_KEY is valid
- Check API quota/billing on Anthropic
- Review Claude model name in ai-agent.ts

## Next Steps

1. Customize AI prompts in `ai-agent.ts`
2. Add more report types as needed
3. Configure backup notification channels
4. Set up error logging/monitoring
5. Add authentication for API endpoints
