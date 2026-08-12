/**
 * Reconciliation Service
 * Matches payments with sales transactions and maintains financial accuracy
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.5
 */

import { PaymentStatus, Payment } from '../types/payment';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { TransactionRepository, SaleTransaction } from '../repositories/TransactionRepository';
import { CustomerCreditService } from './CustomerCreditService';

export class ReconciliationService {
  private paymentRepository: PaymentRepository;
  private transactionRepository?: TransactionRepository;
  private customerCreditService?: CustomerCreditService;

  constructor(
    paymentRepository: PaymentRepository,
    transactionRepository?: TransactionRepository,
    customerCreditService?: CustomerCreditService
  ) {
    this.paymentRepository = paymentRepository;
    this.transactionRepository = transactionRepository;
    this.customerCreditService = customerCreditService;
  }

  /**
   * Reconcile a payment with its transaction
   * Requirements: 4.1, 4.2, 6.5
   */
  async reconcilePayment(paymentId: string): Promise<{ success: boolean; reason?: string }> {
    try {
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return { success: false, reason: `Payment ${paymentId} not found` };
      }

      // Credit-only payments may not have a matching sale yet
      if (payment.applied_to_credit && payment.customer_id) {
        if (this.customerCreditService) {
          await this.customerCreditService.applyPaymentToCredit(
            paymentId,
            payment.customer_id,
            payment.store_id,
            payment.amount
          );
        }
        await this.paymentRepository.updateReconciled(paymentId, new Date());
        await this.createAuditLogEntry(paymentId, 'CREDIT_RECONCILIATION_SUCCESS', {
          customer_id: payment.customer_id,
          amount: payment.amount,
          store_id: payment.store_id,
        });
        return { success: true };
      }

      const transaction = await this.findTransaction(payment.transaction_id, payment.store_id);
      if (!transaction) {
        // POS flow creates the sale AFTER STK success, so missing sale is expected mid-checkout.
        // Mark payment reconciled; orphan review uses findOrphaned() separately.
        await this.paymentRepository.updateReconciled(paymentId, new Date());
        await this.createAuditLogEntry(paymentId, 'RECONCILIATION_PENDING_SALE', {
          transaction_id: payment.transaction_id,
          note: 'No sale row yet — payment confirmed via M-Pesa',
        });
        return { success: true, reason: 'Payment completed; sale pending creation' };
      }

      // Requirements: 6.5 - store isolation
      if (payment.store_id !== transaction.store_id) {
        console.error(
          `Store ID mismatch: payment store ${payment.store_id} vs transaction store ${transaction.store_id}`
        );
        return { success: false, reason: 'Store ID mismatch between payment and transaction' };
      }

      // Amount match within cents precision
      if (payment.amount !== transaction.total) {
        console.error(
          `Amount mismatch: payment ${payment.amount} vs transaction ${transaction.total}`
        );
        return {
          success: false,
          reason: `Amount mismatch: ${payment.amount} != ${transaction.total}`,
        };
      }

      const reconciledAt = new Date();

      await this.paymentRepository.updateReconciled(paymentId, reconciledAt);

      if (this.transactionRepository) {
        await this.transactionRepository.markPaid(payment.transaction_id, paymentId, reconciledAt);
      }

      await this.createAuditLogEntry(paymentId, 'RECONCILIATION_SUCCESS', {
        transaction_id: payment.transaction_id,
        amount: payment.amount,
        reconciled_at: reconciledAt.toISOString(),
        store_id: payment.store_id,
      });

      console.log(
        `Successfully reconciled payment ${paymentId} with transaction ${payment.transaction_id}`
      );

      return { success: true };
    } catch (error) {
      console.error(`Error reconciling payment ${paymentId}: ${error}`);
      return { success: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Handle orphaned payment
   * Requirements: 4.3
   */
  async handleOrphanedPayment(paymentId: string): Promise<void> {
    try {
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return;
      }

      // Keep COMPLETED status but flag via error_message for manual review
      await this.paymentRepository.updateErrorMessage(
        paymentId,
        'Payment received but no matching transaction found. Please review manually.'
      );

      await this.createAuditLogEntry(paymentId, 'ORPHANED_PAYMENT', {
        reason: 'No matching transaction found',
        payment_id: paymentId,
        store_id: payment.store_id,
        phone_number: payment.phone_number,
        amount: payment.amount,
        flagged_at: new Date().toISOString(),
      });

      console.log(`Orphaned payment flagged for manual review: ${paymentId}`);
    } catch (error) {
      console.error(`Error handling orphaned payment ${paymentId}: ${error}`);
    }
  }

  /**
   * Handle transaction cancellation
   * Requirements: 4.4
   */
  async handleTransactionCancellation(transactionId: string): Promise<void> {
    try {
      const payments = await this.paymentRepository.findAllByTransaction(transactionId);

      for (const payment of payments) {
        if (
          payment.status === PaymentStatus.COMPLETED ||
          payment.status === PaymentStatus.CANCELLED
        ) {
          continue;
        }

        await this.paymentRepository.updateStatus(payment.payment_id, PaymentStatus.CANCELLED, {
          changedBy: 'system',
          reason: 'Transaction was cancelled - releasing payment hold',
        });

        await this.createAuditLogEntry(payment.payment_id, 'TRANSACTION_CANCELLED', {
          transaction_id: transactionId,
          cancelled_at: new Date().toISOString(),
        });

        console.log(`Released payment ${payment.payment_id} due to transaction cancellation`);
      }

      if (this.transactionRepository) {
        await this.transactionRepository.cancelTransaction(transactionId);
      }
    } catch (error) {
      console.error(`Error handling transaction cancellation: ${error}`);
    }
  }

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

    await this.createAuditLogEntry(paymentId, 'CREDIT_APPLIED', {
      customer_id: customerId,
      store_id: storeId,
      amount_added: payment.amount,
      applied_at: new Date().toISOString(),
    });
  }

