import { Express, Request, Response } from 'express';
import * as supabaseService from '../services/supabase.js';
import * as pdfService from '../services/pdf-generator.js';

export function setupReportRoutes(app: Express) {
  // Generate daily report endpoint
  app.get('/reports/daily', async (req: Request, res: Response) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [sales, credits] = await Promise.all([
        supabaseService.getSalesSummary(today, tomorrow),
        supabaseService.getCreditSummary(today, tomorrow),
      ]);

      const totalSales = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const totalCredits = credits.reduce((sum, c) => sum + (c.amount || 0), 0);

      const pdf = await pdfService.generateDailyReport({
        date: today,
        totalSales,
        salesCount: sales.length,
        totalCredits,
        creditCount: credits.length,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="daily-report-${today.toISOString().split('T')[0]}.pdf"`
      );
      res.send(pdf);
    } catch (error) {
      console.error('Daily report error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // Generate monthly report endpoint
  app.get('/reports/monthly', async (req: Request, res: Response) => {
    try {
      const month = req.query.month as string;
      const [year, monthNum] = month.split('-').map(Number);

      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 1);

      const [sales, credits, stock] = await Promise.all([
        supabaseService.getSalesSummary(startDate, endDate),
        supabaseService.getCreditSummary(startDate, endDate),
        supabaseService.getStockSummary(),
      ]);

      const totalSales = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const totalCredits = credits.reduce((sum, c) => sum + (c.amount || 0), 0);
      const stockValue = stock.reduce((sum, s) => sum + (s.quantity || 0), 0);

      const pdf = await pdfService.generateMonthlyReport({
        month: new Date(year, monthNum - 1).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        }),
        totalSales,
        totalCredits,
        stockValue,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="monthly-report-${month}.pdf"`
      );
      res.send(pdf);
    } catch (error) {
      console.error('Monthly report error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });
}
