# WhatsApp AI Agent - Setup Checklist

Complete this checklist to get your AI agent up and running.

## Phase 1: Get API Credentials ✅

### Twilio Setup
- [ ] Go to https://www.twilio.com/console
- [ ] Sign up or log in
- [ ] Get **Account SID** from dashboard
- [ ] Get **Auth Token** from dashboard
- [ ] Go to Messaging → WhatsApp
- [ ] Create WhatsApp Business Account
- [ ] Get **WhatsApp Number** (e.g., +1234567890)
- [ ] Add your personal number as approved recipient
- [ ] Note: WhatsApp sandbox can send test messages

### Anthropic API Setup
- [ ] Go to https://console.anthropic.com
- [ ] Sign up (need credit card for API access)
- [ ] Go to API Keys
- [ ] Create new API key
- [ ] Copy **API Key** (save it!)
- [ ] Check billing limits

### Supabase (Already Set)
- [ ] You already have these from main project
- [ ] Location: Settings → API
- [ ] Note: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Phase 2: Setup Backend ✅

### Environment Configuration
- [ ] Navigate to `backend/` directory
- [ ] Run: `npm install`
- [ ] Copy: `cp .env.example .env.local`
- [ ] Edit `.env.local` and fill in all values:
  - [ ] `TWILIO_ACCOUNT_SID`
  - [ ] `TWILIO_AUTH_TOKEN`
  - [ ] `TWILIO_WHATSAPP_NUMBER`
  - [ ] `ANTHROPIC_API_KEY`
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `OWNER_WHATSAPP_NUMBER` (your WhatsApp number)

### Verify Setup
- [ ] Run: `npm run build`
- [ ] No build errors? ✅

## Phase 3: Test Locally ✅

### Start Backend Service
- [ ] Run: `npm run dev`
- [ ] Should see: "WhatsApp AI Agent running on port 3001"
- [ ] Health check: `curl http://localhost:3001/health`

### Setup ngrok (For Webhook Testing)
- [ ] Download ngrok: https://ngrok.com/download
- [ ] In new terminal: `ngrok http 3001`
- [ ] Copy the URL (e.g., `https://abc123.ngrok.io`)
- [ ] Keep ngrok running

### Configure Twilio Webhook
- [ ] Go to Twilio Console → WhatsApp Settings
- [ ] Set webhook URL to: `https://your-ngrok-url/whatsapp/webhook`
- [ ] Method: POST
- [ ] Save

### Send Test Message
- [ ] Send WhatsApp message to Twilio number
- [ ] Wait for response (should take 2-5 seconds)
- [ ] Try: "hello", "daily sales", "stock status"
- [ ] Should get AI response back ✅

### Check Logs
- [ ] In terminal where backend runs:
- [ ] Should see: "Received message from..."
- [ ] Should see: "Message sent to..."

## Phase 4: Production Deployment ✅

### Choose Deployment Method

**Option A: PM2 (Recommended for VPS)**
- [ ] SSH into your server
- [ ] Clone repository to `/opt/whatsapp-agent`
- [ ] Run: `cd /opt/whatsapp-agent/backend`
- [ ] Create `.env.local` with credentials
- [ ] Run: `npm install`
- [ ] Run: `npm run build`
- [ ] Run: `pm2 start ecosystem.config.cjs`
- [ ] Run: `pm2 save` and `pm2 startup`
- [ ] Verify: `pm2 status`

**Option B: Docker**
- [ ] On your server with Docker installed
- [ ] Navigate to `backend/` directory
- [ ] Create `.env` file with credentials
- [ ] Run: `docker-compose up -d`
- [ ] Verify: `docker-compose ps`
- [ ] Check logs: `docker-compose logs -f whatsapp-agent`

**Option C: Systemd Service (Linux)**
- [ ] Create service file: `/etc/systemd/system/whatsapp-agent.service`
- [ ] Copy config from DEPLOYMENT.md
- [ ] Enable: `sudo systemctl enable whatsapp-agent`
- [ ] Start: `sudo systemctl start whatsapp-agent`
- [ ] Check: `sudo systemctl status whatsapp-agent`

### Setup Reverse Proxy (Nginx)
- [ ] Add Nginx config from DEPLOYMENT.md
- [ ] Test: `sudo nginx -t`
- [ ] Reload: `sudo systemctl reload nginx`
- [ ] Configure SSL/HTTPS with certbot

### Update Twilio Webhook
- [ ] Remove ngrok URL
- [ ] Set webhook URL to: `https://your-domain.com/whatsapp/webhook`
- [ ] Save in Twilio console

### Verify Production Setup
- [ ] Send WhatsApp message to Twilio number
- [ ] Should get response within 5 seconds
- [ ] Check service logs
- [ ] Verify database connectivity

