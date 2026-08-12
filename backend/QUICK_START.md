# Quick Start - WhatsApp AI Agent

## 5-Minute Setup

### Step 1: Get API Keys

1. **Twilio WhatsApp**
   - Go to [Twilio Console](https://www.twilio.com/console)
   - Create account if needed
   - Get: Account SID, Auth Token
   - Enable WhatsApp → Get WhatsApp Number

2. **Anthropic API**
   - Go to [Anthropic Console](https://console.anthropic.com)
   - Get: API Key

3. **Supabase Keys** (already have)
   - From your project settings

### Step 2: Configure Backend

```bash
cd backend
npm install
cp .env.example .env.local
```

Edit `.env.local`:
```env
TWILIO_ACCOUNT_SID=your_sid_here
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_WHATSAPP_NUMBER=+1234567890
ANTHROPIC_API_KEY=your_key_here
SUPABASE_URL=your_url_here
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OWNER_WHATSAPP_NUMBER=+9876543210
```

### Step 3: Run Locally (Testing)

```bash
cd backend
npm run dev
```

Service runs on `http://localhost:3001`

### Step 4: Setup Twilio Webhook

1. Go to Twilio Console → WhatsApp Settings
2. For testing locally, use ngrok:
   ```bash
   ngrok http 3001
   ```
3. Copy ngrok URL (e.g., `https://abc123.ngrok.io`)
4. In Twilio, set webhook to:
   ```
   https://abc123.ngrok.io/whatsapp/webhook
   ```

### Step 5: Test

Send WhatsApp message to Twilio number from your phone:
- "hello"
- "daily sales"
- "stock status"

Should get response within seconds!

## Commands

| Command | Response |
|---------|----------|
| hello | Greeting with available commands |
| daily sales | Today's sales summary |
| daily credit | Today's credit summary |
| stock status | Current inventory |
| customer info | Customer details |

## Automated Reports

✅ **Daily Reports** - 8 AM
- Sales summary
- Credit summary
- Store performance

✅ **Monthly Reports** - 1st of month, 8 AM
- Complete monthly performance
- Revenue analysis

## Deployment Checklist

- [ ] Get all API keys
- [ ] Configure `.env.local`
- [ ] Test locally with ngrok
- [ ] Deploy to production server
- [ ] Update Twilio webhook URL
- [ ] Add owner phone number
- [ ] Verify daily/monthly reports working

## Common Issues

**"No response to messages"**
- Check webhook URL in Twilio is correct
- Check service is running: `curl localhost:3001/health`
- Check logs for errors

**"Reports not sending"**
- Verify OWNER_WHATSAPP_NUMBER format: +country code + number
- Check service is running 24/7
- Check Supabase credentials

**"AI not responding"**
- Verify ANTHROPIC_API_KEY is correct
- Check API quota on Anthropic console

## Production Deployment

### Option 1: Your VPS (Recommended)
```bash
# SSH into your server
ssh user@your-server.com

# Clone/setup backend
cd /opt/whatsapp-agent
npm install
npm run build

# Run with PM2
pm2 start dist/index.js --name "whatsapp-agent"
pm2 save
```

### Option 2: Docker
```bash
docker build -t whatsapp-agent .
docker run -d -p 3001:3001 --env-file .env.local whatsapp-agent
```

### Option 3: Cloud Functions
Deploy `src/routes/whatsapp.ts` handler to:
- Google Cloud Functions
- AWS Lambda
- Azure Functions

## File Structure

```
backend/
├── src/
│   ├── index.ts                 ← Main server
│   ├── services/
│   │   ├── ai-agent.ts          ← AI logic
│   │   ├── whatsapp.ts          ← Twilio integration
│   │   ├── supabase.ts          ← Database queries
│   │   └── pdf-generator.ts     ← Reports
│   ├── routes/
│   │   ├── whatsapp.ts          ← Message webhook
│   │   └── reports.ts           ← Report endpoints
│   └── jobs/
│       └── scheduler.ts         ← Automated tasks
├── package.json
├── tsconfig.json
└── .env.local                   ← Your config (don't commit!)
```

## Next Steps

1. ✅ Run backend locally
2. ✅ Test with Twilio WhatsApp
3. ✅ Deploy to production
4. ✅ Customize AI prompts
5. ✅ Add more commands/reports

See `SETUP.md` for detailed documentation.
