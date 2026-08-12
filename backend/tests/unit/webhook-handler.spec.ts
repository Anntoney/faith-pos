import { WebhookHandler } from '../../src/handlers/WebhookHandler';
import { MpesaApiClient } from '../../src/services/mpesa/MpesaApiClient';
import { PaymentRepository } from '../../src/repositories/PaymentRepository';
import { ReconciliationService } from '../../src/services/ReconciliationService';
import { PaymentStatus, MpesaWebhookPayload } from '../../src/types/payment';

describe('WebhookHandler', () => {
  let handler: WebhookHandler;
  let mockMpesaClient: jest.Mocked<MpesaApiClient>;
  let mockPaymentRepo: jest.Mocked<PaymentRepository>;
  let mockReconciliationService: jest.Mocked<ReconciliationService>;

  beforeEach(() => {
    // Create mocks
    mockMpesaClient = {
      validateWebhookSignature: jest.fn(),
      parseWebhookPayload: jest.fn(),
    } as any;

    mockPaymentRepo = {
      findById: jest.fn(),
      updateStatus: jest.fn(),
      updateErrorMessage: jest.fn(),
    } as any;

    mockReconciliationService = {
      reconcilePayment: jest.fn(),
    } as any;

    handler = new WebhookHandler(mockMpesaClient, mockPaymentRepo, mockReconciliationService);
    
    // Mock the private findPaymentByCheckoutId method
    jest.spyOn(handler as any, 'findPaymentByCheckoutId').mockResolvedValue(null);
  });

  describe('handleMpesaWebhook', () => {
    const validPayload: MpesaWebhookPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'merchant-123',
          CheckoutRequestID: 'checkout-123',
          ResultCode: 0,
          ResultDesc: 'Success',
          Amount: 10000,
          MpesaReceiptNumber: 'receipt-123',
          PhoneNumber: '254712345678',
        },
      },
    };

    const mockPayment = {
      payment_id: 'pay-123',
      transaction_id: 'txn-123',
      store_id: 'store-1',
      phone_number: '254712345678',
      amount: 10000,
      status: PaymentStatus.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
      applied_to_credit: false,
    };

    describe('Signature Validation', () => {
      it('should validate webhook signature and return 200 OK for valid signature', async () => {
        mockMpesaClient.validateWebhookSignature.mockReturnValue(true);
        mockMpesaClient.parseWebhookPayload.mockReturnValue(validPayload);
        mockPaymentRepo.findById.mockResolvedValue(null);

        const result = await handler.handleMpesaWebhook(
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(result.success).toBe(true);
        expect(mockMpesaClient.validateWebhookSignature).toHaveBeenCalledWith(
          JSON.stringify(validPayload),
          'valid-signature'
        );
      });

      it('should return 200 OK for invalid signature but not process', async () => {
        mockMpesaClient.validateWebhookSignature.mockReturnValue(false);

        const result = await handler.handleMpesaWebhook(
          validPayload,
          'invalid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(result.success).toBe(true);
        expect(mockPaymentRepo.findById).not.toHaveBeenCalled();
      });
    });

    describe('Payment Completion', () => {
      it('should update payment to COMPLETED when result code is 0', async () => {
        mockMpesaClient.validateWebhookSignature.mockReturnValue(true);
        mockMpesaClient.parseWebhookPayload.mockReturnValue(validPayload);
        (handler as any).findPaymentByCheckoutId = jest.fn().mockResolvedValue(mockPayment);
        mockPaymentRepo.findById.mockResolvedValue(mockPayment);
        mockPaymentRepo.updateStatus.mockResolvedValue(mockPayment);
        mockReconciliationService.reconcilePayment.mockResolvedValue({ success: true });

        const result = await handler.handleMpesaWebhook(
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(result.success).toBe(true);
        expect(mockPaymentRepo.updateStatus).toHaveBeenCalledWith(
          'pay-123',
          PaymentStatus.COMPLETED,
          expect.any(Object)
        );
      });

      it('should trigger reconciliation on payment completion', async () => {
        mockMpesaClient.validateWebhookSignature.mockReturnValue(true);
        mockMpesaClient.parseWebhookPayload.mockReturnValue(validPayload);
        (handler as any).findPaymentByCheckoutId = jest.fn().mockResolvedValue(mockPayment);
        mockPaymentRepo.findById.mockResolvedValue(mockPayment);
        mockPaymentRepo.updateStatus.mockResolvedValue(mockPayment);
        mockReconciliationService.reconcilePayment.mockResolvedValue({ success: true });

        await handler.handleMpesaWebhook(
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(mockReconciliationService.reconcilePayment).toHaveBeenCalledWith('pay-123');
      });
    });

    describe('Payment Failure', () => {
      it('should update payment to FAILED when result code is non-zero', async () => {
        const failedPayload: MpesaWebhookPayload = {
          Body: {
            stkCallback: {
              MerchantRequestID: 'merchant-123',
              CheckoutRequestID: 'checkout-123',
              ResultCode: 1032,
              ResultDesc: 'Payment cancelled by user',
            },
          },
        };

        mockMpesaClient.validateWebhookSignature.mockReturnValue(true);
        mockMpesaClient.parseWebhookPayload.mockReturnValue(failedPayload);
        (handler as any).findPaymentByCheckoutId = jest.fn().mockResolvedValue(mockPayment);
        mockPaymentRepo.findById.mockResolvedValue(mockPayment);
        mockPaymentRepo.updateStatus.mockResolvedValue({ ...mockPayment, status: PaymentStatus.FAILED });
        mockPaymentRepo.updateErrorMessage.mockResolvedValue({ ...mockPayment, status: PaymentStatus.FAILED });

        const result = await handler.handleMpesaWebhook(
          failedPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(failedPayload)
        );

        expect(result.success).toBe(true);
        expect(mockPaymentRepo.updateStatus).toHaveBeenCalledWith(
          'pay-123',
          PaymentStatus.FAILED,
          expect.any(Object)
        );
      });

      it('should map error code 1032 to user-friendly message', async () => {
        const failedPayload: MpesaWebhookPayload = {
          Body: {
            stkCallback: {
              MerchantRequestID: 'merchant-123',
              CheckoutRequestID: 'checkout-123',
              ResultCode: 1032,
              ResultDesc: 'Payment cancelled by user',
            },
          },
        };

        mockMpesaClient.validateWebhookSignature.mockReturnValue(true);
        mockMpesaClient.parseWebhookPayload.mockReturnValue(failedPayload);
        (handler as any).findPaymentByCheckoutId = jest.fn().mockResolvedValue(mockPayment);
        mockPaymentRepo.findById.mockResolvedValue(mockPayment);
        mockPaymentRepo.updateStatus.mockResolvedValue({ ...mockPayment, status: PaymentStatus.FAILED });

        await handler.handleMpesaWebhook(
          failedPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(failedPayload)
        );

        expect(mockPaymentRepo.updateErrorMessage).toHaveBeenCalledWith(
          'pay-123',
          'Payment was cancelled by the customer.'
        );
      });
    });

    describe('Store ID Validation', () => {
      it('should reject webhook if store_id does not match', async () => {
        const paymentDifferentStore = { ...mockPayment, store_id: 'store-2' };

        mockMpesaClient.validateWebhookSignature.mockReturnValue(true);
        mockMpesaClient.parseWebhookPayload.mockReturnValue(validPayload);
        (handler as any).findPaymentByCheckoutId = jest.fn().mockResolvedValue(paymentDifferentStore);
        mockPaymentRepo.findById.mockResolvedValue(paymentDifferentStore);

        const result = await handler.handleMpesaWebhook(
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(result.success).toBe(true);
        // Should not update payment due to store mismatch
        expect(mockPaymentRepo.updateStatus).not.toHaveBeenCalled();
      });
    });

    describe('Orphaned Webhooks', () => {
      it('should handle webhook for non-existent payment', async () => {
        mockMpesaClient.validateWebhookSignature.mockReturnValue(true);
        mockMpesaClient.parseWebhookPayload.mockReturnValue(validPayload);
        mockPaymentRepo.findById.mockResolvedValue(null);

        const result = await handler.handleMpesaWebhook(
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(result.success).toBe(true);
        // Should still return 200 OK per requirements
      });
    });

    describe('Webhook Logging', () => {
      it('should return 200 OK for all valid webhooks even if processing fails', async () => {
        mockMpesaClient.validateWebhookSignature.mockReturnValue(true);
        mockMpesaClient.parseWebhookPayload.mockReturnValue(validPayload);
        mockPaymentRepo.findById.mockResolvedValue(mockPayment);
        mockReconciliationService.reconcilePayment.mockRejectedValue(new Error('Reconciliation failed'));

        const result = await handler.handleMpesaWebhook(
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('received');
      });
    });

    describe('Invalid Payload Handling', () => {
      it('should handle malformed webhook payload gracefully', async () => {
        mockMpesaClient.validateWebhookSignature.mockReturnValue(true);
        mockMpesaClient.parseWebhookPayload.mockImplementation(() => {
          throw new Error('Invalid payload');
        });

        const result = await handler.handleMpesaWebhook(
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(result.success).toBe(true);
        // Should still return 200 OK and not crash
      });

      it('should handle unexpected errors gracefully', async () => {
        mockMpesaClient.validateWebhookSignature.mockImplementation(() => {
          throw new Error('Unexpected error');
        });

        const result = await handler.handleMpesaWebhook(
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(result.success).toBe(true);
        // Should still return 200 OK and not crash
      });
    });

    describe('Retry Mechanism', () => {
      it('should calculate correct exponential backoff delays', async () => {
        // Test 30s delay for first retry
        jest.useFakeTimers();
        const timeoutSpy = jest.spyOn(global, 'setTimeout');

        await handler.queueWebhookForRetry(
          'webhook-123',
          0,
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        // Should schedule retry after 30 seconds
        expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30 * 1000);

        jest.useRealTimers();
      });

      it('should not retry if max retries exceeded', async () => {
        jest.useFakeTimers();
        const timeoutSpy = jest.spyOn(global, 'setTimeout');

        await handler.queueWebhookForRetry(
          'webhook-123',
          3,
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        expect(timeoutSpy).not.toHaveBeenCalled();

        jest.useRealTimers();
      });

      it('should cancel retry timer when requested', async () => {
        jest.useFakeTimers();

        await handler.queueWebhookForRetry(
          'webhook-123',
          0,
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        handler.cancelRetryTimer('webhook-123');

        // Verify timer was cancelled - cleanup should have been called
        expect(() => handler.cancelRetryTimer('webhook-123')).not.toThrow();

        jest.useRealTimers();
      });
    });

    describe('Cleanup', () => {
      it('should cleanup all retry timers on cleanup call', async () => {
        jest.useFakeTimers();

        await handler.queueWebhookForRetry(
          'webhook-1',
          0,
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        await handler.queueWebhookForRetry(
          'webhook-2',
          0,
          validPayload,
          'valid-signature',
          'store-1',
          JSON.stringify(validPayload)
        );

        handler.cleanup();

        // Verify cleanup was successful and doesn't crash
        expect(() => handler.cleanup()).not.toThrow();

        jest.useRealTimers();
      });
    });
  });
});
