/**
 * Payment Service Unit Tests
 * Tests for payment initiation, error handling, and state management
 * Requirements: 1.2, 1.5, 1.4
 */

/// <reference types="jest" />

import { PaymentService } from '../../src/services/PaymentService';
import { MpesaApiClient } from '../../src/services/mpesa/MpesaApiClient';
import { PaymentRepository } from '../../src/repositories/PaymentRepository';
import { Payment, PaymentStatus } from '../../src/types/payment';

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let mockMpesaApiClient: any;
  let mockPaymentRepository: any;

  beforeEach(() => {
    // Mock MpesaApiClient
    mockMpesaApiClient = {
      initiatePayment: jest.fn(),
      queryPaymentStatus: jest.fn(),
      validateWebhookSignature: jest.fn(),
      mapErrorCodeToMessage: jest.fn(),
    };

    // Mock PaymentRepository
    mockPaymentRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
      updateErrorMessage: jest.fn(),
      updateMpesaResponse: jest.fn(),
      updateReconciled: jest.fn(),
      findByStore: jest.fn(),
      supabase: {
        from: jest.fn(),
      },
    };

    // Mock ReconciliationService
    const mockReconciliationService = {
      reconcilePayment: jest.fn().mockResolvedValue({ success: true }),
    };

    paymentService = new PaymentService(
      mockMpesaApiClient as MpesaApiClient,
      mockPaymentRepository as PaymentRepository,
      mockReconciliationService as any
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('initiatePayment', () => {
    const validPaymentData = {
      transactionId: 'txn-123',
      phoneNumber: '254712345678',
      amount: 10000, // 100 KES in cents
      storeId: 'store-001',
      applyToCredit: false,
    };

    const mockPaymentRecord: Payment = {
      payment_id: 'pay-123',
      transaction_id: validPaymentData.transactionId,
      store_id: validPaymentData.storeId,
      phone_number: validPaymentData.phoneNumber,
      amount: validPaymentData.amount,
      status: PaymentStatus.INITIATED,
      created_at: new Date(),
      updated_at: new Date(),
      applied_to_credit: false,
    };

    const mockMpesaResponse = {
      MerchantRequestID: 'mer-req-123',
      CheckoutRequestID: 'ckr-123',
      ResponseCode: '0',
      ResponseDescription: 'Success',
      CustomerMessage: 'Please enter your M-Pesa PIN',
    };

    describe('successful payment initiation', () => {
      it('should validate phone number format', async () => {
        const invalidPhoneNumbers = [
          '712345678', // Missing country code
          '255712345678', // Wrong country code
          'abc', // Invalid format
          '', // Empty
          '+254712345', // Too short
        ];

        for (const phone of invalidPhoneNumbers) {
          await expect(
            paymentService.initiatePayment(
              validPaymentData.transactionId,
              phone,
              validPaymentData.amount,
              validPaymentData.storeId
            )
          ).rejects.toThrow('Invalid phone number format');
        }
      });

      it('should accept valid phone number formats', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockResolvedValue(mockMpesaResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
        });
        mockPaymentRepository.updateMpesaResponse.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
          mpesa_checkout_request_id: mockMpesaResponse.CheckoutRequestID,
          mpesa_response_code: mockMpesaResponse.ResponseCode,
        });

        const validFormats = ['254712345678', '+254712345678'];

        for (const phone of validFormats) {
          // Reset mocks for each iteration
          mockPaymentRepository.create.mockClear();
          mockMpesaApiClient.initiatePayment.mockClear();

          mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
          mockMpesaApiClient.initiatePayment.mockResolvedValue(mockMpesaResponse);
          mockPaymentRepository.updateStatus.mockResolvedValue({
            ...mockPaymentRecord,
            status: PaymentStatus.PENDING,
          });
          mockPaymentRepository.updateMpesaResponse.mockResolvedValue({
            ...mockPaymentRecord,
            status: PaymentStatus.PENDING,
            mpesa_checkout_request_id: mockMpesaResponse.CheckoutRequestID,
          });

          const result = await paymentService.initiatePayment(
            validPaymentData.transactionId,
            phone,
            validPaymentData.amount,
            validPaymentData.storeId
          );

          expect(result).toBeDefined();
          expect(mockPaymentRepository.create).toHaveBeenCalled();
        }
      });

      it('should create payment record with INITIATED status', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockResolvedValue(mockMpesaResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
        });
        mockPaymentRepository.updateMpesaResponse.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
          mpesa_checkout_request_id: mockMpesaResponse.CheckoutRequestID,
        });

        await paymentService.initiatePayment(
          validPaymentData.transactionId,
          validPaymentData.phoneNumber,
          validPaymentData.amount,
          validPaymentData.storeId
        );

        expect(mockPaymentRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            transaction_id: validPaymentData.transactionId,
            store_id: validPaymentData.storeId,
            phone_number: validPaymentData.phoneNumber,
            amount: validPaymentData.amount,
            status: PaymentStatus.INITIATED,
            applied_to_credit: false,
          })
        );
      });

      it('should call M-Pesa API with correct parameters', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockResolvedValue(mockMpesaResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
        });
        mockPaymentRepository.updateMpesaResponse.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
          mpesa_checkout_request_id: mockMpesaResponse.CheckoutRequestID,
        });

        await paymentService.initiatePayment(
          validPaymentData.transactionId,
          validPaymentData.phoneNumber,
          validPaymentData.amount,
          validPaymentData.storeId
        );

        expect(mockMpesaApiClient.initiatePayment).toHaveBeenCalledWith(
          validPaymentData.phoneNumber,
          validPaymentData.amount,
          validPaymentData.transactionId,
          expect.any(String) // callbackUrl
        );
      });

      it('should update payment status to PENDING after successful API call', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockResolvedValue(mockMpesaResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
        });
        mockPaymentRepository.updateMpesaResponse.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
          mpesa_checkout_request_id: mockMpesaResponse.CheckoutRequestID,
        });

        await paymentService.initiatePayment(
          validPaymentData.transactionId,
          validPaymentData.phoneNumber,
          validPaymentData.amount,
          validPaymentData.storeId
        );

        expect(mockPaymentRepository.updateStatus).toHaveBeenCalledWith(
          mockPaymentRecord.payment_id,
          PaymentStatus.PENDING,
          expect.objectContaining({
            changedBy: 'system',
            reason: 'M-Pesa API call successful',
          })
        );
      });

      it('should return payment record with checkout request ID', async () => {
        const paymentWithCheckoutId = {
          ...mockPaymentRecord,
          mpesa_checkout_request_id: mockMpesaResponse.CheckoutRequestID,
          mpesa_response_code: mockMpesaResponse.ResponseCode,
        };

        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockResolvedValue(mockMpesaResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
        });
        mockPaymentRepository.updateMpesaResponse.mockResolvedValue(paymentWithCheckoutId);

        const result = await paymentService.initiatePayment(
          validPaymentData.transactionId,
          validPaymentData.phoneNumber,
          validPaymentData.amount,
          validPaymentData.storeId
        );

        expect(result).toBeDefined();
        expect(result.payment_id).toBe(mockPaymentRecord.payment_id);
      });

      it('should support apply_to_credit parameter', async () => {
        mockPaymentRepository.create.mockResolvedValue({
          ...mockPaymentRecord,
          applied_to_credit: true,
        });
        mockMpesaApiClient.initiatePayment.mockResolvedValue(mockMpesaResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
          applied_to_credit: true,
        });
        mockPaymentRepository.updateMpesaResponse.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
          applied_to_credit: true,
          mpesa_checkout_request_id: mockMpesaResponse.CheckoutRequestID,
        });

        await paymentService.initiatePayment(
          validPaymentData.transactionId,
          validPaymentData.phoneNumber,
          validPaymentData.amount,
          validPaymentData.storeId,
          true // applyToCredit
        );

        expect(mockPaymentRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            applied_to_credit: true,
          })
        );
      });

      it('should support optional customerId parameter', async () => {
        const customerId = 'cust-456';

        mockPaymentRepository.create.mockResolvedValue({
          ...mockPaymentRecord,
          customer_id: customerId,
        });
        mockMpesaApiClient.initiatePayment.mockResolvedValue(mockMpesaResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
          customer_id: customerId,
        });
        mockPaymentRepository.updateMpesaResponse.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
          customer_id: customerId,
          mpesa_checkout_request_id: mockMpesaResponse.CheckoutRequestID,
        });

        await paymentService.initiatePayment(
          validPaymentData.transactionId,
          validPaymentData.phoneNumber,
          validPaymentData.amount,
          validPaymentData.storeId,
          false,
          customerId
        );

        expect(mockPaymentRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            customer_id: customerId,
          })
        );
      });

      it('should normalize phone number with + prefix', async () => {
        const phoneWithPlus = '+254712345678';
        const expectedNormalizedPhone = '254712345678';

        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockResolvedValue(mockMpesaResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
        });
        mockPaymentRepository.updateMpesaResponse.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.PENDING,
          mpesa_checkout_request_id: mockMpesaResponse.CheckoutRequestID,
        });

        await paymentService.initiatePayment(
          validPaymentData.transactionId,
          phoneWithPlus,
          validPaymentData.amount,
          validPaymentData.storeId
        );

        expect(mockPaymentRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            phone_number: expectedNormalizedPhone,
          })
        );
      });
    });

    describe('failed payment initiation', () => {
      it('should handle payment repository create error', async () => {
        const error = new Error('Database connection failed');
        mockPaymentRepository.create.mockRejectedValue(error);

        await expect(
          paymentService.initiatePayment(
            validPaymentData.transactionId,
            validPaymentData.phoneNumber,
            validPaymentData.amount,
            validPaymentData.storeId
          )
        ).rejects.toThrow('Failed to create payment record');
      });

      it('should handle M-Pesa API errors', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockRejectedValue(
          new Error('Payment initiation failed: 500 - {"errorCode":"500.001"}')
        );
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.FAILED,
          error_message: 'M-Pesa service temporarily unavailable. Please try again.',
        });

        await expect(
          paymentService.initiatePayment(
            validPaymentData.transactionId,
            validPaymentData.phoneNumber,
            validPaymentData.amount,
            validPaymentData.storeId
          )
        ).rejects.toThrow('M-Pesa service temporarily unavailable');
      });

      it('should map API error codes to user-friendly messages', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockRejectedValue(
          new Error('Payment initiation failed: 1001')
        );
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentRecord,
          error_message: 'Incorrect M-Pesa credentials. Please contact support.',
        });

        await expect(
          paymentService.initiatePayment(
            validPaymentData.transactionId,
            validPaymentData.phoneNumber,
            validPaymentData.amount,
            validPaymentData.storeId
          )
        ).rejects.toThrow('Incorrect M-Pesa credentials');
      });

      it('should update payment record status to FAILED on API error', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockRejectedValue(
          new Error('Connection timeout')
        );
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentRecord,
          error_message: 'Network error. Please check your connection and try again.',
        });

        try {
          await paymentService.initiatePayment(
            validPaymentData.transactionId,
            validPaymentData.phoneNumber,
            validPaymentData.amount,
            validPaymentData.storeId
          );
        } catch {
          // Expected to throw
        }

        expect(mockPaymentRepository.updateStatus).toHaveBeenCalledWith(
          mockPaymentRecord.payment_id,
          PaymentStatus.FAILED,
          expect.any(Object)
        );
      });

      it('should store error message on API failure', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockRejectedValue(
          new Error('M-Pesa service error')
        );
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentRecord,
          error_message: 'Payment initiation failed. Please try again.',
        });

        try {
          await paymentService.initiatePayment(
            validPaymentData.transactionId,
            validPaymentData.phoneNumber,
            validPaymentData.amount,
            validPaymentData.storeId
          );
        } catch {
          // Expected to throw
        }

        expect(mockPaymentRepository.updateErrorMessage).toHaveBeenCalled();
      });

      it('should handle network timeout errors', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockRejectedValue(
          new Error('ECONNREFUSED: Connection refused')
        );
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentRecord,
          error_message: 'Network error. Please check your connection and try again.',
        });

        await expect(
          paymentService.initiatePayment(
            validPaymentData.transactionId,
            validPaymentData.phoneNumber,
            validPaymentData.amount,
            validPaymentData.storeId
          )
        ).rejects.toThrow('Network error');
      });

      it('should handle authentication errors', async () => {
        mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
        mockMpesaApiClient.initiatePayment.mockRejectedValue(
          new Error('OAuth authentication failed')
        );
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentRecord,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentRecord,
          error_message: 'Payment service configuration error. Please contact support.',
        });

        await expect(
          paymentService.initiatePayment(
            validPaymentData.transactionId,
            validPaymentData.phoneNumber,
            validPaymentData.amount,
            validPaymentData.storeId
          )
        ).rejects.toThrow('Payment service configuration error');
      });
    });

    describe('error message mapping', () => {
      const errorMappings = [
        { errorCode: '1001', expectedMessage: 'Incorrect M-Pesa credentials' },
        { errorCode: '1002', expectedMessage: 'Payment timed out' },
        { errorCode: '1032', expectedMessage: 'Payment cancelled by customer' },
        { errorCode: '1037', expectedMessage: 'Duplicate transaction' },
        { errorCode: '500', expectedMessage: 'M-Pesa service temporarily unavailable' },
        { errorCode: 'network', expectedMessage: 'Network error' },
        { errorCode: 'OAuth', expectedMessage: 'Payment service configuration error' },
      ];

      errorMappings.forEach(({ errorCode, expectedMessage }) => {
        it(`should map error code ${errorCode} to user-friendly message`, async () => {
          mockPaymentRepository.create.mockResolvedValue(mockPaymentRecord);
          mockMpesaApiClient.initiatePayment.mockRejectedValue(
            new Error(`Payment initiation failed: ${errorCode}`)
          );
          mockPaymentRepository.updateStatus.mockResolvedValue({
            ...mockPaymentRecord,
            status: PaymentStatus.FAILED,
          });
          mockPaymentRepository.updateErrorMessage.mockResolvedValue({
            ...mockPaymentRecord,
            error_message: expectedMessage,
          });

          await expect(
            paymentService.initiatePayment(
              validPaymentData.transactionId,
              validPaymentData.phoneNumber,
              validPaymentData.amount,
              validPaymentData.storeId
            )
          ).rejects.toThrow(expectedMessage);
        });
      });
    });
  });

  describe('pollPaymentStatus', () => {
    const mockPaymentData = {
      payment_id: 'pay-123',
      transaction_id: 'txn-123',
      store_id: 'store-001',
      phone_number: '254712345678',
      amount: 10000,
      status: PaymentStatus.PENDING,
      mpesa_checkout_request_id: 'ckr-123',
      created_at: new Date(),
      updated_at: new Date(),
      applied_to_credit: false,
    };

    const mockMpesaSuccessResponse = {
      MerchantRequestID: 'mer-req-123',
      CheckoutRequestID: 'ckr-123',
      ResultCode: 0,
      ResultDesc: 'The service request has been accepted successively',
      Amount: 100,
      PhoneNumber: '254712345678',
      RequestId: 'req-123',
      ResponseCode: '0',
    };

    const mockMpesaFailureResponse = {
      MerchantRequestID: 'mer-req-123',
      CheckoutRequestID: 'ckr-123',
      ResultCode: 1032,
      ResultDesc: 'Payment cancelled by customer',
      Amount: null,
      PhoneNumber: '254712345678',
      RequestId: 'req-123',
      ResponseCode: '1032',
    };

    describe('successful payment completion', () => {
      beforeEach(() => {
        // Setup a reconciliation service mock
        paymentService = new PaymentService(
          mockMpesaApiClient as MpesaApiClient,
          mockPaymentRepository as PaymentRepository,
          {
            reconcilePayment: jest.fn().mockResolvedValue({ success: true }),
          } as any
        );
      });

      it('should poll M-Pesa API for status', async () => {
        mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
        mockMpesaApiClient.queryPaymentStatus.mockResolvedValue(mockMpesaSuccessResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.COMPLETED,
        });

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockMpesaApiClient.queryPaymentStatus).toHaveBeenCalledWith(
          mockPaymentData.transaction_id,
          mockPaymentData.mpesa_checkout_request_id
        );
      });

      it('should update payment status to COMPLETED on success (result code 0)', async () => {
        mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
        mockMpesaApiClient.queryPaymentStatus.mockResolvedValue(mockMpesaSuccessResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.COMPLETED,
        });

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockPaymentRepository.updateStatus).toHaveBeenCalledWith(
          mockPaymentData.payment_id,
          PaymentStatus.COMPLETED,
          expect.objectContaining({
            changedBy: 'system',
            reason: 'Payment completed via polling',
          })
        );
      });

      it('should call reconciliation service on payment completion', async () => {
        const mockReconciliationService = {
          reconcilePayment: jest.fn().mockResolvedValue({ success: true }),
        };

        paymentService = new PaymentService(
          mockMpesaApiClient as MpesaApiClient,
          mockPaymentRepository as PaymentRepository,
          mockReconciliationService as any
        );

        mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
        mockMpesaApiClient.queryPaymentStatus.mockResolvedValue(mockMpesaSuccessResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.COMPLETED,
        });

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockReconciliationService.reconcilePayment).toHaveBeenCalledWith(
          mockPaymentData.payment_id
        );
      });
    });

    describe('payment failure handling', () => {
      it('should update payment status to FAILED on failure (non-zero result code)', async () => {
        mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
        mockMpesaApiClient.queryPaymentStatus.mockResolvedValue(mockMpesaFailureResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.FAILED,
          error_message: 'Payment was cancelled by the customer.',
        });

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockPaymentRepository.updateStatus).toHaveBeenCalledWith(
          mockPaymentData.payment_id,
          PaymentStatus.FAILED,
          expect.objectContaining({
            changedBy: 'system',
            reason: expect.stringContaining('Payment failed via polling'),
          })
        );
      });

      it('should update error message with reason for failed payment', async () => {
        mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
        mockMpesaApiClient.queryPaymentStatus.mockResolvedValue(mockMpesaFailureResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentData,
          error_message: 'Payment was cancelled by the customer.',
        });

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockPaymentRepository.updateErrorMessage).toHaveBeenCalledWith(
          mockPaymentData.payment_id,
          expect.stringContaining('cancelled')
        );
      });

      it('should map error code 1032 to user-friendly message', async () => {
        mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
        mockMpesaApiClient.queryPaymentStatus.mockResolvedValue(mockMpesaFailureResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentData,
          error_message: 'Payment was cancelled by the customer.',
        });

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockPaymentRepository.updateErrorMessage).toHaveBeenCalledWith(
          mockPaymentData.payment_id,
          'Payment was cancelled by the customer.'
        );
      });

      it('should stop polling and cleanup timers on payment failure', async () => {
        mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
        mockMpesaApiClient.queryPaymentStatus.mockResolvedValue(mockMpesaFailureResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.FAILED,
        });
        mockPaymentRepository.updateErrorMessage.mockResolvedValue({
          ...mockPaymentData,
          error_message: 'Payment was cancelled by the customer.',
        });

        // The polling should stop after status is updated
        // We verify by checking that no more polling would happen
        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        // On next poll of an already-failed payment, it should stop
        mockPaymentRepository.findById.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.FAILED,
        });

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        // Should not call queryPaymentStatus again since payment is already failed
        expect(mockMpesaApiClient.queryPaymentStatus).toHaveBeenCalledTimes(1);
      });
    });

    describe('terminal state handling', () => {
      it('should stop polling if payment is already COMPLETED', async () => {
        const completedPayment = {
          ...mockPaymentData,
          status: PaymentStatus.COMPLETED,
        };

        mockPaymentRepository.findById.mockResolvedValue(completedPayment);

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        // Should not call queryPaymentStatus for completed payment
        expect(mockMpesaApiClient.queryPaymentStatus).not.toHaveBeenCalled();
      });

      it('should stop polling if payment is already FAILED', async () => {
        const failedPayment = {
          ...mockPaymentData,
          status: PaymentStatus.FAILED,
        };

        mockPaymentRepository.findById.mockResolvedValue(failedPayment);

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockMpesaApiClient.queryPaymentStatus).not.toHaveBeenCalled();
      });

      it('should stop polling if payment is EXPIRED', async () => {
        const expiredPayment = {
          ...mockPaymentData,
          status: PaymentStatus.EXPIRED,
        };

        mockPaymentRepository.findById.mockResolvedValue(expiredPayment);

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockMpesaApiClient.queryPaymentStatus).not.toHaveBeenCalled();
      });

      it('should stop polling if payment is CANCELLED', async () => {
        const cancelledPayment = {
          ...mockPaymentData,
          status: PaymentStatus.CANCELLED,
        };

        mockPaymentRepository.findById.mockResolvedValue(cancelledPayment);

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockMpesaApiClient.queryPaymentStatus).not.toHaveBeenCalled();
      });
    });

    describe('error handling during polling', () => {
      it('should handle payment not found gracefully', async () => {
        mockPaymentRepository.findById.mockResolvedValue(null);

        // Should not throw
        await expect(
          paymentService.pollPaymentStatus(mockPaymentData.payment_id)
        ).resolves.not.toThrow();

        expect(mockMpesaApiClient.queryPaymentStatus).not.toHaveBeenCalled();
      });

      it('should handle missing checkout request ID', async () => {
        const paymentWithoutCheckoutId = {
          ...mockPaymentData,
          mpesa_checkout_request_id: null,
        };

        mockPaymentRepository.findById.mockResolvedValue(paymentWithoutCheckoutId);

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(mockMpesaApiClient.queryPaymentStatus).not.toHaveBeenCalled();
      });

      it('should log and continue on API query error', async () => {
        mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
        mockMpesaApiClient.queryPaymentStatus.mockRejectedValue(
          new Error('API request failed')
        );

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

        expect(consoleSpy).toHaveBeenCalled();
        expect(mockPaymentRepository.updateStatus).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('should handle reconciliation failure gracefully', async () => {
        const mockReconciliationService = {
          reconcilePayment: jest.fn().mockRejectedValue(
            new Error('Reconciliation failed')
          ),
        };

        paymentService = new PaymentService(
          mockMpesaApiClient as MpesaApiClient,
          mockPaymentRepository as PaymentRepository,
          mockReconciliationService as any
        );

        mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
        mockMpesaApiClient.queryPaymentStatus.mockResolvedValue(mockMpesaSuccessResponse);
        mockPaymentRepository.updateStatus.mockResolvedValue({
          ...mockPaymentData,
          status: PaymentStatus.COMPLETED,
        });

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        // Should not throw even though reconciliation failed
        await expect(
          paymentService.pollPaymentStatus(mockPaymentData.payment_id)
        ).resolves.not.toThrow();

        expect(mockPaymentRepository.updateStatus).toHaveBeenCalled();

        consoleSpy.mockRestore();
      });
    });

    describe('various M-Pesa response codes', () => {
      const testCases = [
        { resultCode: 0, expectedStatus: PaymentStatus.COMPLETED, description: 'success' },
        { resultCode: 1, expectedStatus: PaymentStatus.FAILED, description: 'payment rejected' },
        { resultCode: 2, expectedStatus: PaymentStatus.FAILED, description: 'payment rejected with check details' },
        { resultCode: 1001, expectedStatus: PaymentStatus.FAILED, description: 'incorrect credentials' },
        { resultCode: 1032, expectedStatus: PaymentStatus.FAILED, description: 'customer cancelled' },
      ];

      testCases.forEach(({ resultCode, expectedStatus, description }) => {
        it(`should handle result code ${resultCode} (${description})`, async () => {
          const response = {
            MerchantRequestID: 'mer-req-123',
            CheckoutRequestID: 'ckr-123',
            ResultCode: resultCode,
            ResultDesc: description,
          };

          mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
          mockMpesaApiClient.queryPaymentStatus.mockResolvedValue(response);
          mockPaymentRepository.updateStatus.mockResolvedValue({
            ...mockPaymentData,
            status: expectedStatus,
          });
          mockPaymentRepository.updateErrorMessage.mockResolvedValue({
            ...mockPaymentData,
            status: expectedStatus,
          });

          await paymentService.pollPaymentStatus(mockPaymentData.payment_id);

          expect(mockPaymentRepository.updateStatus).toHaveBeenCalledWith(
            mockPaymentData.payment_id,
            expectedStatus,
            expect.any(Object)
          );
        });
      });
    });
  });

  describe('handlePaymentTimeout', () => {
    const mockPaymentData = {
      payment_id: 'pay-123',
      transaction_id: 'txn-123',
      store_id: 'store-001',
      phone_number: '254712345678',
      amount: 10000,
      status: PaymentStatus.PENDING,
      mpesa_checkout_request_id: 'ckr-123',
      created_at: new Date(),
      updated_at: new Date(),
      applied_to_credit: false,
    };

    it('should mark payment as EXPIRED after 2 minutes', async () => {
      mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
      mockPaymentRepository.updateStatus.mockResolvedValue({
        ...mockPaymentData,
        status: PaymentStatus.EXPIRED,
      });
      mockPaymentRepository.updateErrorMessage.mockResolvedValue({
        ...mockPaymentData,
        status: PaymentStatus.EXPIRED,
        error_message: 'Payment expired. Customer can retry or select another payment method.',
      });

      await paymentService.handlePaymentTimeout(mockPaymentData.payment_id);

      expect(mockPaymentRepository.updateStatus).toHaveBeenCalledWith(
        mockPaymentData.payment_id,
        PaymentStatus.EXPIRED,
        expect.objectContaining({
          changedBy: 'system',
          metadata: expect.objectContaining({
            timeout_duration_seconds: 120,
          }),
        })
      );
    });

    it('should update error message for operator', async () => {
      mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
      mockPaymentRepository.updateStatus.mockResolvedValue({
        ...mockPaymentData,
        status: PaymentStatus.EXPIRED,
      });
      mockPaymentRepository.updateErrorMessage.mockResolvedValue({
        ...mockPaymentData,
        error_message: 'Payment expired. Customer can retry or select another payment method.',
      });

      await paymentService.handlePaymentTimeout(mockPaymentData.payment_id);

      expect(mockPaymentRepository.updateErrorMessage).toHaveBeenCalledWith(
        mockPaymentData.payment_id,
        'Payment expired. Customer can retry or select another payment method.'
      );
    });

    it('should skip timeout if payment is already COMPLETED', async () => {
      const completedPayment = {
        ...mockPaymentData,
        status: PaymentStatus.COMPLETED,
      };

      mockPaymentRepository.findById.mockResolvedValue(completedPayment);

      await paymentService.handlePaymentTimeout(mockPaymentData.payment_id);

      expect(mockPaymentRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('should skip timeout if payment is already FAILED', async () => {
      const failedPayment = {
        ...mockPaymentData,
        status: PaymentStatus.FAILED,
      };

      mockPaymentRepository.findById.mockResolvedValue(failedPayment);

      await paymentService.handlePaymentTimeout(mockPaymentData.payment_id);

      expect(mockPaymentRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('should skip timeout if payment is already EXPIRED', async () => {
      const expiredPayment = {
        ...mockPaymentData,
        status: PaymentStatus.EXPIRED,
      };

      mockPaymentRepository.findById.mockResolvedValue(expiredPayment);

      await paymentService.handlePaymentTimeout(mockPaymentData.payment_id);

      expect(mockPaymentRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('should handle payment not found gracefully', async () => {
      mockPaymentRepository.findById.mockResolvedValue(null);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await paymentService.handlePaymentTimeout(mockPaymentData.payment_id);

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should cleanup timers on timeout', async () => {
      mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
      mockPaymentRepository.updateStatus.mockResolvedValue({
        ...mockPaymentData,
        status: PaymentStatus.EXPIRED,
      });
      mockPaymentRepository.updateErrorMessage.mockResolvedValue({
        ...mockPaymentData,
        error_message: 'Payment expired. Customer can retry or select another payment method.',
      });

      // Set a fake timer to verify cleanup
      const fakeTimer = setTimeout(() => {}, 10000);
      (paymentService as any).timeoutTimers.set(mockPaymentData.payment_id, fakeTimer);

      await paymentService.handlePaymentTimeout(mockPaymentData.payment_id);

      // Timer should be cleaned up
      expect((paymentService as any).timeoutTimers.get(mockPaymentData.payment_id)).toBeUndefined();

      clearTimeout(fakeTimer);
    });

    it('should cleanup timers even if update fails', async () => {
      mockPaymentRepository.findById.mockResolvedValue(mockPaymentData);
      mockPaymentRepository.updateStatus.mockRejectedValue(
        new Error('Database error')
      );

      const fakeTimer = setTimeout(() => {}, 10000);
      (paymentService as any).timeoutTimers.set(mockPaymentData.payment_id, fakeTimer);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await paymentService.handlePaymentTimeout(mockPaymentData.payment_id);

      expect(consoleSpy).toHaveBeenCalled();
      expect((paymentService as any).timeoutTimers.get(mockPaymentData.payment_id)).toBeUndefined();

      consoleSpy.mockRestore();
      clearTimeout(fakeTimer);
    });
  });

  describe('getPayment', () => {
    it('should return payment when found', async () => {
      const mockPayment = {
        payment_id: 'pay-123',
        transaction_id: 'txn-123',
        store_id: 'store-001',
        phone_number: '254712345678',
        amount: 10000,
        status: PaymentStatus.COMPLETED,
        created_at: new Date(),
        updated_at: new Date(),
        applied_to_credit: false,
      };

      mockPaymentRepository.findById.mockResolvedValue(mockPayment);

      const result = await paymentService.getPayment(mockPayment.payment_id);

      expect(result).toEqual(mockPayment);
      expect(mockPaymentRepository.findById).toHaveBeenCalledWith(mockPayment.payment_id);
    });

    it('should return null when payment not found', async () => {
      mockPaymentRepository.findById.mockResolvedValue(null);

      const result = await paymentService.getPayment('non-existent-id');

      expect(result).toBeNull();
    });
  });
});
