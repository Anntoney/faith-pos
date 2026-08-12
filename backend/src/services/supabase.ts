import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

export async function getSalesSummary(startDate: Date, endDate: Date) {
  const { data, error } = await supabase
    .from('sales')
    .select('id, total_amount, created_at, customer_id, store_id')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (error) throw error;
  return data;
}

export async function getCreditSummary(startDate: Date, endDate: Date) {
  const { data, error } = await supabase
    .from('customer_payments')
    .select('id, amount, status, created_at, customer_id, store_id')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (error) throw error;
  return data;
}

export async function getStockSummary() {
  const { data, error } = await supabase
    .from('stock')
    .select('id, product_id, quantity, store_id, products(name, code)');

  if (error) throw error;
  return data;
}

export async function getCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, email, phone');

  if (error) throw error;
  return data;
}

export async function getStores() {
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, location');

  if (error) throw error;
  return data;
}
