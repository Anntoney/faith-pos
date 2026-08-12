/**
 * Unit tests for M-Pesa API Client
 * Requirements: 1.2, 1.4, 10.3
 */

import { MpesaApiClient } from '../../src/services/mpesa/MpesaApiClient';
import { MpesaInitiateResponse, MpesaStatusResponse } from '../../src/types/payment';

// Mock fetch globally
global.fetch = jest.fn();

describe('MpesaApiClient', () => {
  let client: MpesaApiClient;
  const mockConsumerKey = 'test-key';
  const mockConsumerSecret = 'test-secret';
  const mockBusinessShortCode = '174379';
  const mockPasskey = 'bfb279f9aa9bdbcf158e97dd1a503b6e78609f1f05a8d902d3ae6416f9ae8c28';

  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    client = new MpesaApiClient(
      mockConsumerKey,
      mockConsumerSecret,
      mockBusinessShortCode,
      mockPasskey,
      'sandbox'
    );
  });

  describe('getAccessToken', () => {
    it('should retrieve an access token from M-Pesa OAuth endpoint', async () => {
      const mockToken = {
        access_token: 'test-token-12345',
        expires_in: 3600,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      });

      const token = await client.getAccessToken();

      expect(token).toBe('test-token-12345');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/v1/generate'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        })
      );
    });

    it('should cache token and not request new one if still valid', async () => {
      const mockToken = {
        access_token: 'test-token-12345',
        expires_in: 3600,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockToken,
      });

      const token1 = await client.getAccessToken();
      const token2 = await client.getAccessToken();

      expect(token1).toBe(token2);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should throw error if OAuth request fails', async () => {
      // Mock all retry attempts to fail
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid credentials' }),
      });

      await expect(client.getAccessToken()).rejects.toThrow();
    }, 10000);
  });

  describe('initiatePayment', () => {
    const mockToken = {
      access_token: 'test-token-12345',
      expires_in: 3600,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should initiate a payment with M-Pesa API', async () => {
      const freshClient = new MpesaApiClient(
        mockConsumerKey,
        mockConsumerSecret,
        mockBusinessShortCode,
        mockPasskey,
        'sandbox'
      );

      const mockResponse: MpesaInitiateResponse = {
        MerchantRequestID: 'merchant-12345',
        CheckoutRequestID: 'checkout-12345',
        ResponseCode: '0',
        ResponseDescription: 'Success',
        CustomerMessage: 'Please enter your M-Pesa PIN',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const result = await freshClient.initiatePayment(
        '254723456789',
        50000, // 500 KES in cents
        'txn-001',
        'https://example.com/callback'
      );

      expect(result.CheckoutRequestID).toBe('checkout-12345');
      expect(result.ResponseCode).toBe('0');
      
      // Verify the payment endpoint was called
      const calls = (global.fetch as jest.Mock).mock.calls;
      const paymentCall = calls[calls.length - 1];
      expect(paymentCall[0]).toContain('/mpesa/stkpush/v1/processrequest');
    });

    it('should handle payment initiation failure with 4xx error', async () => {
      const freshClient = new MpesaApiClient(
        mockConsumerKey,
        mockConsumerSecret,
        mockBusinessShortCode,
        mockPasskey,
        'sandbox'
      );

      // Mock OAuth succeeds, then payment initiation fails
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: 'Invalid request' }),
        });

      await expect(
        freshClient.initiatePayment('254723456789', 50000, 'txn-001', 'https://example.com/callback')
      ).rejects.toThrow();
    }, 10000);

    it('should convert amount from cents to KES', async () => {
      const freshClient = new MpesaApiClient(
        mockConsumerKey,
        mockConsumerSecret,
        mockBusinessShortCode,
        mockPasskey,
        'sandbox'
      );

      const mockResponse: MpesaInitiateResponse = {
        MerchantRequestID: 'merchant-12345',
        CheckoutRequestID: 'checkout-12345',
        ResponseCode: '0',
        ResponseDescription: 'Success',
        CustomerMessage: 'Please enter your M-Pesa PIN',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      await freshClient.initiatePayment(
        '254723456789',
        50000, // 500 KES in cents
        'txn-001',
        'https://example.com/callback'
      );

      const paymentCall = (global.fetch as jest.Mock).mock.calls[1]; // After OAuth call
      const payload = JSON.parse(paymentCall[1].body);
      expect(payload.Amount).toBe(500); // Should be 500 KES
    });
  });

  describe('queryPaymentStatus', () => {
    const mockToken = {
      access_token: 'test-token-12345',
      expires_in: 3600,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should query payment status from M-Pesa API', async () => {
      const freshClient = new MpesaApiClient(
        mockConsumerKey,
        mockConsumerSecret,
        mockBusinessShortCode,
        mockPasskey,
        'sandbox'
      );

      const mockResponse: MpesaStatusResponse = {
        MerchantRequestID: 'merchant-12345',
        CheckoutRequestID: 'checkout-12345',
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully',
        Amount: 500,
        MpesaReceiptNumber: 'LIL123456789',
        PhoneNumber: '254723456789',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const result = await freshClient.queryPaymentStatus(
        'merchant-12345',
        'checkout-12345'
      );

      expect(result.ResultCode).toBe(0);
      expect(result.Amount).toBe(500);
      expect(result.MpesaReceiptNumber).toBe('LIL123456789');
    });

    it('should return failed status when ResultCode is non-zero', async () => {
      const freshClient = new MpesaApiClient(
        mockConsumerKey,
        mockConsumerSecret,
        mockBusinessShortCode,
        mockPasskey,
        'sandbox'
      );

      const mockResponse: MpesaStatusResponse = {
        MerchantRequestID: 'merchant-12345',
        CheckoutRequestID: 'checkout-12345',
        ResultCode: 1002,
        ResultDesc: 'Request cancelled by user',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const result = await freshClient.queryPaymentStatus(
        'merchant-12345',
        'checkout-12345'
      );

      expect(result.ResultCode).toBe(1002);
    });

    it('should throw error if status query fails', async () => {
      const freshClient = new MpesaApiClient(
        mockConsumerKey,
        mockConsumerSecret,
        mockBusinessShortCode,
        mockPasskey,
        'sandbox'
      );

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' }),
        });

      await expect(
        freshClient.queryPaymentStatus('merchant-12345', 'checkout-12345')
      ).rejects.toThrow();
    }, 10000);
  });

  describe('validateWebhookSignature', () => {
    it('should validate correct webhook signature', () => {
      const payload = '{"Body":{"stkCallback":{"ResultCode":0}}}';
      // Generate the correct signature using the business short code
      const crypto = require('crypto');
      const correctSignature = crypto
        .createHmac('sha256', mockBusinessShortCode)
        .update(payload)
        .digest('base64');

      const isValid = client.validateWebhookSignature(payload, correctSignature);
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const payload = '{"Body":{"stkCallback":{"ResultCode":0}}}';
      const invalidSignature = 'invalid-signature-12345';

      const isValid = client.validateWebhookSignature(payload, invalidSignature);
      expect(isValid).toBe(false);
    });

    it('should return false for malformed payload', () => {
      const isValid = client.validateWebhookSignature(null as any, 'signature');
      expect(isValid).toBe(false);
    });
  });

  describe('mapErrorCodeToMessage', () => {
    it('should map M-Pesa error codes to user-friendly messages', () => {
      expect(client.mapErrorCodeToMessage('0')).toContain('successful');
      expect(client.mapErrorCodeToMessage('1001')).toContain('credentials');
      expect(client.mapErrorCodeToMessage('1002')).toContain('timed out');
      expect(client.mapErrorCodeToMessage('1032')).toContain('cancelled');
      expect(client.mapErrorCodeToMessage('1037')).toContain('Duplicate');
    });

    it('should return generic message for unknown error code', () => {
      const message = client.mapErrorCodeToMessage('0001');
      expect(message).toContain('Please try again');
      expect(message).toContain('0001');
    });
  });

  describe('parseWebhookPayload', () => {
    it('should parse valid webhook payload', () => {
      const payload = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'merchant-12345',
            CheckoutRequestID: 'checkout-12345',
            ResultCode: 0,
            ResultDesc: 'Success',
          },
        },
      };

      const parsed = client.parseWebhookPayload(payload);
      expect(parsed.Body.stkCallback.ResultCode).toBe(0);
    });

    it('should throw error for missing Body', () => {
      const payload = { stkCallback: {} };
      expect(() => client.parseWebhookPayload(payload)).toThrow('Missing webhook Body');
    });

    it('should throw error for missing stkCallback', () => {
      const payload = { Body: {} };
      expect(() => client.parseWebhookPayload(payload)).toThrow('Missing stkCallback');
    });

    it('should throw error for null payload', () => {
      expect(() => client.parseWebhookPayload(null)).toThrow('Invalid webhook payload');
    });
  });

  describe('withRetry', () => {
    it('should retry failed operations with exponential backoff', async () => {
      let attempts = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      // Access private method through type casting
      const result = await (client as any).withRetry(mockFn, 3);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect((client as any).withRetry(mockFn, 2)).rejects.toThrow('Persistent failure');
      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });
});
