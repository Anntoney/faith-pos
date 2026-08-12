/**
 * Customer Credit Service
 * Manages customer credit balance and transactions
 * Requirements: 9.2, 9.3, 9.4, 9.5
 */

import { SupabaseClient } from '@supabase/supabase-js';

export class CustomerCreditService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Apply payment to customer credit
   * Requirements: 9.2
   */
  async applyPaymentToCredit(
    paymentId: string,
    customerId: string,
    storeId: string,
    amount: number
  ): Promise<void> {
    const credit = await this.getOrCreateCredit(customerId, storeId);
    const newBalance = credit.balance + amount;

    const { error } = await this.supabase
      .from('customer_credit')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
        last_transaction_id: paymentId,
      })
      .eq('credit_id', credit.creditId);

    if (error) {
      throw new Error(`Failed to apply payment to credit: ${error.message}`);
    }

    // Also bump customers.balance (existing POS credit model) if present
    try {
      const { data: customer } = await this.supabase
        .from('customers')
        .select('balance')
        .eq('id', customerId)
        .single();

      if (customer) {
        // amount is cents; customers.balance is major units
        const majorAmount = amount / 100;
        await this.supabase
          .from('customers')
          .update({ balance: Number(customer.balance || 0) - majorAmount })
          .eq('id', customerId);
      }
    } catch (err) {
      console.warn(`Could not update customers.balance for credit apply: ${err}`);
    }
  }

  /**
   * Get customer credit balance
   * Requirements: 9.3
   */
  async getCustomerCredit(
    customerId: string,
    storeId: string
  ): Promise<{ balance: number; creditId: string }> {
    return this.getOrCreateCredit(customerId, storeId);
  }

  /**
   * Deduct credit for purchase
   * Requirements: 9.3, 9.4
   */
  async deductCredit(
    customerId: string,
    storeId: string,
    amount: number
  ): Promise<{ success: boolean; newBalance: number; reason?: string }> {
    const credit = await this.getOrCreateCredit(customerId, storeId);

    if (credit.balance < amount) {
      return {
        success: false,
        newBalance: credit.balance,
        reason: 'Insufficient credit balance',
      };
    }

    const newBalance = credit.balance - amount;
    const { error } = await this.supabase
      .from('customer_credit')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('credit_id', credit.creditId);

    if (error) {
      throw new Error(`Failed to deduct credit: ${error.message}`);
    }

    return { success: true, newBalance };
  }

  /**
   * Get credit transaction history (from payment audit of credit applications)
   */
  async getCreditHistory(
    customerId: string,
    storeId: string,
    limit: number = 10
  ): Promise<Array<Record<string, unknown>>> {
    const { data, error } = await this.supabase
      .from('customer_credit')
      .select('*')
      .eq('customer_id', customerId)
      .eq('store_id', storeId)
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get credit history: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Refund credit (for cancelled purchases)
   */
  async refundCredit(
    customerId: string,
    storeId: string,
    amount: number,
    reason: string
  ): Promise<void> {
    const credit = await this.getOrCreateCredit(customerId, storeId);
    const newBalance = credit.balance + amount;

    const { error } = await this.supabase
      .from('customer_credit')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('credit_id', credit.creditId);

    if (error) {
      throw new Error(`Failed to refund credit: ${error.message}`);
    }

    console.log(`Refunded credit for ${customerId}: +${amount} (${reason})`);
  }

  private async getOrCreateCredit(
    customerId: string,
    storeId: string
  ): Promise<{ balance: number; creditId: string }> {
    const { data, error } = await this.supabase
      .from('customer_credit')
      .select('credit_id, balance')
      .eq('customer_id', customerId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get customer credit: ${error.message}`);
    }

    if (data) {
      return { balance: data.balance || 0, creditId: data.credit_id };
    }

    const { data: created, error: createError } = await this.supabase
      .from('customer_credit')
      .insert([
        {
          customer_id: customerId,
          store_id: storeId,
          balance: 0,
        },
      ])
      .select('credit_id, balance')
      .single();

    if (createError) {
      throw new Error(`Failed to create customer credit: ${createError.message}`);
    }

    return { balance: created.balance || 0, creditId: created.credit_id };
  }
}
