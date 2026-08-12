/**
 * Payment stack bootstrap
 * Wires M-Pesa client, repositories, and services for the Express server
 */

import { Express } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env';
import { MpesaApiClient } from '../services/mpesa/MpesaApiClient';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { ConfigurationService } from '../services/ConfigurationService';
import { ReconciliationService } from '../services/ReconciliationService';
import { CustomerCreditService } from '../services/CustomerCreditService';
import { OfflineQueueManager } from '../services/OfflineQueueManager';
import { PaymentService } from '../services/PaymentService';
import { WebhookHandler } from '../handlers/WebhookHandler';
import { setupPaymentRoutes } from '../routes/payments';

export function bootstrapPaymentStack(app: Express): {
  paymentService: PaymentService;
  offlineQueueManager: OfflineQueueManager;
  configurationService: ConfigurationService;
} {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    console.warn(
      'Supabase credentials missing — payment persistence will fail until SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set'
    );
  }

  const supabase = createClient(
    config.supabase.url || 'http://localhost',
    config.supabase.serviceRoleKey || 'missing-key'
  );

  const configurationService = new ConfigurationService();

  const defaultCreds =
    configurationService.getStoreCredentials(config.mpesa.defaultStoreId) ||
    configurationService.getStoreCredentials('default');

  const mpesaApiClient = new MpesaApiClient(
    defaultCreds?.consumerKey || config.mpesa.consumerKey || 'missing',
    defaultCreds?.consumerSecret || config.mpesa.consumerSecret || 'missing',
    defaultCreds?.businessShortCode || config.mpesa.businessShortCode || '0',
    defaultCreds?.passkey || config.mpesa.passkey || '',
    defaultCreds?.environment || config.mpesa.environment
  );

  if (!defaultCreds && (!config.mpesa.consumerKey || config.mpesa.consumerKey.includes('your_'))) {
    console.warn(
      'M-Pesa credentials not configured. Set MPESA_CONSUMER_KEY / SECRET / SHORT_CODE / PASSKEY in .env.local before testing STK push.'
    );
  } else {
    console.log(
      `M-Pesa client ready (${defaultCreds?.environment || config.mpesa.environment}) shortcode=${defaultCreds?.businessShortCode || config.mpesa.businessShortCode}`
    );
  }

  const paymentRepository = new PaymentRepository(supabase);
  const transactionRepository = new TransactionRepository(supabase);
  const customerCreditService = new CustomerCreditService(supabase);
  const offlineQueueManager = new OfflineQueueManager(supabase);

  const reconciliationService = new ReconciliationService(
    paymentRepository,
    transactionRepository,
    customerCreditService
  );

  const paymentService = new PaymentService(
    mpesaApiClient,
    paymentRepository,
    reconciliationService,
    configurationService,
    transactionRepository,
    customerCreditService,
    offlineQueueManager
  );

  offlineQueueManager.setPaymentService(paymentService);

  const webhookHandler = new WebhookHandler(
    mpesaApiClient,
    paymentRepository,
    reconciliationService
  );

  setupPaymentRoutes(
    app,
    paymentService,
    webhookHandler,
    offlineQueueManager,
    configurationService
  );

  // Start offline connectivity watcher
  if (process.env.OFFLINE_MODE_ENABLED !== 'false') {
    const interval = parseInt(process.env.CONNECTIVITY_CHECK_INTERVAL || '10000', 10);
    offlineQueueManager.startPeriodicProcessing(interval);
  }

  return { paymentService, offlineQueueManager, configurationService };
}
