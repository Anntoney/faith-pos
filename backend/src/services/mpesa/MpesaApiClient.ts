/**
 * M-Pesa API Client
 * Abstracts all communication with M-Pesa REST APIs
 * Requirements: 1.2, 1.4, 10.3
 */

import * as crypto from 'crypto';
import {
  MpesaInitiateResponse,
  MpesaStatusResponse,
  MpesaWebhookPayload,
} from '../../types/payment';

/**
 * MpesaApiClient handles all M-Pesa API interactions
 * Manages authentication, request/response handling, and error mapping
 */
export class MpesaApiClient {
  private apiBaseUrl: string;
  private consumerKey: string;
  private consumerSecret: string;
  private businessShortCode: string;
  private passkey: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(
    consumerKey: string,
    consumerSecret: string,
    businessShortCode: string,
    passkey: string,
    environment: 'sandbox' | 'production' = 'sandbox'
  ) {
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
    this.businessShortCode = businessShortCode;
    this.passkey = passkey;

    // Set appropriate M-Pesa API base URL based on environment
    this.apiBaseUrl =
      environment === 'sandbox'
        ? 'https://sandbox.safaricom.co.ke'
        : 'https://api.safaricom.co.ke';
  }

  /**
   * Get OAuth2 access token from M-Pesa
   * Required for all API calls
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    
    const response = await this.withRetry(async () => {
      const res = await fetch(`${this.apiBaseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });

      if (!res.ok) {
        throw new Error(`OAuth token request failed: ${res.status} ${res.statusText}`);
      }

      return res;
    });

    const data = (await response.json()) as { access_token: string; expires_in: number };
    
    this.accessToken = data.access_token;
    this.tokenExpiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000); // Expire 60s early
    
    return this.accessToken;
  }

  /**
   * Initiate STK Push payment request
   * Requirements: 1.2 - Initiates M-Pesa payment request via M-Pesa API
   * Requirements: 1.4 - Handles error responses appropriately
   */
  async initiatePayment(
    phoneNumber: string,
    amount: number,
    transactionId: string,
    callbackUrl: string
  ): Promise<MpesaInitiateResponse> {
    const token = await this.getAccessToken();
    
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(
      `${this.businessShortCode}${this.passkey}${timestamp}`
    ).toString('base64');

    const payload = {
      BusinessShortCode: this.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.floor(amount / 100), // Convert cents to KES
      PartyA: phoneNumber,
      PartyB: this.businessShortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      AccountReference: transactionId,
      TransactionDesc: `Payment for transaction ${transactionId}`,
    };

    const response = await this.withRetry(async () => {
      const res = await fetch(`${this.apiBaseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok && res.status >= 400) {
        const error = await res.json();
        throw new Error(
          `Payment initiation failed: ${res.status} - ${JSON.stringify(error)}`
        );
      }

      return res;
    });

    const data = (await response.json()) as MpesaInitiateResponse;
    return data;
  }

  /**
   * Query payment status via M-Pesa API
   * Requirements: 2.1 - Used for polling payment status
   */
  async queryPaymentStatus(
    merchantRequestId: string,
    checkoutRequestId: string
  ): Promise<MpesaStatusResponse> {
    const token = await this.getAccessToken();
    
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(
      `${this.businessShortCode}${this.passkey}${timestamp}`
    ).toString('base64');

    const payload = {
      BusinessShortCode: this.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const response = await this.withRetry(async () => {
      const res = await fetch(`${this.apiBaseUrl}/mpesa/stkpushquery/v1/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Status query failed: ${res.status}`);
      }

      return res;
    });

    const data = (await response.json()) as MpesaStatusResponse;
    return data;
  }

  /**
   * Validate webhook signature for authenticity
   * Requirements: 3.1 - Validates webhook signature
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    try {
      // M-Pesa uses HMAC-SHA256 with the business short code as the secret
      const computedSignature = crypto
        .createHmac('sha256', this.businessShortCode)
        .update(payload)
        .digest('base64');

      return computedSignature === signature;
    } catch {
      return false;
    }
  }

  /**
   * Map M-Pesa error codes to human-readable messages
   * Requirements: 1.4 - Maps error codes to user-friendly messages
   */
  mapErrorCodeToMessage(errorCode: string | number): string {
    const errorMap: Record<string, string> = {
      '0': 'Payment successful',
      '1001': 'Incorrect M-Pesa credentials. Please contact support.',
      '1002': 'Payment timed out. Please try again.',
      '1032': 'Payment cancelled by customer.',
      '1037': 'Duplicate transaction. Please use a different reference.',
      '500': 'M-Pesa service temporarily unavailable. Please try again.',
      '9999': 'M-Pesa service error. Please try again.',
    };

    return errorMap[String(errorCode)] || `Payment failed with code ${errorCode}. Please try again.`;
  }

  /**
   * Implement exponential backoff for retry logic
   * Max 3 retries with exponential delays
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Parse M-Pesa webhook payload
   */
  parseWebhookPayload(payload: unknown): MpesaWebhookPayload {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid webhook payload');
    }

    const data = payload as Record<string, unknown>;
    
    if (!data.Body || typeof data.Body !== 'object') {
      throw new Error('Missing webhook Body');
    }

    const body = data.Body as Record<string, unknown>;
    
    if (!body.stkCallback || typeof body.stkCallback !== 'object') {
      throw new Error('Missing stkCallback in webhook');
    }

    return payload as MpesaWebhookPayload;
  }
}
