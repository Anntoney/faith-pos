/**
 * Webhook Handler
 * Receives and processes M-Pesa webhook callbacks
 * Requirements: 3.1, 3.2, 3.5, 3.6, 6.2
 */

import { PaymentStatus, MpesaWebhookPayload, WebhookLog } from '../types/payment';
import { MpesaApiClient } from '../services/mpesa/MpesaApiClient';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { ReconciliationService } from '../services/ReconciliationService';
import { loggingService } from '../services/LoggingService';
import { config } from '../config/env';

export class WebhookHandler {
  private mpesaApiClient: MpesaApiClient;
  private paymentRepository: PaymentRepository;
  private reconciliationService: ReconciliationService;
  private webhookRetryTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    mpesaApiClient: MpesaApiClient,
    paymentRepository: PaymentRepository,
    reconciliationService: ReconciliationService
  ) {
    this.mpesaApiClient = mpesaApiClient;
    this.paymentRepository = paymentRepository;
    this.reconciliationService = reconciliationService;
  }

  /**
   * Handle M-Pesa webhook callback
   * Requirements: 3.1, 3.2, 3.5, 6.2
   */
  async handleMpesaWebhook(
    payload: MpesaWebhookPayload,
    signature: string,
    storeId: string | undefined,
    rawPayloadString: string
  ): Promise<{ success: boolean; message: string }> {
    let webhookLog: Partial<WebhookLog> = {
      webhook_payload: payload as unknown as Record<string, unknown>,
      signature_valid: false,
      processing_status: 'FAILED',
      received_at: new Date(),
      retry_count: 0,
    };

    try {
      // 1. Validate webhook signature (skipped in sandbox by default)
      let signatureValid = true;
      if (!config.mpesa.skipWebhookSignature) {
        if (!signature) {
          signatureValid = false;
        } else {
          signatureValid = this.mpesaApiClient.validateWebhookSignature(
            rawPayloadString,
            signature
          );
        }
      } else {
        // Sandbox: accept missing signature
        signatureValid = !signature
          ? true
          : this.mpesaApiClient.validateWebhookSignature(rawPayloadString, signature) || true;
      }

      webhookLog.signature_valid = signatureValid;

      if (!signatureValid) {
        console.error('Invalid webhook signature');
        webhookLog.processing_status = 'FAILED';
        webhookLog.error_message = 'Invalid signature';
        await this.createWebhookLog(webhookLog);
        loggingService.logWebhookError(
          payload as unknown as Record<string, unknown>,
          'Invalid signature',
          'signature_validation_failed'
        );
        return { success: true, message: 'Webhook received' };
      }

      // 2. Parse webhook payload
      try {
        this.mpesaApiClient.parseWebhookPayload(payload);
      } catch (parseError) {
        console.error(`Failed to parse webhook payload: ${parseError}`);
        webhookLog.processing_status = 'FAILED';
        webhookLog.error_message = `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
        await this.createWebhookLog(webhookLog);
        return { success: true, message: 'Webhook received' };
      }

      const stkCallback = payload.Body.stkCallback;
      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;

      // 3. Find payment by checkout request ID
      const payment = await this.findPaymentByCheckoutId(checkoutRequestId);

      if (!payment) {
        console.warn(`Orphaned webhook received for checkout request ${checkoutRequestId}`);
        webhookLog.processing_status = 'FAILED';
        webhookLog.error_message = 'No matching payment found';
        await this.handleOrphanedWebhook(payload, storeId, webhookLog);
        return { success: true, message: 'Webhook received' };
      }

      // 4. Store isolation: if storeId provided, must match payment.store_id
      // Requirements: 6.2
      if (storeId && payment.store_id !== storeId) {
        console.error(`Store ID mismatch in webhook for payment ${payment.payment_id}`);
        webhookLog.processing_status = 'FAILED';
        webhookLog.error_message = 'Store ID mismatch';
        webhookLog.payment_id = payment.payment_id;
        await this.createWebhookLog(webhookLog);
        loggingService.logWebhookError(
          payload as unknown as Record<string, unknown>,
          'Store ID mismatch',
          'store_isolation'
        );
        return { success: true, message: 'Webhook received' };
      }

      webhookLog.payment_id = payment.payment_id;

      if (resultCode === 0) {
        await this.handlePaymentCompletion(payment.payment_id, stkCallback as unknown as Record<string, unknown>);
        webhookLog.processing_status = 'SUCCESS';
      } else {
        const errorDescription = stkCallback.ResultDesc || 'Unknown error';
        await this.handlePaymentFailure(payment.payment_id, errorDescription, resultCode);
        webhookLog.processing_status = 'SUCCESS';
      }

      webhookLog.processed_at = new Date();
      await this.createWebhookLog(webhookLog);

      return { success: true, message: 'Webhook received and processed' };
    } catch (error) {
      console.error(`Unexpected error handling webhook: ${error}`);
      webhookLog.error_message = error instanceof Error ? error.message : String(error);
      webhookLog.processing_status = 'FAILED';

      try {
        await this.createWebhookLog(webhookLog);
      } catch (logError) {
        console.error(`Failed to log webhook: ${logError}`);
      }

      loggingService.logWebhookError(
        payload as unknown as Record<string, unknown>,
        error instanceof Error ? error : String(error),
        'unexpected_error'
      );

      return { success: true, message: 'Webhook received' };
    }
  }

  private async handlePaymentCompletion(
    paymentId: string,
    mpesaData: Record<string, unknown>
  ): Promise<void> {
    await this.paymentRepository.updateStatus(paymentId, PaymentStatus.COMPLETED, {
      changedBy: 'webhook',
      reason: 'Payment completed via webhook',
      metadata: {
        mpesa_receipt: mpesaData.MpesaReceiptNumber,
        mpesa_phone: mpesaData.PhoneNumber,
        webhook_time: new Date().toISOString(),
      },
    });

    try {
      const result = await this.reconciliationService.reconcilePayment(paymentId);
      if (!result.success) {
        console.warn(`Reconciliation failed for payment ${paymentId}: ${result.reason}`);
      }
    } catch (reconcileError) {
      console.error(`Error triggering reconciliation for payment ${paymentId}: ${reconcileError}`);
    }
  }

  private async handlePaymentFailure(
    paymentId: string,
    errorMessage: string,
    resultCode?: number
  ): Promise<void> {
    await this.paymentRepository.updateStatus(paymentId, PaymentStatus.FAILED, {
      changedBy: 'webhook',
      reason: `Payment failed via webhook: ${errorMessage}`,
      metadata: {
        result_code: resultCode,
        result_desc: errorMessage,
        webhook_time: new Date().toISOString(),
      },
    });

    const userMessage = this.mapErrorCodeToMessage(resultCode, errorMessage);
    await this.paymentRepository.updateErrorMessage(paymentId, userMessage);
  }

  private mapErrorCodeToMessage(resultCode: number | undefined, resultDesc: string): string {
    const codeMap: Record<number, string> = {
      1001: 'Incorrect M-Pesa PIN entered. Please try again.',
      1002: 'Payment timed out. The customer did not complete the payment in time.',
      1032: 'Payment was cancelled by the customer.',
      1037: 'Duplicate transaction. Please initiate a new payment.',
    };

    if (resultCode && codeMap[resultCode]) {
      return codeMap[resultCode];
    }

    if (resultDesc) {
      if (resultDesc.toLowerCase().includes('cancelled')) {
        return 'Payment was cancelled. Please try again.';
      }
      if (resultDesc.toLowerCase().includes('timeout')) {
        return 'Payment timed out. Please try again.';
      }
      if (resultDesc.toLowerCase().includes('rejected')) {
        return 'Payment was rejected. Please try again.';
      }
    }

    return `Payment failed: ${resultDesc || 'Unknown error'}. Please try again.`;
  }

  private async handleOrphanedWebhook(
    payload: MpesaWebhookPayload,
    _storeId: string | undefined,
    webhookLog: Partial<WebhookLog>
  ): Promise<void> {
    webhookLog.error_message = 'No matching payment found - orphaned webhook';
    await this.createWebhookLog(webhookLog);
    loggingService.logWebhookError(
      payload as unknown as Record<string, unknown>,
      'No matching payment',
      'orphaned_webhook'
    );
  }

  async queueWebhookForRetry(
    webhookLogId: string,
    retryCount: number,
    payload: MpesaWebhookPayload,
    signature: string,
    storeId: string,
    rawPayload: string
  ): Promise<void> {
    if (retryCount >= 3) {
      console.error(`Max retries exceeded for webhook ${webhookLogId}`);
      return;
    }

    const delays = [30 * 1000, 2 * 60 * 1000, 8 * 60 * 1000];
    const delayMs = delays[retryCount];
    const nextRetryAt = new Date(Date.now() + delayMs);

    try {
      await this.paymentRepository.updateWebhookLogRetry(
        webhookLogId,
        retryCount + 1,
        nextRetryAt
      );
    } catch (error) {
      console.error(`Failed to update webhook retry info: ${error}`);
    }

    const retryTimer = setTimeout(() => {
      this.handleMpesaWebhook(payload, signature, storeId, rawPayload)
        .catch(error => {
          console.error(`Webhook retry failed: ${error}`);
        })
        .finally(() => {
          this.webhookRetryTimers.delete(webhookLogId);
        });
    }, delayMs);

    this.webhookRetryTimers.set(webhookLogId, retryTimer);
  }

  async processFailedWebhooks(): Promise<void> {
    console.log('Processing failed webhooks...');
    // Future: query webhook_logs where next_retry_at <= now
  }

  private async createWebhookLog(webhookLog: Partial<WebhookLog>): Promise<void> {
    try {
      await this.paymentRepository.createWebhookLog({
        payment_id: webhookLog.payment_id,
        webhook_payload: (webhookLog.webhook_payload || {}) as Record<string, unknown>,
        signature_valid: webhookLog.signature_valid ?? false,
        processing_status: webhookLog.processing_status || 'FAILED',
        error_message: webhookLog.error_message,
        retry_count: webhookLog.retry_count || 0,
        next_retry_at: webhookLog.next_retry_at,
        processed_at: webhookLog.processed_at,
      });
    } catch (error) {
      console.error(`Failed to create webhook log: ${error}`);
      console.log('Webhook log entry (fallback):', webhookLog);
    }
  }

  private async findPaymentByCheckoutId(checkoutRequestId: string) {
    try {
      return await this.paymentRepository.findByCheckoutRequestId(checkoutRequestId);
    } catch (error) {
      console.error(`Failed to find payment by checkout ID: ${error}`);
      return null;
    }
  }

  cancelRetryTimer(webhookLogId: string): void {
    const timer = this.webhookRetryTimers.get(webhookLogId);
    if (timer) {
      clearTimeout(timer);
      this.webhookRetryTimers.delete(webhookLogId);
    }
  }

  cleanup(): void {
    this.webhookRetryTimers.forEach(timer => clearTimeout(timer));
    this.webhookRetryTimers.clear();
  }
}
