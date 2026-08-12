import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import * as supabaseService from './supabase.js';

const client = new Anthropic();

export interface QueryResult {
  type: 'report' | 'insight' | 'error';
  content: string;
  data?: unknown;
}

export async function processQuery(message: string): Promise<QueryResult> {
  try {
    // Build context with available data
    const context = await buildContext();

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: `You are an AI agent for a business management system. You help the owner understand their business metrics and generate insights.
      
Available commands:
- "daily sales" - Get today's sales summary
- "daily credit" - Get today's credit summary  
- "daily report" - Get complete daily report
- "stock status" - Get current stock levels
- "customer info [name]" - Get customer details

Current business data:
${context}

Respond in a clear, concise manner suitable for WhatsApp. Include key metrics and insights.`,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
    });

    const content =
      response.content[0].type === 'text' ? response.content[0].text : '';

    return {
      type: 'report',
      content,
    };
  } catch (error) {
    console.error('AI Agent error:', error);
    return {
      type: 'error',
      content: 'Sorry, I encountered an error processing your request.',
    };
  }
}

async function buildContext(): Promise<string> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [sales, credits, stock] = await Promise.all([
      supabaseService.getSalesSummary(today, tomorrow),
      supabaseService.getCreditSummary(today, tomorrow),
      supabaseService.getStockSummary(),
    ]);

    const totalSales = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    const totalCredits = credits.reduce((sum, c) => sum + (c.amount || 0), 0);

    return `
Today's Metrics:
- Total Sales: ${totalSales}
- Total Credit Transactions: ${totalCredits}
- Number of Transactions: ${sales.length}
- Stock Items: ${stock.length}
`;
  } catch (error) {
    console.error('Error building context:', error);
    return 'Context data unavailable';
  }
}
