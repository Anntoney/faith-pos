/**
 * Unit tests for Payment Repository
 * Requirements: 7.1, 7.4, 7.5
 */

import { PaymentRepository } from '../../src/repositories/PaymentRepository';
import { PaymentStatus, Payment, PaymentAuditLog } from '../../src/types/payment';

// Mock Supabase client
const createMockSupabaseClient = () => {
  return {
    from: jest.fn(),
  };
};

describe('PaymentRepository', () => {
  let repository: PaymentRepository;
  let mockSupabase: any;

  const mockStoreId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTransactionId = '660e8400-e29b-41d4-a716-446655440001';
  const mockPaymentId = '770e8400-e29b-41d4-a716-446655440002';
  const mockCustomerId = '880e8400-e29b-41d4-a716-446655440003';

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient();
    repository = new PaymentRepository(mockSupabase);
  });

  describe('create', () => {
    it('should create a payment record with valid data', async () => {
      const paymentData = {
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      const mockResponse = {
        payment_id: mockPaymentId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reconciled_at: null,
        ...paymentData,
      };

      const mockChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockResponse, error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.create(paymentData);

      expect(result).toEqual({
        ...mockResponse,
        created_at: new Date(mockResponse.created_at),
        updated_at: new Date(mockResponse.updated_at),
        reconciled_at: null,
      });
      expect(mockSupabase.from).toHaveBeenCalledWith('payments');
      expect(mockChain.insert).toHaveBeenCalled();
    });

    it('should validate required fields before creating', async () => {
      const invalidPayment = {
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
        // Missing transaction_id
      };

      await expect(repository.create(invalidPayment as any)).rejects.toThrow(
        'Payment validation failed'
      );
    });

    it('should validate phone number format', async () => {
      const paymentData = {
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: 'invalid-phone', // Invalid format
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      await expect(repository.create(paymentData as any)).rejects.toThrow(
        'phone_number must be in valid format'
      );
    });

    it('should validate amount is positive', async () => {
      const paymentData = {
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: -100, // Negative amount
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      await expect(repository.create(paymentData as any)).rejects.toThrow(
        'amount is required and must be a positive number'
      );
    });

    it('should validate status is valid enum value', async () => {
      const paymentData = {
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: 'INVALID_STATUS', // Invalid status
        applied_to_credit: false,
      };

      await expect(repository.create(paymentData as any)).rejects.toThrow(
        'status must be one of'
      );
    });

    it('should accept +254 phone number format', async () => {
      const paymentData = {
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '+254723456789', // +254 format
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      const mockResponse = {
        payment_id: mockPaymentId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reconciled_at: null,
        ...paymentData,
      };

      const mockChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockResponse, error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.create(paymentData);
      expect(result.phone_number).toBe('+254723456789');
    });

    it('should throw error if database insert fails', async () => {
      const paymentData = {
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      const mockChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      await expect(repository.create(paymentData)).rejects.toThrow('Failed to create payment');
    });
  });

  describe('findById', () => {
    it('should find a payment by ID', async () => {
      const mockResponse = {
        payment_id: mockPaymentId,
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reconciled_at: null,
        applied_to_credit: false,
        customer_id: null,
        mpesa_checkout_request_id: null,
        mpesa_response_code: null,
        error_message: null,
      };

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockResponse, error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.findById(mockPaymentId);

      expect(result).toBeDefined();
      expect(result?.payment_id).toBe(mockPaymentId);
      expect(mockChain.eq).toHaveBeenCalledWith('payment_id', mockPaymentId);
    });

    it('should return null if payment not found', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.findById(mockPaymentId);
      expect(result).toBeNull();
    });

    it('should throw error if query fails', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      await expect(repository.findById(mockPaymentId)).rejects.toThrow('Failed to find payment');
    });
  });

  describe('findByStore', () => {
    it('should find payments by store ID with pagination', async () => {
      const mockPayments = [
        {
          payment_id: mockPaymentId,
          transaction_id: mockTransactionId,
          store_id: mockStoreId,
          phone_number: '254723456789',
          amount: 50000,
          status: PaymentStatus.COMPLETED,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          reconciled_at: null,
          applied_to_credit: false,
          customer_id: null,
          mpesa_checkout_request_id: 'req-123',
          mpesa_response_code: '0',
          error_message: null,
        },
      ];

      const mockCountChain = {
        select: jest.fn(),
        eq: jest.fn().mockReturnThis(),
      };

      const mockDataChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: mockPayments, error: null }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockCountChain)
        .mockReturnValueOnce(mockDataChain);

      // Mock the count chain to return count property
      mockCountChain.select.mockReturnValue({
        eq: mockCountChain.eq,
      });
      mockCountChain.eq.mockResolvedValue({ count: 1, error: null });

      const result = await repository.findByStore(mockStoreId, 10, 0);

      expect(result.total).toBe(1);
      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].payment_id).toBe(mockPaymentId);
    });

    it('should support pagination with limit and offset', async () => {
      const mockCountChain = {
        select: jest.fn(),
        eq: jest.fn().mockReturnThis(),
      };

      const mockDataChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockCountChain)
        .mockReturnValueOnce(mockDataChain);

      mockCountChain.select.mockReturnValue({
        eq: mockCountChain.eq,
      });
      mockCountChain.eq.mockResolvedValue({ count: 50, error: null });

      await repository.findByStore(mockStoreId, 10, 20);

      // Verify range was called with correct offset calculation (20 to 29)
      expect(mockDataChain.range).toHaveBeenCalledWith(20, 29);
    });

    it('should order results by created_at descending', async () => {
      const mockCountChain = {
        select: jest.fn(),
        eq: jest.fn().mockReturnThis(),
      };

      const mockDataChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockCountChain)
        .mockReturnValueOnce(mockDataChain);

      mockCountChain.select.mockReturnValue({
        eq: mockCountChain.eq,
      });
      mockCountChain.eq.mockResolvedValue({ count: 0, error: null });

      await repository.findByStore(mockStoreId);

      expect(mockDataChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('findByTransaction', () => {
    it('should find payment by transaction ID', async () => {
      const mockResponse = {
        payment_id: mockPaymentId,
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reconciled_at: null,
        applied_to_credit: false,
        customer_id: null,
        mpesa_checkout_request_id: null,
        mpesa_response_code: null,
        error_message: null,
      };

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockResponse, error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.findByTransaction(mockTransactionId);

      expect(result).toBeDefined();
      expect(result?.transaction_id).toBe(mockTransactionId);
      expect(mockChain.eq).toHaveBeenCalledWith('transaction_id', mockTransactionId);
    });

    it('should return null if no payment found for transaction', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.findByTransaction(mockTransactionId);
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update payment status and create audit log', async () => {
      const currentPayment = {
        payment_id: mockPaymentId,
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reconciled_at: null,
        applied_to_credit: false,
        customer_id: null,
        mpesa_checkout_request_id: null,
        mpesa_response_code: null,
        error_message: null,
      };

      const updatedPayment = {
        ...currentPayment,
        status: PaymentStatus.COMPLETED,
        updated_at: new Date().toISOString(),
      };

      // Mock for findById
      const mockFindChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: currentPayment, error: null }),
      };

      // Mock for update
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: updatedPayment, error: null }),
      };

      // Mock for audit log insert
      const mockAuditChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            audit_log_id: 'audit-123',
            payment_id: mockPaymentId,
            previous_status: PaymentStatus.INITIATED,
            new_status: PaymentStatus.COMPLETED,
            changed_by: 'system',
            changed_at: new Date().toISOString(),
            reason: null,
            metadata: null,
          },
          error: null,
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockFindChain)
        .mockReturnValueOnce(mockUpdateChain)
        .mockReturnValueOnce(mockAuditChain);

      const result = await repository.updateStatus(mockPaymentId, PaymentStatus.COMPLETED, {
        changedBy: 'system',
        reason: 'Payment verified',
      });

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(mockAuditChain.insert).toHaveBeenCalled();
    });

    it('should throw error if payment not found', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      await expect(
        repository.updateStatus(mockPaymentId, PaymentStatus.COMPLETED, { changedBy: 'system' })
      ).rejects.toThrow('not found');
    });
  });

  describe('updateReconciled', () => {
    it('should update reconciled_at timestamp', async () => {
      const reconciledAt = new Date();
      const updatedPayment = {
        payment_id: mockPaymentId,
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.COMPLETED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reconciled_at: reconciledAt.toISOString(),
        applied_to_credit: false,
        customer_id: null,
        mpesa_checkout_request_id: 'req-123',
        mpesa_response_code: '0',
        error_message: null,
      };

      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: updatedPayment, error: null }),
      };

      const mockAuditChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            audit_log_id: 'audit-123',
            payment_id: mockPaymentId,
            previous_status: PaymentStatus.COMPLETED,
            new_status: PaymentStatus.COMPLETED,
            changed_by: 'system',
            changed_at: new Date().toISOString(),
            reason: 'Payment reconciled',
            metadata: { reconciled_at: reconciledAt.toISOString() },
          },
          error: null,
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockUpdateChain)
        .mockReturnValueOnce(mockAuditChain);

      const result = await repository.updateReconciled(mockPaymentId, reconciledAt);

      expect(result.reconciled_at).toEqual(reconciledAt);
      expect(mockUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          reconciled_at: reconciledAt.toISOString(),
        })
      );
    });
  });

  describe('createAuditLog', () => {
    it('should create audit log entry', async () => {
      const auditLogData = {
        payment_id: mockPaymentId,
        previous_status: PaymentStatus.INITIATED,
        new_status: PaymentStatus.PENDING,
        changed_by: 'system' as const,
        reason: 'Payment status updated',
        metadata: { source: 'webhook' },
      };

      const mockResponse = {
        audit_log_id: 'audit-123',
        ...auditLogData,
        changed_at: new Date().toISOString(),
      };

      const mockChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockResponse, error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.createAuditLog(auditLogData);

      expect(result.audit_log_id).toBe('audit-123');
      expect(result.payment_id).toBe(mockPaymentId);
      expect(mockChain.insert).toHaveBeenCalled();
    });

    it('should throw error if insert fails', async () => {
      const auditLogData = {
        payment_id: mockPaymentId,
        previous_status: PaymentStatus.INITIATED,
        new_status: PaymentStatus.PENDING,
        changed_by: 'system' as const,
      };

      const mockChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      await expect(repository.createAuditLog(auditLogData)).rejects.toThrow(
        'Failed to create audit log'
      );
    });
  });

  describe('getAuditHistory', () => {
    it('should retrieve audit history for a payment', async () => {
      const mockAuditLogs = [
        {
          audit_log_id: 'audit-1',
          payment_id: mockPaymentId,
          previous_status: null,
          new_status: PaymentStatus.INITIATED,
          changed_by: 'system',
          changed_at: new Date().toISOString(),
          reason: 'Payment created',
          metadata: null,
        },
        {
          audit_log_id: 'audit-2',
          payment_id: mockPaymentId,
          previous_status: PaymentStatus.INITIATED,
          new_status: PaymentStatus.PENDING,
          changed_by: 'webhook',
          changed_at: new Date().toISOString(),
          reason: 'Payment in progress',
          metadata: null,
        },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockAuditLogs, error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.getAuditHistory(mockPaymentId);

      expect(result).toHaveLength(2);
      expect(result[0].new_status).toBe(PaymentStatus.INITIATED);
      expect(result[1].new_status).toBe(PaymentStatus.PENDING);
      expect(mockChain.order).toHaveBeenCalledWith('changed_at', { ascending: true });
    });
  });

  describe('updateErrorMessage', () => {
    it('should update error message for a payment', async () => {
      const errorMessage = 'Customer cancelled payment';
      const updatedPayment = {
        payment_id: mockPaymentId,
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.FAILED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reconciled_at: null,
        applied_to_credit: false,
        customer_id: null,
        mpesa_checkout_request_id: null,
        mpesa_response_code: '1032',
        error_message: errorMessage,
      };

      const mockChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: updatedPayment, error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.updateErrorMessage(mockPaymentId, errorMessage);

      expect(result.error_message).toBe(errorMessage);
      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          error_message: errorMessage,
        })
      );
    });
  });

  describe('findByStatus', () => {
    it('should find payments with specific statuses', async () => {
      const mockPayments = [
        {
          payment_id: mockPaymentId,
          transaction_id: mockTransactionId,
          store_id: mockStoreId,
          phone_number: '254723456789',
          amount: 50000,
          status: PaymentStatus.COMPLETED,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          reconciled_at: null,
          applied_to_credit: false,
          customer_id: null,
          mpesa_checkout_request_id: 'req-123',
          mpesa_response_code: '0',
          error_message: null,
        },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockPayments, error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.findByStatus(mockStoreId, [PaymentStatus.COMPLETED]);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(PaymentStatus.COMPLETED);
      expect(mockChain.in).toHaveBeenCalledWith('status', [PaymentStatus.COMPLETED]);
    });

    it('should support limit parameter', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      await repository.findByStatus(mockStoreId, [PaymentStatus.INITIATED], 5);

      expect(mockChain.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('Multi-Store Isolation (TASK 11)', () => {
    const storeA = '550e8400-e29b-41d4-a716-446655440000';
    const storeB = '550e8400-e29b-41d4-a716-446655440111';

    it('should prevent store A from viewing store B payments', async () => {
      const paymentDataStoreB = {
        transaction_id: '660e8400-e29b-41d4-a716-446655440222',
        store_id: storeB,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      const mockCountChain = {
        select: jest.fn(),
        eq: jest.fn().mockReturnThis(),
      };

      mockCountChain.select.mockReturnValue({
        eq: mockCountChain.eq,
      });
      mockCountChain.eq.mockResolvedValue({ count: 0, error: null });

      mockSupabase.from
        .mockReturnValueOnce(mockCountChain)
        .mockReturnValueOnce(mockChain);

      // Query store A for payments - should not find store B payments
      const result = await repository.findByStore(storeA, 10, 0);

      // Verify eq was called with store A ID
      expect(mockChain.eq).toHaveBeenCalledWith('store_id', storeA);
      expect(result.payments).toHaveLength(0);
    });

    it('should require store_id when creating payments', async () => {
      const paymentDataNoStore = {
        transaction_id: mockTransactionId,
        store_id: '', // Empty store_id
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      await expect(repository.create(paymentDataNoStore as any)).rejects.toThrow(
        'store_id is required'
      );
    });

    it('should filter payments by store when finding by status', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      await repository.findByStatus(storeA, [PaymentStatus.COMPLETED]);

      // Verify both store_id and status filters were applied
      expect(mockChain.eq).toHaveBeenCalledWith('store_id', storeA);
      expect(mockChain.in).toHaveBeenCalledWith('status', [PaymentStatus.COMPLETED]);
    });

    it('should find orphaned payments only for specific store', async () => {
      const mockPayments = [
        {
          payment_id: mockPaymentId,
          transaction_id: mockTransactionId,
          store_id: storeA,
          phone_number: '254723456789',
          amount: 50000,
          status: PaymentStatus.INITIATED,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          reconciled_at: null,
          applied_to_credit: false,
          customer_id: null,
          mpesa_checkout_request_id: null,
          mpesa_response_code: null,
          error_message: null,
        },
      ];

      const mockPaymentChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockPayments, error: null }),
      };

      const mockTransactionChain = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockPaymentChain)
        .mockReturnValueOnce(mockTransactionChain);

      const result = await repository.findOrphaned(storeA, 10);

      // Verify store_id filter was applied
      expect(mockPaymentChain.eq).toHaveBeenCalledWith('store_id', storeA);
      expect(result).toHaveLength(1);
      expect(result[0].store_id).toBe(storeA);
    });

    it('should maintain store isolation in update operations', async () => {
      const currentPayment = {
        payment_id: mockPaymentId,
        transaction_id: mockTransactionId,
        store_id: storeA,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reconciled_at: null,
        applied_to_credit: false,
        customer_id: null,
        mpesa_checkout_request_id: null,
        mpesa_response_code: null,
        error_message: null,
      };

      const updatedPayment = {
        ...currentPayment,
        status: PaymentStatus.COMPLETED,
        updated_at: new Date().toISOString(),
      };

      const mockFindChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: currentPayment, error: null }),
      };

      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: updatedPayment, error: null }),
      };

      const mockAuditChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            audit_log_id: 'audit-123',
            payment_id: mockPaymentId,
            previous_status: PaymentStatus.INITIATED,
            new_status: PaymentStatus.COMPLETED,
            changed_by: 'system',
            changed_at: new Date().toISOString(),
            reason: null,
            metadata: null,
          },
          error: null,
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockFindChain)
        .mockReturnValueOnce(mockUpdateChain)
        .mockReturnValueOnce(mockAuditChain);

      const result = await repository.updateStatus(mockPaymentId, PaymentStatus.COMPLETED, {
        changedBy: 'system',
      });

      // Verify the updated payment maintains store_id
      expect(result.store_id).toBe(storeA);
    });
  });

  describe('phone number validation', () => {
    it('should accept valid 254XXXXXXXXX format', async () => {
      const paymentData = {
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '254723456789',
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      const mockChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            payment_id: mockPaymentId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            reconciled_at: null,
            ...paymentData,
          },
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockChain);

      const result = await repository.create(paymentData);
      expect(result).toBeDefined();
    });

    it('should reject phone numbers without 254 prefix', async () => {
      const paymentData = {
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '723456789', // No 254 prefix
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      await expect(repository.create(paymentData as any)).rejects.toThrow(
        'phone_number must be in valid format'
      );
    });

    it('should reject phone numbers with invalid length', async () => {
      const paymentData = {
        transaction_id: mockTransactionId,
        store_id: mockStoreId,
        phone_number: '25472345', // Too short
        amount: 50000,
        status: PaymentStatus.INITIATED,
        applied_to_credit: false,
      };

      await expect(repository.create(paymentData as any)).rejects.toThrow(
        'phone_number must be in valid format'
      );
    });
  });
});
