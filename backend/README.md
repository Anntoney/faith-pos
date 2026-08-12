# WhatsApp AI Agent Backend

AI-powered backend service that integrates WhatsApp (via Twilio) with Claude AI to provide business intelligence, real-time message processing, and automated daily/monthly reports.

## Quick Links

- **Getting Started**: See [QUICK_START.md](./QUICK_START.md) for 5-minute setup
- **Detailed Setup**: See [SETUP.md](./SETUP.md) for comprehensive guide
- **Production Deployment**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup
- **API Documentation**: See [API_REFERENCE.md](./API_REFERENCE.md) for endpoint details

## Features

✨ **Real-time Message Processing**
- Receives WhatsApp messages via Twilio
- AI-powered natural language processing
- Instant responses with business insights

📊 **Automated Reports**
- **Daily Reports** (8 AM): Sales, credits, store performance
- **Monthly Reports** (1st, 8 AM): Comprehensive performance analysis
- PDF generation and WhatsApp delivery

🤖 **AI Agent**
- Claude 3.5 Sonnet integration
- Context-aware responses
- Multi-source data aggregation
- Natural language understanding

🗄️ **Database Integration**
- Supabase PostgreSQL queries
- Real-time data aggregation
- Support for multiple stores
- Customer and product data

## Architecture

```
WhatsApp ──> Twilio ──> Backend ──> Claude AI ──> Supabase
  (User)              (Node.js)    (Intelligence)  (Data)
                         │
                         └─> PDF Reports ──> WhatsApp (Owner)
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 18+ |
| Language | TypeScript |
| Framework | Express.js |
| AI | Anthropic Claude |
| Database | Supabase (PostgreSQL) |
| Messaging | Twilio WhatsApp API |
| Reporting | PDFKit |
| Scheduling | node-cron |
| Deployment | PM2 / Docker / Systemd |

## Project Structure

```
backend/
├── src/
│   ├── index.ts                 # Express server
│   ├── config/
│   │   └── env.ts              # Environment config
│   ├── services/
│   │   ├── supabase.ts         # Database queries
│   │   ├── ai-agent.ts         # Claude integration
│   │   ├── whatsapp.ts         # Twilio integration
│   │   └── pdf-generator.ts    # Report generation
│   ├── routes/
│   │   ├── whatsapp.ts         # Message webhook
│   │   └── reports.ts          # Report endpoints
│   └── jobs/
│       └── scheduler.ts        # Cron jobs
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── Dockerfile                  # Docker image
├── docker-compose.yml          # Docker Compose
├── ecosystem.config.cjs        # PM2 config
├── .env.example                # Environment template
├── README.md                   # This file
├── QUICK_START.md              # 5-minute setup
├── SETUP.md                    # Detailed guide
├── DEPLOYMENT.md               # Production setup
└── API_REFERENCE.md            # API documentation
```

## Setup Steps

### 1. Prerequisites
- Node.js 18+
- Twilio account with WhatsApp Business API
- Anthropic API key
- Supabase credentials (from main project)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

### 4. Run Locally
```bash
npm run dev
```

### 5. Deploy
```bash
npm run build
pm2 start ecosystem.config.cjs
```

See [QUICK_START.md](./QUICK_START.md) for the fastest way to get running.

## Environment Variables

```env
# Twilio (from Twilio Console)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=+1234567890

# Anthropic (from Anthropic Console)
ANTHROPIC_API_KEY=

# Supabase (use existing keys)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Configuration
OWNER_WHATSAPP_NUMBER=+9876543210
PORT=3001
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/whatsapp/webhook` | Receive WhatsApp messages |
| GET | `/whatsapp/webhook` | Twilio challenge validation |
| GET | `/reports/daily` | Download daily PDF report |
| GET | `/reports/monthly` | Download monthly PDF report |
| GET | `/health` | Health check |

See [API_REFERENCE.md](./API_REFERENCE.md) for details.

## Message Commands

Send any of these via WhatsApp:
- `"hello"` - Get help and available commands
- `"daily sales"` - Today's sales summary
- `"daily credit"` - Today's credit transactions
- `"stock status"` - Current inventory levels
- `"customer info"` - Customer details
- Or ask any natural language question!

## Automated Reports

### Daily Reports
- **Time**: 8:00 AM every day
- **Contains**: Sales summary, credit transactions, store performance
- **Delivered**: WhatsApp message to owner

### Monthly Reports
- **Time**: 1st of month, 8:00 AM
- **Contains**: Complete monthly performance, revenue analysis
- **Delivered**: WhatsApp message to owner

## Development

### Local Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Test
```bash
# Health check
curl http://localhost:3001/health

# Daily report
curl http://localhost:3001/reports/daily

# Monthly report
curl "http://localhost:3001/reports/monthly?month=2024-01"
```

## Production Deployment

### Option 1: PM2 (Recommended)
```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Option 2: Docker
```bash
docker-compose up -d
```

### Option 3: Systemd
See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup.

## Monitoring

### View Logs
```bash
pm2 logs whatsapp-agent
```

### Health Check
```bash
curl http://localhost:3001/health
```

### Monitor Service
```bash
pm2 monit
```

## Troubleshooting

### No messages received
- Check webhook URL in Twilio is correct
- Verify backend is running: `curl http://localhost:3001/health`
- Check logs: `pm2 logs whatsapp-agent`

### Reports not sending
- Verify OWNER_WHATSAPP_NUMBER is correct
- Check service is running 24/7
- Check Supabase credentials

### AI not responding
- Verify ANTHROPIC_API_KEY is valid
- Check API quota on Anthropic console

See [SETUP.md](./SETUP.md) for detailed troubleshooting.

## Costs

Estimated monthly costs (typical usage):
- **Twilio**: $5-15 ($0.0075 per WhatsApp message)
- **Anthropic**: $5-20 (Claude token usage)
- **Supabase**: $0 (included in existing plan)
- **Total**: $10-35/month

## Security

- 🔐 API keys stored in `.env.local` (never committed)
- ✅ Twilio webhook signature validation
- 🔒 HTTPS required for production
- 🛡️ Service role key restricted to server-side only
- 📝 All requests logged and monitored

## Performance

- Message response time: 2-5 seconds
- Report generation: 1-2 seconds
- Webhook delivery: <100ms
- Database queries: <100ms average

## Scalability

For higher volumes:
1. Add message queues (Bull, RabbitMQ)
2. Scale to multiple instances
3. Add caching (Redis)
4. Implement rate limiting
5. Use load balancer
6. Setup CDN for reports

## Support

- 📖 [QUICK_START.md](./QUICK_START.md) - Get started in 5 minutes
- 📚 [SETUP.md](./SETUP.md) - Comprehensive setup guide
- 🚀 [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment
- 📋 [API_REFERENCE.md](./API_REFERENCE.md) - API documentation
- ✅ [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md) - Implementation checklist

## Contributing

To extend functionality:
1. Add new routes in `src/routes/`
2. Add new services in `src/services/`
3. Update AI prompts in `src/services/ai-agent.ts`
4. Add new cron jobs in `src/jobs/scheduler.ts`
5. Test thoroughly before deploying

## License

This project is part of the main business management system.

## Next Steps

1. ✅ Follow [QUICK_START.md](./QUICK_START.md)
2. ✅ Get API credentials
3. ✅ Configure environment
4. ✅ Test locally
5. ✅ Deploy to production
6. ✅ Customize as needed
7. ✅ Monitor and optimize

---

**Ready to start?** → [QUICK_START.md](./QUICK_START.md)
