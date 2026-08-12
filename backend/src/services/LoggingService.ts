/**
 * Logging Service
 * Structured logging for payment errors and observability
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

export interface PaymentErrorContext {
  store_id?: string;
  transaction_id?: string;
  payment_id?: string;
  error_code?: string | number;
  [key: string]: unknown;
}

export class LoggingService {
  private logLevel: string;

  constructor(logLevel: string = process.env.LOG_LEVEL || 'info') {
    this.logLevel = logLevel;
  }

  /**
   * Log payment error with required context fields
   * Requirements: 12.1
   */
  logPaymentError(error: Error | string, context: PaymentErrorContext = {}): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      type: 'payment_error',
      error_code: context.error_code || 'PAYMENT_ERROR',
      message: error instanceof Error ? error.message : error,
      store_id: context.store_id,
      transaction_id: context.transaction_id,
      payment_id: context.payment_id,
      ...context,
    };
    console.error(JSON.stringify(entry));
  }

  /**
   * Log M-Pesa API failure details
   * Requirements: 12.2
   */
  logApiError(
    error: Error | string,
    request: {
      method?: string;
      endpoint?: string;
      headers?: Record<string, unknown>;
      body?: unknown;
    },
    response?: {
      status?: number;
      body?: unknown;
    }
  ): void {
    // Strip sensitive headers
    const safeHeaders = { ...(request.headers || {}) };
    delete safeHeaders.Authorization;
    delete safeHeaders.authorization;

    const entry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      type: 'mpesa_api_error',
      message: error instanceof Error ? error.message : error,
      http_method: request.method,
      endpoint: request.endpoint,
      request_headers: safeHeaders,
      response_status: response?.status,
      response_body: response?.body,
    };
    console.error(JSON.stringify(entry));
  }

  /**
   * Log webhook processing failure
   * Requirements: 12.3
   */
  logWebhookError(
    webhook: Record<string, unknown>,
    error: Error | string,
    reason: string
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      type: 'webhook_error',
      message: error instanceof Error ? error.message : error,
      reason,
      webhook_payload: webhook,
    };
    console.error(JSON.stringify(entry));
  }

  /**
   * Log payment timeout event
   * Requirements: 12.4
   */
  logTimeoutError(paymentId: string, elapsedTimeMs: number): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      type: 'payment_timeout',
      payment_id: paymentId,
      elapsed_time_ms: elapsedTimeMs,
      message: `Payment ${paymentId} timed out after ${elapsedTimeMs}ms`,
    };
    console.warn(JSON.stringify(entry));
  }

  info(message: string, context: Record<string, unknown> = {}): void {
    if (this.logLevel === 'error') return;
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message,
        ...context,
      })
    );
  }
}

export const loggingService = new LoggingService();
