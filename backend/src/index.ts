import express from 'express';
import { config as loadDotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupWhatsAppRoutes } from './routes/whatsapp.js';
import { setupReportRoutes } from './routes/reports.js';
import { initializeScheduledJobs } from './jobs/scheduler.js';
import { bootstrapPaymentStack } from './bootstrap/payments.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env then monorepo root .env.local (M-Pesa keys live there)
loadDotenv();
loadDotenv({ path: path.resolve(__dirname, '../../.env.local') });
loadDotenv({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// CORS for Next.js frontend
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Store-Id, X-M2M-Signature'
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
setupWhatsAppRoutes(app);
setupReportRoutes(app);

// M-Pesa payment stack
try {
  bootstrapPaymentStack(app);
  console.log('M-Pesa payment routes mounted at /api/payments/* and /api/webhooks/mpesa');
} catch (error) {
  console.error('Failed to bootstrap payment stack:', error);
}

// Initialize scheduled jobs
initializeScheduledJobs();

app.listen(PORT, () => {
  console.log(`FAITH-POS backend running on port ${PORT}`);
});
