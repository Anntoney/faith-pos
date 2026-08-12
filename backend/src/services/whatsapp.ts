import twilio from 'twilio';
import { config } from '../config/env.js';

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

export async function sendMessage(
  toPhone: string,
  message: string
): Promise<void> {
  try {
    await client.messages.create({
      from: `whatsapp:${config.twilio.whatsappNumber}`,
      to: `whatsapp:${toPhone}`,
      body: message,
    });
    console.log(`Message sent to ${toPhone}`);
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

export async function sendMessageWithAttachment(
  toPhone: string,
  message: string,
  mediaUrl: string
): Promise<void> {
  try {
    await client.messages.create({
      from: `whatsapp:${config.twilio.whatsappNumber}`,
      to: `whatsapp:${toPhone}`,
      body: message,
      mediaUrl: [mediaUrl],
    });
    console.log(`Message with attachment sent to ${toPhone}`);
  } catch (error) {
    console.error('Error sending WhatsApp message with attachment:', error);
    throw error;
  }
}

export function validateWebhook(
  reqUrl: string,
  reqBody: string,
  twilioSignature: string
): boolean {
  const twilioAuthToken = config.twilio.authToken;
  const crypto = require('crypto');

  const hash = crypto
    .createHmac('sha1', twilioAuthToken)
    .update(reqUrl + reqBody, 'utf8')
    .digest('base64');

  return hash === twilioSignature;
}