## Phase 5: Automated Reports ✅

### Verify Daily Reports
- [ ] Wait until 8 AM (or manually trigger for testing)
- [ ] Should receive WhatsApp message with daily summary
- [ ] Check message contains: Sales, Credits, Store info
- [ ] For manual test:
  ```bash
  curl http://localhost:3001/reports/daily
  ```

### Verify Monthly Reports
- [ ] Wait until 1st of month at 8 AM (or manually test)
- [ ] Should receive monthly summary
- [ ] Check: `curl http://localhost:3001/reports/monthly?month=2024-01`

### Check Report Scheduling
- [ ] View cron jobs in `backend/src/jobs/scheduler.ts`
- [ ] Daily: `0 8 * * *` (8 AM every day)
- [ ] Monthly: `0 8 1 * *` (1st, 8 AM)

## Phase 6: Monitoring & Maintenance ✅

### Setup Monitoring
- [ ] Add health check cron job (check every 5 mins)
- [ ] Setup log rotation
- [ ] Create backup script
- [ ] Monitor API usage/costs

### First Week Tasks
- [ ] Day 1: Verify messages arriving
- [ ] Day 2: Check daily report format
- [ ] Day 3: Monitor for errors in logs
- [ ] Day 4: Test failure scenarios
- [ ] Day 5: Optimize based on usage
- [ ] Day 6-7: Fine-tune AI prompts

### Regular Maintenance
- [ ] Weekly: Check logs for errors
- [ ] Monthly: Review costs
- [ ] Quarterly: Update dependencies
- [ ] Annually: Security audit

## Phase 7: Customization (Optional) ✅

### Customize AI Responses
- [ ] Edit `backend/src/services/ai-agent.ts`
- [ ] Modify system prompt
- [ ] Add custom commands
- [ ] Rebuild: `npm run build`

### Add Custom Reports
- [ ] Edit `backend/src/services/pdf-generator.ts`
- [ ] Add new report types
- [ ] Update report routes
- [ ] Rebuild and test

### Add More Commands
- [ ] Edit AI agent context in `ai-agent.ts`
- [ ] Add documentation
- [ ] Test thoroughly
- [ ] Deploy

## Troubleshooting Checklist

### No Messages Received
- [ ] Is backend running? `curl http://localhost:3001/health`
- [ ] Is webhook URL correct in Twilio?
- [ ] Is Twilio number approved for your account?
- [ ] Check logs: `pm2 logs whatsapp-agent`
- [ ] Try sending from different number?

### No AI Response
- [ ] Check ANTHROPIC_API_KEY is valid
- [ ] Check API quota/billing on Anthropic
- [ ] Check logs for errors
- [ ] Is Claude model available?

### Reports Not Sending
- [ ] Check cron jobs: `pm2 logs whatsapp-agent`
- [ ] Is OWNER_WHATSAPP_NUMBER correct?
- [ ] Check Supabase connectivity
- [ ] Verify database tables exist

### Database Errors
- [ ] Verify SUPABASE_URL is correct
- [ ] Check SUPABASE_SERVICE_ROLE_KEY
- [ ] Test connection: Query directly from app
- [ ] Check row-level security policies

## Success Indicators ✅

Your setup is complete when:
- [ ] Backend runs without errors
- [ ] WhatsApp messages arrive in real-time
- [ ] AI responds with relevant information
- [ ] Daily report sent at 8 AM
- [ ] Monthly report sent on 1st of month
- [ ] No errors in logs
- [ ] Service survives server restart
- [ ] Reports are readable and useful

## Quick Reference Commands

```bash
# Development
cd backend
npm run dev

# Build
npm run build

# Start with PM2
pm2 start ecosystem.config.cjs

# View logs
pm2 logs whatsapp-agent

# Health check
curl http://localhost:3001/health

# Docker
docker-compose up -d
docker-compose logs -f

# Test reports
curl http://localhost:3001/reports/daily
curl http://localhost:3001/reports/monthly?month=2024-01
```

## Support Resources

If stuck:
1. Check `.env` variables are all filled
2. Review `backend/QUICK_START.md`
3. Read `backend/SETUP.md` for details
4. Check `backend/DEPLOYMENT.md` for production
5. Look at logs: `pm2 logs whatsapp-agent`
6. Search error message online

## Next Level Features (Future)

Once basic setup works:
- [ ] Voice messages support
- [ ] Document/receipt analysis
- [ ] Customer notifications
- [ ] Inventory alerts
- [ ] Payment reminders
- [ ] Multi-language support
- [ ] Dashboard analytics
- [ ] Custom webhooks

---

**Congratulations!** Your AI-powered WhatsApp agent is ready to go! 🚀

Start with Phase 1 and work through the checklist. Each phase is independent and can be tested before moving to the next.
