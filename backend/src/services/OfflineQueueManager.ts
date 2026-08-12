/**
 * Offline Queue Manager
 * Manages payment requests when connectivity is lost
 * Requirements: 8.1, 8.3, 8.4, 8.5, 8.6
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { PaymentService } from './PaymentService';

export class OfflineQueueManager {
  private connectivityTimer: NodeJS.Timeout | null = null;
  private isOnline = true;
  private paymentService: PaymentService | null = null;

  constructor(private supabase: SupabaseClient) {}

  setPaymentService(paymentService: PaymentService): void {
    this.paymentService = paymentService;
  }

  /**
   * Queue a payment for offline processing
   * Requirements: 8.1, 8.6
   */
  async queuePayment(
    transactionId: string,
    phoneNumber: string,
    amount: number,
    storeId: string
  ): Promise<{ queued: boolean; queueId: string }> {
    const { data, error } = await this.supabase
      .from('offline_queue')
      .insert([
        {
          transaction_id: transactionId,
          store_id: storeId,
          phone_number: phoneNumber,
          amount,
          retry_count: 0,
        },
      ])
      .select('queue_entry_id')
      .single();

    if (error) {
      throw new Error(`Failed to queue payment: ${error.message}`);
    }

    return { queued: true, queueId: data.queue_entry_id };
  }

  /**
   * Detect internet connectivity
   * Requirements: 8.1
   */
  async detectConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://sandbox.safaricom.co.ke', {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      this.isOnline = res.ok || res.status < 500;
      return this.isOnline;
    } catch {
      this.isOnline = false;
      return false;
    }
  }

  isCurrentlyOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Process offline queue when connectivity restored
   * Requirements: 8.3, 8.4 — FIFO order
   */
  async processQueue(): Promise<void> {
    if (!this.paymentService) {
      console.warn('OfflineQueueManager: PaymentService not set, skipping processQueue');
      return;
    }

    const online = await this.detectConnectivity();
    if (!online) {
      return;
    }

    const { data: entries, error } = await this.supabase
      .from('offline_queue')
      .select('*')
      .is('processed_at', null)
      .order('queued_at', { ascending: true })
      .limit(50);

    if (error) {
      throw new Error(`Failed to fetch offline queue: ${error.message}`);
    }

    for (const entry of entries || []) {
      try {
        await this.paymentService.initiatePayment(
          entry.transaction_id,
          entry.phone_number,
          entry.amount,
          entry.store_id
        );

        await this.supabase
          .from('offline_queue')
          .update({
            processed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('queue_entry_id', entry.queue_entry_id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.supabase
          .from('offline_queue')
          .update({
            retry_count: (entry.retry_count || 0) + 1,
            last_retry_at: new Date().toISOString(),
            error_message: message,
          })
          .eq('queue_entry_id', entry.queue_entry_id);
      }
    }
  }

  /**
   * Get queue status
   */
  async getQueueStatus(storeId: string): Promise<{
    pending: number;
    processing: number;
    failed: number;
  }> {
    const { data, error } = await this.supabase
      .from('offline_queue')
      .select('queue_entry_id, processed_at, retry_count, error_message')
      .eq('store_id', storeId);

    if (error) {
      throw new Error(`Failed to get queue status: ${error.message}`);
    }

    let pending = 0;
    let failed = 0;

    for (const entry of data || []) {
      if (!entry.processed_at) {
        if ((entry.retry_count || 0) >= 3 && entry.error_message) {
          failed++;
        } else {
          pending++;
        }
      }
    }

    return { pending, processing: 0, failed };
  }

  /**
   * Start periodic connectivity check and queue processing
   */
  startPeriodicProcessing(intervalMs: number = 10000): void {
    if (this.connectivityTimer) {
      return;
    }

    this.connectivityTimer = setInterval(async () => {
      try {
        const wasOffline = !this.isOnline;
        const online = await this.detectConnectivity();
        if (online && wasOffline) {
          console.log('Connectivity restored — processing offline payment queue');
          await this.processQueue();
        }
      } catch (err) {
        console.error(`Offline queue periodic processing error: ${err}`);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic processing
   */
  stopPeriodicProcessing(): void {
    if (this.connectivityTimer) {
      clearInterval(this.connectivityTimer);
      this.connectivityTimer = null;
    }
  }
}
