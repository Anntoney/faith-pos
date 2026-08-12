/**
 * Payment Service
 * Orchestrates the payment lifecycle and manages state transitions
 * Requirements: 1.2, 1.5, 1.4, 2.1, 2.2, 2.3, 4.1, 5.1, 6.1, 9.2, 10.5
 */

import { Payment, PaymentStatus } from '../types/payment';
import { MpesaApiClient } from './mpesa/MpesaApiClient';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { ReconciliationService } from './ReconciliationService';
import { ConfigurationService } from './ConfigurationService';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { CustomerCreditService } from './CustomerCreditService';
import { OfflineQueueManager } from './OfflineQueueManager';
import { loggingService } from './LoggingService';
import { config } from '../config/env';

/**
 * PaymentService orchestrates all payment operations
 * Handles initiation, polling, timeout detection, and state management
 */
export class PaymentService {
  private defaultMpesaApiClient: MpesaApiClient;
  private paymentRepository: PaymentRepository;
  private reconciliationService: ReconciliationService;
  private configurationService: ConfigurationService;
  private transactionRepository?: TransactionRepository;
  private customerCreditService?: CustomerCreditService;
  private offlineQueueManager?: OfflineQueueManager;
  private pollingTimers: Map<string, NodeJS.Timeout> = new Map();
  private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();
  private paymentStartTimes: Map<string, number> = new Map();

  constructor(
    mpesaApiClient: MpesaApiClient,
    paymentRepository: PaymentRepository,
    reconciliationService: ReconciliationService,
    configurationService?: ConfigurationService,
    transactionRepository?: TransactionRepository,
    customerCreditService?: CustomerCreditService,
    offlineQueueManager?: OfflineQueueManager
  ) {
    this.defaultMpesaApiClient = mpesaApiClient;
    this.paymentRepository = paymentRepository;
    this.reconciliationService = reconciliationService;
    this.configurationService = configurationService || new ConfigurationService();
    this.transactionRepository = transactionRepository;
    this.customerCreditService = customerCreditService;
    this.offlineQueueManager = offlineQueueManager;
  }

  /**
   * Resolve store-specific M-Pesa client (multi-store credential isolation)
   * Requirements: 6.3, 10.3
   */
  private getApiClientForStore(storeId: string): MpesaApiClient {
    try {
      return this.configurationService.createApiClientForStore(storeId);
    } catch {
      // Fall back to default client if store-specific credentials missing
      if (!this.configurationService.isCredentialsValid(storeId) &&
          !this.configurationService.getStoreCredentials('default')) {
        throw new Error(this.handleInvalidCredentials(storeId, 'Missing credentials'));
      }
      return this.defaultMpesaApiClient;
    }
  }

  /**
   * Handle invalid credentials
   * Requirements: 10.5
   */
  handleInvalidCredentials(storeId: string, error: string): string {
    loggingService.logPaymentError(error, {
      store_id: storeId,
      error_code: 'INVALID_CREDENTIALS',
    });
    return 'M-Pesa configuration error. Please contact support.';
  }

