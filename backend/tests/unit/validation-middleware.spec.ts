/**
 * Unit tests for Validation Middleware
 * Requirements: 1.4, 3.1, 7.4
 * TASK 21: Data Validation Middleware Tests
 */

import {
  validatePaymentRequest,
  validateWebhookRequest,
  validatePaymentId,
  validateStoreId,
  validatePaginationParams,
} from '../../src/middleware/validation';
import { Request, Response, NextFunction } from 'express';

describe('Validation Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe('validatePaymentRequest', () => {
    it('should pass validation with valid payment data', () => {
      mockReq = {
        body: {
          transaction_id: 'txn-123',
          phone_number: '254723456789',
          amount: 50000,
          store_id: 'store-123',
        },
      };

      validatePaymentRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should accept +254 phone number format', () => {
      mockReq = {
        body: {
          transaction_id: 'txn-123',
          phone_number: '+254723456789',
          amount: 50000,
          store_id: 'store-123',
        },
      };

      validatePaymentRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing transaction_id', () => {
      mockReq = {
        body: {
          phone_number: '254723456789',
          amount: 50000,
          store_id: 'store-123',
        },
      };

      validatePaymentRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_REQUEST',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid phone number format', () => {
      mockReq = {
        body: {
          transaction_id: 'txn-123',
          phone_number: '723456789', // No 254 prefix
          amount: 50000,
          store_id: 'store-123',
        },
      };

      validatePaymentRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_PHONE',
        })
      );
    });

    it('should reject negative amount', () => {
      mockReq = {
        body: {
          transaction_id: 'txn-123',
          phone_number: '254723456789',
          amount: -100,
          store_id: 'store-123',
        },
      };

      validatePaymentRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_AMOUNT',
        })
      );
    });

    it('should reject missing store_id', () => {
      mockReq = {
        body: {
          transaction_id: 'txn-123',
          phone_number: '254723456789',
          amount: 50000,
        },
      };

      validatePaymentRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_STORE',
        })
      );
    });

    it('should reject zero amount', () => {
      mockReq = {
        body: {
          transaction_id: 'txn-123',
          phone_number: '254723456789',
          amount: 0,
          store_id: 'store-123',
        },
      };

      validatePaymentRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_AMOUNT',
        })
      );
    });
  });

  describe('validateWebhookRequest', () => {
    it('should pass validation with valid webhook data', () => {
      mockReq = {
        headers: {
          'x-m2m-signature': 'valid-signature-123',
          'x-store-id': 'store-123',
        },
        body: {
          Body: {
            stkCallback: {
              CheckoutRequestID: 'req-123',
              ResultCode: 0,
              ResultDesc: 'Success',
            },
          },
        },
      };

      validateWebhookRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing webhook signature', () => {
      mockReq = {
        headers: {
          'x-store-id': 'store-123',
        },
        body: {
          Body: {
            stkCallback: {
              CheckoutRequestID: 'req-123',
              ResultCode: 0,
              ResultDesc: 'Success',
            },
          },
        },
      };

      validateWebhookRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_SIGNATURE',
        })
      );
    });

    it('should reject missing store_id', () => {
      mockReq = {
        headers: {
          'x-m2m-signature': 'valid-signature-123',
        },
        body: {
          Body: {
            stkCallback: {
              CheckoutRequestID: 'req-123',
              ResultCode: 0,
              ResultDesc: 'Success',
            },
          },
        },
      };

      validateWebhookRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_STORE_ID',
        })
      );
    });

    it('should reject invalid webhook payload structure', () => {
      mockReq = {
        headers: {
          'x-m2m-signature': 'valid-signature-123',
          'x-store-id': 'store-123',
        },
        body: {
          // Missing Body.stkCallback
          data: {},
        },
      };

      validateWebhookRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_PAYLOAD',
        })
      );
    });

    it('should reject missing stkCallback fields', () => {
      mockReq = {
        headers: {
          'x-m2m-signature': 'valid-signature-123',
          'x-store-id': 'store-123',
        },
        body: {
          Body: {
            stkCallback: {
              CheckoutRequestID: 'req-123',
              // Missing ResultCode and ResultDesc
            },
          },
        },
      };

      validateWebhookRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'MISSING_FIELDS',
        })
      );
    });
  });

  describe('validatePaymentId', () => {
    it('should pass validation with valid UUID', () => {
      mockReq = {
        params: {
          payment_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      };

      validatePaymentId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid UUID format', () => {
      mockReq = {
        params: {
          payment_id: 'not-a-uuid',
        },
      };

      validatePaymentId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_PAYMENT_ID',
        })
      );
    });

    it('should reject missing payment_id', () => {
      mockReq = {
        params: {},
      };

      validatePaymentId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateStoreId', () => {
    it('should pass validation with valid store_id in params', () => {
      mockReq = {
        params: {
          store_id: 'store-123',
        },
      };

      validateStoreId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should pass validation with valid store_id in query', () => {
      mockReq = {
        params: {},
        query: {
          store_id: 'store-123',
        },
      };

      validateStoreId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should pass validation with valid store_id in header', () => {
      mockReq = {
        params: {},
        query: {},
        headers: {
          'x-store-id': 'store-123',
        },
      };

      validateStoreId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject empty store_id', () => {
      mockReq = {
        params: {
          store_id: '',
        },
      };

      validateStoreId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_STORE_ID',
        })
      );
    });

    it('should reject missing store_id', () => {
      mockReq = {
        params: {},
        query: {},
        headers: {},
      };

      validateStoreId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validatePaginationParams', () => {
    it('should pass validation with valid pagination params', () => {
      mockReq = {
        query: {
          limit: '10',
          offset: '0',
        },
      };

      validatePaginationParams(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).pagination).toEqual({ limit: 10, offset: 0 });
    });

    it('should use default values when params missing', () => {
      mockReq = {
        query: {},
      };

      validatePaginationParams(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).pagination).toEqual({ limit: 10, offset: 0 });
    });

    it('should reject limit > 100', () => {
      mockReq = {
        query: {
          limit: '101',
          offset: '0',
        },
      };

      validatePaginationParams(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_LIMIT',
        })
      );
    });

    it('should reject limit <= 0', () => {
      mockReq = {
        query: {
          limit: '0',
          offset: '0',
        },
      };

      validatePaginationParams(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_LIMIT',
        })
      );
    });

    it('should reject negative offset', () => {
      mockReq = {
        query: {
          limit: '10',
          offset: '-1',
        },
      };

      validatePaginationParams(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_OFFSET',
        })
      );
    });
  });
});