  async generateReconciliationReport(
    storeId: string,
    dateRange: { startDate: Date; endDate: Date }
  ): Promise<Record<string, unknown>> {
    const { payments } = await this.paymentRepository.findByStore(storeId, 1000, 0);
    const filtered = payments.filter(
      p => p.created_at >= dateRange.startDate && p.created_at <= dateRange.endDate
    );

    let totalAmount = 0;
    let reconciledCount = 0;
    let orphanedCount = 0;

    for (const payment of filtered) {
      totalAmount += payment.amount;
      if (payment.reconciled_at) {
        reconciledCount++;
      } else if (payment.error_message?.includes('no matching transaction')) {
        orphanedCount++;
      }
    }

    return {
      store_id: storeId,
      period: {
        start: dateRange.startDate.toISOString(),
        end: dateRange.endDate.toISOString(),
      },
      summary: {
        total_payments: filtered.length,
        total_amount: totalAmount,
        reconciled_count: reconciledCount,
        orphaned_count: orphanedCount,
        reconciliation_rate:
          filtered.length > 0
            ? ((reconciledCount / filtered.length) * 100).toFixed(2) + '%'
            : 'N/A',
      },
    };
  }

  private async findTransaction(
    transactionId: string,
    storeId: string
  ): Promise<SaleTransaction | null> {
    if (!this.transactionRepository) {
      return null;
    }
    return this.transactionRepository.findById(transactionId, storeId);
  }

  private async createAuditLogEntry(
    paymentId: string,
    eventType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.paymentRepository.createAuditLog({
        payment_id: paymentId,
        previous_status: null,
        new_status: PaymentStatus.COMPLETED,
        changed_by: 'system',
        reason: eventType,
        metadata: data,
      });
    } catch (error) {
      console.error(`Error creating audit log entry: ${error}`);
    }
  }
}