  /**
   * Initiate a new payment
   * Requirements: 1.2, 1.5, 1.4, 6.1
   */
  async initiatePayment(
    transactionId: string,
    phoneNumber: string,
    amount: number,
    storeId: string,
    applyToCredit: boolean = false,
    customerId?: string
  ): Promise<Payment> {
    // TASK 11: Validate store_id
    if (!storeId || typeof storeId !== 'string') {
      throw new Error('Invalid store_id: store_id is required and must be a string');
    }

    if (!this.validatePhoneNumber(phoneNumber)) {
      throw new Error(
        `Invalid phone number format. Expected format: 254XXXXXXXXX or +254XXXXXXXXX`
      );
    }

    const normalizedPhone = phoneNumber.startsWith('+')
      ? phoneNumber.substring(1)
      : phoneNumber;

    // Prevent initiation with invalid credentials
    const storeCreds =
      this.configurationService.getStoreCredentials(storeId) ||
      this.configurationService.getStoreCredentials('default');
    if (!storeCreds) {
      throw new Error(this.handleInvalidCredentials(storeId, 'No credentials configured'));
    }

    // Offline routing
    if (this.offlineQueueManager) {
      const online = await this.offlineQueueManager.detectConnectivity();
      if (!online) {
        const queued = await this.offlineQueueManager.queuePayment(
          transactionId,
          normalizedPhone,
          amount,
          storeId
        );
        throw new Error(
          `System offline. Payment queued (${queued.queueId}) and will process when connectivity is restored.`
        );
      }
    }

    // Create Payment record
    let payment: Payment;
    try {
      payment = await this.paymentRepository.create({
        transaction_id: transactionId,
        store_id: storeId,
        phone_number: normalizedPhone,
        amount: amount,
        status: PaymentStatus.INITIATED,
        applied_to_credit: applyToCredit,
        customer_id: customerId || undefined,
      });
    } catch (error) {
      throw new Error(
        `Failed to create payment record: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Lock related sale/transaction if available
    if (this.transactionRepository) {
      try {
        await this.transactionRepository.lockTransaction(transactionId, payment.payment_id);
      } catch (err) {
        console.warn(`Could not lock transaction ${transactionId}: ${err}`);
      }
    }

    // Call M-Pesa STK Push with store-scoped credentials
    try {
      const apiClient = this.getApiClientForStore(storeId);
      const callbackUrl = config.mpesa.callbackUrl;

      const mpesaResponse = await apiClient.initiatePayment(
        normalizedPhone,
        amount,
        transactionId,
        callbackUrl
      );

      payment = await this.paymentRepository.updateStatus(payment.payment_id, PaymentStatus.PENDING, {
        changedBy: 'system',
        reason: 'M-Pesa API call successful',
        metadata: {
          merchant_request_id: mpesaResponse.MerchantRequestID,
          checkout_request_id: mpesaResponse.CheckoutRequestID,
          response_code: mpesaResponse.ResponseCode,
        },
      });

      payment = await this.paymentRepository.updateMpesaResponse(
        payment.payment_id,
        mpesaResponse.CheckoutRequestID,
        mpesaResponse.ResponseCode
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      loggingService.logApiError(errorMessage, {
        method: 'POST',
        endpoint: '/mpesa/stkpush/v1/processrequest',
      });

      const userFriendlyMessage = this.mapApiErrorToUserMessage(errorMessage);

      if (
        errorMessage.toLowerCase().includes('oauth') ||
        errorMessage.toLowerCase().includes('authentication') ||
        errorMessage.includes('1001')
      ) {
        throw new Error(this.handleInvalidCredentials(storeId, errorMessage));
      }

      await this.paymentRepository.updateStatus(payment.payment_id, PaymentStatus.FAILED, {
        changedBy: 'system',
        reason: `M-Pesa API error: ${errorMessage}`,
      });
      await this.paymentRepository.updateErrorMessage(payment.payment_id, userFriendlyMessage);

      if (this.transactionRepository) {
        await this.transactionRepository.unlockTransaction(transactionId).catch(() => undefined);
      }

      throw new Error(userFriendlyMessage);
    }

    const timeoutDurationMs = config.payment.timeoutMs || 2 * 60 * 1000;
    this.paymentStartTimes.set(payment.payment_id, Date.now());
    const timeoutTimer = setTimeout(
      () => this.handlePaymentTimeout(payment.payment_id),
      timeoutDurationMs
    );
    this.timeoutTimers.set(payment.payment_id, timeoutTimer);

    this.startPolling(payment.payment_id);

    return payment;
  }

  private startPolling(paymentId: string): void {
    const pollingIntervalMs = config.payment.pollingIntervalMs || 5000;

    const pollingTimer = setInterval(
      () =>
        this.pollPaymentStatus(paymentId).catch(error => {
          console.error(`Error polling payment ${paymentId}: ${error.message}`);
        }),
      pollingIntervalMs
    );

    this.pollingTimers.set(paymentId, pollingTimer);
  }

  private mapApiErrorToUserMessage(errorMessage: string): string {
    if (errorMessage.includes('1001')) {
      return 'Incorrect M-Pesa credentials. Please contact support.';
    }
    if (errorMessage.includes('1002')) {
      return 'Payment timed out. Please try again.';
    }
    if (errorMessage.includes('1032')) {
      return 'Payment cancelled by customer.';
    }
    if (errorMessage.includes('1037')) {
      return 'Duplicate transaction. Please use a different reference.';
    }
    if (errorMessage.includes('500') || errorMessage.includes('502')) {
      return 'M-Pesa service temporarily unavailable. Please try again.';
    }
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('ECONNREFUSED')
    ) {
      return 'Network error. Please check your connection and try again.';
    }
    if (errorMessage.includes('OAuth') || errorMessage.includes('authentication')) {
      return 'M-Pesa configuration error. Please contact support.';
    }
    if (errorMessage.toLowerCase().includes('offline')) {
      return errorMessage;
    }

    return 'Payment initiation failed. Please try again.';
  }

  async pollPaymentStatus(paymentId: string): Promise<void> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      console.error(`Payment ${paymentId} not found`);
      this.cleanupTimers(paymentId);
      return;
    }

    if (
      payment.status === PaymentStatus.COMPLETED ||
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.EXPIRED ||
      payment.status === PaymentStatus.CANCELLED
    ) {
      this.cleanupTimers(paymentId);
      return;
    }

    if (!payment.mpesa_checkout_request_id) {
      console.error(`Payment ${paymentId} has no checkout request ID`);
      return;
    }

    try {
      const apiClient = this.getApiClientForStore(payment.store_id);
      const statusResponse = await apiClient.queryPaymentStatus(
        payment.transaction_id,
        payment.mpesa_checkout_request_id
      );

      const resultCode = statusResponse.ResultCode;

      if (resultCode === 0) {
        await this.paymentRepository.updateStatus(paymentId, PaymentStatus.COMPLETED, {
          changedBy: 'system',
          reason: 'Payment completed via polling',
          metadata: {
            mpesa_response: statusResponse,
            poll_time: new Date().toISOString(),
          },
        });

        try {
          await this.reconciliationService.reconcilePayment(paymentId);
        } catch (error) {
          console.error(`Reconciliation failed for payment ${paymentId}: ${error}`);
        }

        this.cleanupTimers(paymentId);
      } else {
        // Still pending (e.g. 4999 "being processed") — keep polling until timeout
        // Only mark FAILED on definitive terminal failure codes
        const code = Number(resultCode);
        const terminalFailureCodes = new Set([1, 2, 1001, 1002, 1032]);
        if (!terminalFailureCodes.has(code)) {
          return;
        }

        const resultDesc = statusResponse.ResultDesc || 'Unknown error';
        await this.paymentRepository.updateStatus(paymentId, PaymentStatus.FAILED, {
          changedBy: 'system',
          reason: `Payment failed via polling: ${resultDesc}`,
          metadata: {
            mpesa_response_code: resultCode,
            mpesa_result_desc: resultDesc,
          },
        });

        const userFriendlyMessage = this.mapErrorCodeToUserMessage(resultCode, resultDesc);
        await this.paymentRepository.updateErrorMessage(paymentId, userFriendlyMessage);

        if (this.transactionRepository) {
          await this.transactionRepository
            .unlockTransaction(payment.transaction_id)
            .catch(() => undefined);
        }

        this.cleanupTimers(paymentId);
      }
    } catch (error) {
      console.error(`Error polling payment status for ${paymentId}: ${error}`);
    }
  }

  private mapErrorCodeToUserMessage(errorCode: number | string, errorDesc: string): string {
    const codeMap: Record<string | number, string> = {
      '1001': 'Incorrect M-Pesa PIN entered. Please try again.',
      '1002': 'Payment timed out. The customer did not complete the payment in time.',
      '1032': 'Payment was cancelled by the customer.',
      '1037': 'Duplicate transaction. Please initiate a new payment.',
      '1': 'Payment was rejected. Please try again.',
      '2': 'Payment was rejected. Please check your details and try again.',
    };

    if (codeMap[errorCode]) {
      return codeMap[errorCode];
    }

    if (errorDesc && errorDesc.toLowerCase().includes('cancelled')) {
      return 'Payment was cancelled. Please try again.';
    }

    if (errorDesc && errorDesc.toLowerCase().includes('timeout')) {
      return 'Payment timed out. Please try again.';
    }

    if (errorDesc && errorDesc.toLowerCase().includes('rejected')) {
      return 'Payment was rejected. Please try again.';
    }

    return `Payment failed: ${errorDesc || 'Unknown error'}. Please try again.`;
  }

  async handlePaymentTimeout(paymentId: string): Promise<void> {
    try {
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        console.error(`Payment ${paymentId} not found for timeout handling`);
        return;
      }

      if (
        payment.status === PaymentStatus.COMPLETED ||
        payment.status === PaymentStatus.FAILED ||
        payment.status === PaymentStatus.EXPIRED ||
        payment.status === PaymentStatus.CANCELLED
      ) {
        this.cleanupTimers(paymentId);
        return;
      }

      const startedAt = this.paymentStartTimes.get(paymentId) || Date.now() - 120000;
      const elapsed = Date.now() - startedAt;
      loggingService.logTimeoutError(paymentId, elapsed);

      const timeoutMessage =
        'Payment expired. Customer did not enter M-Pesa PIN within 2 minutes.';

      await this.paymentRepository.updateStatus(paymentId, PaymentStatus.EXPIRED, {
        changedBy: 'system',
        reason: timeoutMessage,
        metadata: {
          timeout_duration_seconds: 120,
          expired_at: new Date().toISOString(),
        },
      });

      await this.paymentRepository.updateErrorMessage(
        paymentId,
        'Payment expired. Customer can retry or select another payment method.'
      );

      if (this.transactionRepository) {
        await this.transactionRepository
          .unlockTransaction(payment.transaction_id)
          .catch(() => undefined);
      }

      this.cleanupTimers(paymentId);
      console.log(`Payment ${paymentId} expired after 120 seconds`);
    } catch (error) {
      console.error(`Error handling payment timeout for ${paymentId}: ${error}`);
      this.cleanupTimers(paymentId);
    }
  }

  /**
   * Cancel an in-progress payment
   * Requirements: 5.4, 4.4
   */
  async cancelPayment(paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    if (
      payment.status === PaymentStatus.COMPLETED ||
      payment.status === PaymentStatus.CANCELLED
    ) {
      throw new Error(`Cannot cancel payment in status ${payment.status}`);
    }

    const updated = await this.paymentRepository.updateStatus(
      paymentId,
      PaymentStatus.CANCELLED,
      {
        changedBy: 'operator',
        reason: 'Payment cancelled by operator',
      }
    );

    this.cleanupTimers(paymentId);

    if (this.transactionRepository) {
      await this.transactionRepository
        .unlockTransaction(payment.transaction_id)
        .catch(() => undefined);
    }

    return updated;
  }

  /**
   * Update payment status when webhook received
   * Requirements: 3.2
   */
  async updatePaymentFromWebhook(
    paymentId: string,
    newStatus: PaymentStatus,
    mpesaData?: Record<string, unknown>
  ): Promise<Payment> {
    const payment = await this.paymentRepository.updateStatus(paymentId, newStatus, {
      changedBy: 'webhook',
      reason: `Status updated via webhook to ${newStatus}`,
      metadata: mpesaData,
    });

    if (newStatus === PaymentStatus.COMPLETED) {
      try {
        await this.reconciliationService.reconcilePayment(paymentId);
      } catch (err) {
        console.error(`Reconciliation after webhook failed: ${err}`);
      }
    }

    if (
      newStatus === PaymentStatus.FAILED ||
      newStatus === PaymentStatus.CANCELLED ||
      newStatus === PaymentStatus.EXPIRED
    ) {
      this.cleanupTimers(paymentId);
      if (this.transactionRepository) {
        await this.transactionRepository
          .unlockTransaction(payment.transaction_id)
          .catch(() => undefined);
      }
    }

    if (newStatus === PaymentStatus.COMPLETED) {
      this.cleanupTimers(paymentId);
    }

    return payment;
  }

  /**
   * Apply payment to customer credit
   * Requirements: 9.2
   */
  async applyPaymentToCredit(
    paymentId: string,
    customerId: string,
    storeId: string
  ): Promise<void> {
    if (!this.customerCreditService) {
      throw new Error('CustomerCreditService not configured');
    }

    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    await this.customerCreditService.applyPaymentToCredit(
      paymentId,
      customerId,
      storeId,
      payment.amount
    );
  }

  /**
   * Process offline queue
   * Requirements: 8.4
   */
  async processOfflineQueue(_storeId: string): Promise<void> {
    if (!this.offlineQueueManager) {
      throw new Error('OfflineQueueManager not configured');
    }
    await this.offlineQueueManager.processQueue();
  }

  async getPayment(paymentId: string): Promise<Payment | null> {
    return this.paymentRepository.findById(paymentId);
  }

  async getPaymentHistory(
    storeId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<{ payments: Payment[]; total: number }> {
    return this.paymentRepository.findByStore(storeId, limit, offset);
  }

  async getOrphanedPayments(storeId: string, limit: number = 10): Promise<Payment[]> {
    return this.paymentRepository.findOrphaned(storeId, limit);
  }

  private validatePhoneNumber(phoneNumber: string): boolean {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }
    const phoneRegex = /^(\+)?254\d{9,10}$/;
    return phoneRegex.test(phoneNumber);
  }

  private cleanupTimers(paymentId: string): void {
    const pollingTimer = this.pollingTimers.get(paymentId);
    if (pollingTimer) {
      clearInterval(pollingTimer);
      this.pollingTimers.delete(paymentId);
    }

    const timeoutTimer = this.timeoutTimers.get(paymentId);
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      this.timeoutTimers.delete(paymentId);
    }

    this.paymentStartTimes.delete(paymentId);
  }
}
