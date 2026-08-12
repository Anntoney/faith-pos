import cron from 'node-cron';
import * as supabaseService from '../services/supabase.js';
import * as pdfService from '../services/pdf-generator.js';
import * as whatsappService from '../services/whatsapp.js';
import { config } from '../config/env.js';

export function initializeScheduledJobs() {
  // Daily report - 8 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('Running daily report job...');
    try {
      await sendDailyReport();
    } catch (error) {
      console.error('Daily report job error:', error);
    }
  });

  // Monthly report - 1st of month at 8 AM
  cron.schedule('0 8 1 * *', async () => {
    console.log('Running monthly report job...');
    try {
      await sendMonthlyReport();
    } catch (error) {
      console.error('Monthly report job error:', error);
    }
  });
}

async function sendDailyReport() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [sales, credits, stores] = await Promise.all([
      supabaseService.getSalesSummary(today, tomorrow),
      supabaseService.getCreditSummary(today, tomorrow),
      supabaseService.getStores(),
    ]);

    const totalSales = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    const totalCredits = credits.reduce((sum, c) => sum + (c.amount || 0), 0);

    const storePerformance = stores.map((store) => ({
      ...store,
      sales: sales
        .filter((s) => s.store_id === store.id)
        .reduce((sum, s) => sum + (s.total_amount || 0), 0),
    }));

    const pdf = await pdfService.generateDailyReport({
      date: today,
      totalSales,
      salesCount: sales.length,
      totalCredits,
      creditCount: credits.length,
      stores: storePerformance,
    });

    // Convert PDF to base64 for sending (simplified - you'd upload to storage)
    const summary = `
📊 *Daily Report - ${today.toLocaleDateString()}*

💰 Sales: ${totalSales}
📝 Transactions: ${sales.length}

💳 Credits: ${totalCredits}
📋 Credit Transactions: ${credits.length}

📈 Store Performance:
${storePerformance.map((s) => `• ${s.name}: ${s.sales}`).join('\n')}
    `;

    await whatsappService.sendMessage(config.ownerPhone, summary);
    console.log('Daily report sent successfully');
  } catch (error) {
    console.error('Error sending daily report:', error);
  }
}

async function sendMonthlyReport() {
  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [sales, credits, stock, stores] = await Promise.all([
      supabaseService.getSalesSummary(lastMonth, currentMonth),
      supabaseService.getCreditSummary(lastMonth, currentMonth),
      supabaseService.getStockSummary(),
      supabaseService.getStores(),
    ]);

    const totalSales = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    const totalCredits = credits.reduce((sum, c) => sum + (c.amount || 0), 0);
    const stockValue = stock.reduce((sum, s) => sum + (s.quantity || 0), 0);

    const storePerformance = stores.map((store) => ({
      ...store,
      sales: sales
        .filter((s) => s.store_id === store.id)
        .reduce((sum, s) => sum + (s.total_amount || 0), 0),
    }));

    const summary = `
📊 *Monthly Report - ${lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}*

💰 Total Sales: ${totalSales}
💳 Total Credits: ${totalCredits}
📦 Stock Value: ${stockValue}

📈 Store Performance:
${storePerformance.map((s) => `• ${s.name}: ${s.sales}`).join('\n')}
    `;

    await whatsappService.sendMessage(config.ownerPhone, summary);
    console.log('Monthly report sent successfully');
  } catch (error) {
    console.error('Error sending monthly report:', error);
  }
}
