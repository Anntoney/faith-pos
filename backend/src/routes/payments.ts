/**
 * Payment Routes
 * Handles HTTP endpoints for payment operations
 * Requirements: 2.1, 2.2, 2.3, 1.2, 3.2, 7.5, 8.1
 * TASK 20: Create Payment API Endpoints
 */

import { Express, Request, Response } from 'express';
import { PaymentService } from '../services/PaymentService';
import { WebhookHandler } from '../handlers/WebhookHandler';
import { OfflineQueueManager } from '../services/OfflineQueueManager';
import { ConfigurationService } from '../services/ConfigurationService';
import {
  validatePaymentRequest,
  validatePaymentId,
  validateStoreId,
  validatePaginationParams,
} from '../middleware/validation';

export function setupPaymentRoutes(
  app: Express,
  paymentService: PaymentService,
  webhookHandler: WebhookHandler,
  offlineQueueManager?: OfflineQueueManager,
  configurationService?: ConfigurationService
) {
  /**
   * System / offline status
   * GET /api/system/status
   * Requirements: 8.2
   */
  app.get('/api/system/status', async (_req: Request, res: Response) => {
    try {
      const online = offlineQueueManager
        ? await offlineQueueManager.detectConnectivity()
        : true;

      return res.status(200).json({
        online,
        offline_mode: !online,
        message: online
          ? 'System online'
          : 'System Offline - Payments will be processed when online',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(200).json({
        online: false,
        offline_mode: true,
        message: 'System Offline - Payments will be processed when online',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * Queue payment for offline processing
   * POST /api/payments/queue
   * Requirements: 8.1
   */
  app.post('/api/payments/queue', validatePaymentRequest, async (req: Request, res: Response) => {
    try {
      if (!offlineQueueManager) {
        return res.status(503).json({
          error: 'OFFLINE_QUEUE_UNAVAILABLE',
          message: 'Offline queue is not configured',
        });
      }

      const { transaction_id, phone_number, amount, store_id } = req.body;
      const result = await offlineQueueManager.queuePayment(
        transaction_id,
        phone_number,
        amount,
        store_id
      );

      return res.status(200).json({
        status: 'queued',
        queue_id: result.queueId,
        message: 'Payment queued for processing when online',
      });
    } catch (error) {
      return res.status(500).json({
        error: 'QUEUE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to queue payment',
      });
    }
  });

  /**
   * Initiate a new payment
   * POST /api/payments/initiate
   */
  app.post('/api/payments/initiate', validatePaymentRequest, async (req: Request, res: Response) => {
    try {
      const { transaction_id, phone_number, amount, store_id, apply_to_credit, customer_id } =
        req.body;

      const payment = await paymentService.initiatePayment(
        transaction_id,
        phone_number,
        amount,
        store_id,
        apply_to_credit === true,
        customer_id
      );

      return res.status(200).json({
        payment_id: payment.payment_id,
        status: payment.status,
        transaction_id: payment.transaction_id,
        amount: payment.amount,
        phone_number: payment.phone_number,
        checkout_request_id: payment.mpesa_checkout_request_id,
        created_at: payment.created_at.toISOString(),
      });
    } catch (error) {
      console.error('Error initiating payment:', error);
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('Invalid phone number')) {
        return res.status(400).json({ error: 'INVALID_PHONE', message });
      }

      if (message.includes('Invalid store_id')) {
        return res.status(400).json({ error: 'INVALID_STORE', message });
      }

      if (message.includes('configuration error') || message.includes('credentials')) {
        return res.status(502).json({ error: 'INVALID_CREDENTIALS', message });
      }

      if (message.toLowerCase().includes('offline') || message.toLowerCase().includes('queued')) {
        return res.status(202).json({ error: 'OFFLINE_QUEUED', message });
      }

      if (message.includes('network') || message.includes('ECONNREFUSED')) {
        return res.status(502).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'M-Pesa service temporarily unavailable',
        });
      }

      return res.status(500).json({
        error: 'PAYMENT_INITIATION_FAILED',
        message,
      });
    }
  });

  /**
   * Get payment status
   * GET /api/payments/:payment_id/status
   */
  app.get(
    '/api/payments/:payment_id/status',
    validatePaymentId,
    async (req: Request, res: Response) => {
      try {
        const paymentId = req.params.payment_id;
        const payment = await paymentService.getPayment(paymentId);

        if (!payment) {
          return res.status(404).json({
            error: 'PAYMENT_NOT_FOUND',
            message: `No payment found with ID: ${paymentId}`,
          });
        }

        return res.status(200).json({
          payment_id: payment.payment_id,
          status: payment.status,
          transaction_id: payment.transaction_id,
          amount: payment.amount,
          phone_number: payment.phone_number,
          error_message: payment.error_message,
          created_at: payment.created_at.toISOString(),
          updated_at: payment.updated_at.toISOString(),
          reconciled_at: payment.reconciled_at ? payment.reconciled_at.toISOString() : null,
        });
      } catch (error) {
        console.error('Error fetching payment status:', error);
        return res.status(500).json({
          error: 'FAILED_TO_FETCH_STATUS',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Cancel payment
   * POST /api/payments/:payment_id/cancel
   */
  app.post(
    '/api/payments/:payment_id/cancel',
    validatePaymentId,
    async (req: Request, res: Response) => {
      try {
        const payment = await paymentService.cancelPayment(req.params.payment_id);
        return res.status(200).json({
          payment_id: payment.payment_id,
          status: payment.status,
        });
      } catch (error) {
        return res.status(400).json({
          error: 'CANCEL_FAILED',
          message: error instanceof Error ? error.message : 'Cancel failed',
        });
      }
    }
  );

  /**
   * M-Pesa webhook callback
   * POST /api/webhooks/mpesa
   * Note: Soft validation — always return 200 to Safaricom
   */
  app.post('/api/webhooks/mpesa', async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const signature = (req.headers['x-m2m-signature'] as string) || '';
      const storeId = req.headers['x-store-id'] as string | undefined;

      if (!payload || !payload.Body || !payload.Body.stkCallback) {
        console.error('Invalid webhook payload structure');
        return res.status(200).json({ ok: true });
      }

      const rawPayload = JSON.stringify(payload);

      await webhookHandler.handleMpesaWebhook(payload, signature, storeId, rawPayload);

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Unexpected error handling webhook:', error);
      return res.status(200).json({ ok: true });
    }
  });

  /**
   * Payment history for a store
   * GET /api/payments/store/:store_id
   */
  app.get(
    '/api/payments/store/:store_id',
    validateStoreId,
    validatePaginationParams,
    async (req: Request, res: Response) => {
      try {
        const storeId = req.params.store_id;
        const { limit, offset } = (req as any).pagination || {
          limit: parseInt(req.query.limit as string) || 10,
          offset: parseInt(req.query.offset as string) || 0,
        };

        const result = await paymentService.getPaymentHistory(storeId, limit, offset);

        return res.status(200).json({
          store_id: storeId,
          limit,
          offset,
          total: result.total,
          payments: result.payments.map(p => ({
            ...p,
            created_at: p.created_at.toISOString(),
            updated_at: p.updated_at.toISOString(),
            reconciled_at: p.reconciled_at ? p.reconciled_at.toISOString() : null,
          })),
        });
      } catch (error) {
        console.error('Error fetching payment history:', error);
        return res.status(500).json({
          error: 'FAILED_TO_FETCH_HISTORY',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Orphaned payments
   * GET /api/payments/orphaned
   */
  app.get('/api/payments/orphaned', async (req: Request, res: Response) => {
    try {
      const storeId = req.query.store_id as string;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!storeId || typeof storeId !== 'string') {
        return res.status(400).json({
          error: 'INVALID_STORE_ID',
          message: 'store_id is required as query parameter',
        });
      }

      const orphaned = await paymentService.getOrphanedPayments(storeId, limit);

      return res.status(200).json({
        store_id: storeId,
        limit,
        orphaned_payments: orphaned.map(p => ({
          ...p,
          created_at: p.created_at.toISOString(),
          updated_at: p.updated_at.toISOString(),
          reconciled_at: p.reconciled_at ? p.reconciled_at.toISOString() : null,
        })),
      });
    } catch (error) {
      console.error('Error fetching orphaned payments:', error);
      return res.status(500).json({
        error: 'FAILED_TO_FETCH_ORPHANED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Validate and save store M-Pesa credentials
   * POST /api/payments/credentials
   */
  app.post('/api/payments/credentials', async (req: Request, res: Response) => {
    try {
      if (!configurationService) {
        return res.status(503).json({
          error: 'CONFIG_UNAVAILABLE',
          message: 'Configuration service not available',
        });
      }

      const {
        store_id,
        api_key,
        consumer_key,
        consumer_secret,
        business_short_code,
        environment,
        passkey,
      } = req.body;

      const result = await configurationService.validateAndSaveStoreCredentials(
        store_id,
        api_key || consumer_key,
        consumer_key,
        consumer_secret,
        business_short_code,
        environment || 'sandbox',
        passkey
      );

      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      return res.status(500).json({
        error: 'CREDENTIAL_SAVE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to save credentials',
      });
    }
  });
}
