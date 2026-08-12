import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface DailyReportData {
  date: Date;
  totalSales: number;
  salesCount: number;
  totalCredits: number;
  creditCount: number;
  topProducts?: { name: string; quantity: number }[];
  stores?: { name: string; sales: number }[];
}

interface MonthlyReportData {
  month: string;
  totalSales: number;
  totalCredits: number;
  stockValue: number;
  topProducts?: { name: string; revenue: number }[];
  storePerformance?: { name: string; sales: number }[];
}

export async function generateDailyReport(
  data: DailyReportData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Daily Sales Report', {
      align: 'center',
    });
    doc.fontSize(12)
      .font('Helvetica')
      .text(data.date.toLocaleDateString(), { align: 'center' })
      .moveDown();

    // Sales Section
    doc.fontSize(14).font('Helvetica-Bold').text('Sales Summary');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Sales: ${data.totalSales}`, { indent: 20 });
    doc.text(`Number of Transactions: ${data.salesCount}`, { indent: 20 });
    doc.text(
      `Average Sale: ${(data.totalSales / data.salesCount).toFixed(2)}`,
      { indent: 20 }
    );
    doc.moveDown();

    // Credits Section
    doc.fontSize(14).font('Helvetica-Bold').text('Credit Summary');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Credit Transactions: ${data.totalCredits}`, { indent: 20 });
    doc.text(`Number of Credit Transactions: ${data.creditCount}`, {
      indent: 20,
    });
    doc.moveDown();

    // Store Performance
    if (data.stores && data.stores.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Store Performance');
      doc.fontSize(11).font('Helvetica');
      data.stores.forEach((store) => {
        doc.text(`${store.name}: ${store.sales}`, { indent: 20 });
      });
      doc.moveDown();
    }

    // Top Products
    if (data.topProducts && data.topProducts.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Top Products');
      doc.fontSize(11).font('Helvetica');
      data.topProducts.slice(0, 5).forEach((product) => {
        doc.text(`${product.name}: ${product.quantity} units`, { indent: 20 });
      });
    }

    doc.end();
  });
}

export async function generateMonthlyReport(
  data: MonthlyReportData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Monthly Report', {
      align: 'center',
    });
    doc.fontSize(12).font('Helvetica').text(data.month, { align: 'center' });
    doc.moveDown();

    // Financial Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Financial Summary');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Sales: ${data.totalSales}`, { indent: 20 });
    doc.text(`Total Credits: ${data.totalCredits}`, { indent: 20 });
    doc.text(`Stock Value: ${data.stockValue}`, { indent: 20 });
    doc.moveDown();

    // Store Performance
    if (data.storePerformance && data.storePerformance.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Store Performance');
      doc.fontSize(11).font('Helvetica');
      data.storePerformance.forEach((store) => {
        doc.text(`${store.name}: ${store.sales}`, { indent: 20 });
      });
      doc.moveDown();
    }

    // Top Products
    if (data.topProducts && data.topProducts.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Top Revenue Products');
      doc.fontSize(11).font('Helvetica');
      data.topProducts.slice(0, 10).forEach((product) => {
        doc.text(`${product.name}: ${product.revenue}`, { indent: 20 });
      });
    }

    doc.end();
  });
}
