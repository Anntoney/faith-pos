export const config = {
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER!,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
  supabase: {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
  ownerPhone: process.env.OWNER_WHATSAPP_NUMBER!,
  mpesa: {
    consumerKey: process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
    businessShortCode: process.env.MPESA_BUSINESS_SHORT_CODE || '',
    passkey: process.env.MPESA_PASSKEY || '',
    callbackUrl: process.env.MPESA_CALLBACK_URL || 'http://localhost:3001/api/webhooks/mpesa',
    environment: (process.env.MPESA_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
    defaultStoreId: process.env.MPESA_DEFAULT_STORE_ID || 'default',
    skipWebhookSignature:
      process.env.MPESA_SKIP_WEBHOOK_SIGNATURE === 'true' ||
      (process.env.MPESA_ENVIRONMENT || 'sandbox') === 'sandbox',
  },
  payment: {
    pollingIntervalMs: parseInt(process.env.PAYMENT_POLLING_INTERVAL || '5000', 10),
    timeoutMs: parseInt(process.env.PAYMENT_TIMEOUT || '120000', 10),
  },
};
