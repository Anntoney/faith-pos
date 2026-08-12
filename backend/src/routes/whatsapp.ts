import { Express, Request, Response } from 'express';
import { processQuery } from '../services/ai-agent.js';
import * as whatsappService from '../services/whatsapp.js';

export function setupWhatsAppRoutes(app: Express) {
  // Webhook for receiving messages
  app.post('/whatsapp/webhook', async (req: Request, res: Response) => {
    try {
      const incomingMessage = req.body.Body || '';
      const senderPhone = req.body.From?.replace('whatsapp:', '') || '';

      console.log(`Received message from ${senderPhone}: ${incomingMessage}`);

      // Process message with AI agent
      const result = await processQuery(incomingMessage);

      // Send response back
      if (result.type !== 'error') {
        await whatsappService.sendMessage(senderPhone, result.content);
      } else {
        await whatsappService.sendMessage(senderPhone, result.content);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Processing failed' });
    }
  });

  // Webhook validation (GET request from Twilio)
  app.get('/whatsapp/webhook', (req: Request, res: Response) => {
    res.send(req.query['hub.challenge']);
  });
}
