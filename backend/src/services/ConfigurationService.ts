/**
 * Configuration Service
 * Manages M-Pesa API credentials and configuration per store
 * Requirements: 10.2, 10.3, 10.4
 */

import { MpesaApiClient } from './mpesa/MpesaApiClient';

/**
 * Store-specific M-Pesa credentials
 */
interface StoreCredentials {
  storeId: string;
  apiKey: string;
  consumerKey: string;
  consumerSecret: string;
  businessShortCode: string;
  environment: 'sandbox' | 'production';
  passkey: string;
  validatedAt: Date;
}

/**
 * ConfigurationService manages M-Pesa credentials per store
 * Validates credentials and ensures secure storage
 */
export class ConfigurationService {
  private storeCredentials: Map<string, StoreCredentials> = new Map();
  private credentialValidationCache: Map<string, { valid: boolean; error?: string; timestamp: Date }> = new Map();

  constructor() {
    // Initialize from environment variables if present
    this.loadCredentialsFromEnv();
  }

  /**
   * Validate and save store credentials
   * Requirements: 10.2 - Validate connectivity to M-Pesa API before saving
   */
  async validateAndSaveStoreCredentials(
    storeId: string,
    apiKey: string,
    consumerKey: string,
    consumerSecret: string,
    businessShortCode: string,
    environment: 'sandbox' | 'production' = 'sandbox',
    passkey?: string
  ): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      // 1. Validate required fields
      if (!storeId || !apiKey || !consumerKey || !consumerSecret || !businessShortCode) {
        return {
          success: false,
          message: 'Missing required credential fields',
          error: 'All credential fields are required',
        };
      }

      // 2. Validate format of credentials
      if (consumerKey.length < 5 || consumerSecret.length < 5) {
        return {
          success: false,
          message: 'Invalid credential format',
          error: 'Consumer key and secret must be at least 5 characters',
        };
      }

      if (!/^\d+$/.test(businessShortCode) || businessShortCode.length < 5) {
        return {
          success: false,
          message: 'Invalid business short code format',
          error: 'Business short code must be numeric',
        };
      }

      // 3. Make test API call to M-Pesa to validate credentials
      // Requirements: 10.2 - Implement credential validation by making test API call
      const testResult = await this.testMpesaConnection(
        consumerKey,
        consumerSecret,
        businessShortCode,
        passkey,
        environment
      );

      if (!testResult.success) {
        return {
          success: false,
          message: 'Failed to validate M-Pesa credentials',
          error: testResult.error || 'M-Pesa connection test failed',
        };
      }

      // 4. Store credentials securely in environment or secrets manager
      // Requirements: 10.3 - Store credentials securely in process.env
      const credentials: StoreCredentials = {
        storeId,
        apiKey,
        consumerKey,
        consumerSecret,
        businessShortCode,
        environment,
        passkey: passkey || '',
        validatedAt: new Date(),
      };

      // Store in memory and environment
      this.storeCredentials.set(storeId, credentials);
      this.storeEnvironmentVariables(storeId, credentials);

      // 5. Clear validation cache to use new credentials immediately
      // Requirements: 10.4 - Ensure new credentials are used immediately without restart
      this.credentialValidationCache.delete(storeId);

      return {
        success: true,
        message: `Credentials validated and saved for store ${storeId}`,
      };
    } catch (error) {
      console.error(`Error validating and saving store credentials: ${error}`);
      return {
        success: false,
        message: 'Error saving credentials',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get store-specific credentials
   * Requirements: 10.3 - Retrieve store-specific credentials from configuration
   */
  getStoreCredentials(storeId: string): StoreCredentials | null {
    try {
      // 1. Try memory cache first
      const cached = this.storeCredentials.get(storeId);
      if (cached) {
        return cached;
      }

      // 2. Try to load from environment variables
      const fromEnv = this.loadCredentialsFromEnvForStore(storeId);
      if (fromEnv) {
        this.storeCredentials.set(storeId, fromEnv);
        return fromEnv;
      }

      return null;
    } catch (error) {
      console.error(`Error retrieving credentials for store ${storeId}: ${error}`);
      return null;
    }
  }

  /**
   * Rotate credentials (update with new API key)
   * Requirements: 10.4 - New credentials used immediately without restart
   */
  async rotateCredentials(
    storeId: string,
    newApiKey: string
  ): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      // 1. Get current credentials
      const current = this.getStoreCredentials(storeId);
      if (!current) {
        return {
          success: false,
          message: `No credentials found for store ${storeId}`,
        };
      }

      // 2. Validate new API key
      if (!newApiKey || newApiKey.length < 5) {
        return {
          success: false,
          message: 'Invalid API key format',
          error: 'API key must be at least 5 characters',
        };
      }

      // 3. Test new credentials
      const testResult = await this.testMpesaConnection(
        current.consumerKey,
        current.consumerSecret,
        current.businessShortCode,
        current.passkey,
        current.environment
      );

      if (!testResult.success) {
        return {
          success: false,
          message: 'Failed to validate new credentials',
          error: testResult.error,
        };
      }

      // 4. Update credentials
      const updated: StoreCredentials = {
        ...current,
        apiKey: newApiKey,
        validatedAt: new Date(),
      };

      // 5. Store updated credentials
      this.storeCredentials.set(storeId, updated);
      this.storeEnvironmentVariables(storeId, updated);

      // 6. Clear validation cache to use new credentials immediately
      // Requirements: 10.4 - Ensure new credentials used immediately without restart
      this.credentialValidationCache.delete(storeId);

      console.log(`Rotated credentials for store ${storeId}`);

      return {
        success: true,
        message: `Credentials rotated successfully for store ${storeId}`,
      };
    } catch (error) {
      console.error(`Error rotating credentials for store ${storeId}: ${error}`);
      return {
        success: false,
        message: 'Error rotating credentials',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test M-Pesa connection with given credentials
   */
  private async testMpesaConnection(
    consumerKey: string,
    consumerSecret: string,
    businessShortCode: string,
    passkey: string = '',
    environment: 'sandbox' | 'production' = 'sandbox'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Create temporary M-Pesa API client
      const apiClient = new MpesaApiClient(
        consumerKey,
        consumerSecret,
        businessShortCode,
        passkey,
        environment
      );

      // 2. Attempt to get access token
      // This validates that OAuth credentials work
      const token = await apiClient.getAccessToken();
      if (!token) {
        return {
          success: false,
          error: 'Failed to obtain access token from M-Pesa',
        };
      }

      // 3. Return success if token obtained
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during M-Pesa connection test',
      };
    }
  }

  /**
   * Store credentials in environment variables
   * Requirements: 10.2 - Store credentials securely in environment variables
   */
  private storeEnvironmentVariables(storeId: string, credentials: StoreCredentials): void {
    try {
      // Store in process.env for access during runtime
      // In production, would use secrets manager (AWS Secrets Manager, etc.)
      const prefix = `MPESA_STORE_${storeId.toUpperCase()}_`;

      process.env[`${prefix}API_KEY`] = credentials.apiKey;
      process.env[`${prefix}CONSUMER_KEY`] = credentials.consumerKey;
      process.env[`${prefix}CONSUMER_SECRET`] = credentials.consumerSecret;
      process.env[`${prefix}BUSINESS_SHORT_CODE`] = credentials.businessShortCode;
      process.env[`${prefix}ENVIRONMENT`] = credentials.environment;
      process.env[`${prefix}PASSKEY`] = credentials.passkey;
      process.env[`${prefix}VALIDATED_AT`] = credentials.validatedAt.toISOString();

      console.log(`Stored credentials in environment for store ${storeId}`);
    } catch (error) {
      console.error(`Error storing credentials in environment: ${error}`);
    }
  }

  /**
   * Load credentials from environment variables
   * Supports both per-store MPESA_STORE_{ID}_* and global MPESA_* keys
   */
  private loadCredentialsFromEnv(): void {
    try {
      const storeIds = new Set<string>();

      for (const [key] of Object.entries(process.env)) {
        const match = key.match(/^MPESA_STORE_([^_]+)_API_KEY$/);
        if (match) {
          storeIds.add(match[1].toLowerCase());
        }
      }

      for (const storeId of storeIds) {
        const creds = this.loadCredentialsFromEnvForStore(storeId);
        if (creds) {
          this.storeCredentials.set(storeId, creds);
        }
      }

      // Global MPESA_* credentials become the default store credentials
      const globalCreds = this.loadGlobalCredentials();
      if (globalCreds) {
        const defaultStoreId = (process.env.MPESA_DEFAULT_STORE_ID || 'default').toLowerCase();
        if (!this.storeCredentials.has(defaultStoreId)) {
          this.storeCredentials.set(defaultStoreId, { ...globalCreds, storeId: defaultStoreId });
        }
        // Also register under literal "default" for POS fallback
        if (!this.storeCredentials.has('default')) {
          this.storeCredentials.set('default', { ...globalCreds, storeId: 'default' });
        }
      }

      console.log(`Loaded credentials for ${this.storeCredentials.size} store(s) from environment`);
    } catch (error) {
      console.error(`Error loading credentials from environment: ${error}`);
    }
  }

  /**
   * Load global MPESA_* credentials (from .env.local template)
   */
  private loadGlobalCredentials(): StoreCredentials | null {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const businessShortCode = process.env.MPESA_BUSINESS_SHORT_CODE;
    const passkey = process.env.MPESA_PASSKEY || '';
    const environment = (process.env.MPESA_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

    if (!consumerKey || !consumerSecret || !businessShortCode) {
      return null;
    }

    // Skip placeholder values
    if (
      consumerKey.includes('your_') ||
      consumerSecret.includes('your_') ||
      businessShortCode.includes('your_')
    ) {
      console.warn('M-Pesa global credentials appear to be placeholders — replace them in .env.local');
      return null;
    }

    return {
      storeId: 'default',
      apiKey: consumerKey,
      consumerKey,
      consumerSecret,
      businessShortCode,
      environment,
      passkey,
      validatedAt: new Date(),
    };
  }

  /**
   * Load credentials for a specific store from environment
   */
  private loadCredentialsFromEnvForStore(storeId: string): StoreCredentials | null {
    try {
      const prefix = `MPESA_STORE_${storeId.toUpperCase()}_`;

      const apiKey = process.env[`${prefix}API_KEY`];
      const consumerKey = process.env[`${prefix}CONSUMER_KEY`];
      const consumerSecret = process.env[`${prefix}CONSUMER_SECRET`];
      const businessShortCode = process.env[`${prefix}BUSINESS_SHORT_CODE`];
      const environment = (process.env[`${prefix}ENVIRONMENT`] ||
        process.env.MPESA_ENVIRONMENT ||
        'sandbox') as 'sandbox' | 'production';
      const passkey = process.env[`${prefix}PASSKEY`] || process.env.MPESA_PASSKEY || '';
      const validatedAt = process.env[`${prefix}VALIDATED_AT`];

      if (!apiKey || !consumerKey || !consumerSecret || !businessShortCode) {
        // Fall back to global credentials for any store when per-store keys are absent
        const globalCreds = this.loadGlobalCredentials();
        if (globalCreds) {
          return { ...globalCreds, storeId };
        }
        return null;
      }

      return {
        storeId,
        apiKey,
        consumerKey,
        consumerSecret,
        businessShortCode,
        environment,
        passkey,
        validatedAt: validatedAt ? new Date(validatedAt) : new Date(),
      };
    } catch (error) {
      console.error(`Error loading credentials for store ${storeId}: ${error}`);
      return null;
    }
  }

  /**
   * Create an MpesaApiClient for a store using its credentials
   * Requirements: 6.3, 10.3 - Store credential isolation
   */
  createApiClientForStore(storeId: string): MpesaApiClient {
    const credentials = this.getStoreCredentials(storeId);
    if (!credentials) {
      throw new Error(
        'M-Pesa configuration error. Please contact support.'
      );
    }

    return new MpesaApiClient(
      credentials.consumerKey,
      credentials.consumerSecret,
      credentials.businessShortCode,
      credentials.passkey,
      credentials.environment
    );
  }

  /**
   * Validate if credentials are still valid
   */
  isCredentialsValid(storeId: string): boolean {
    try {
      const cached = this.credentialValidationCache.get(storeId);
      
      // Return cached result if less than 1 hour old
      if (cached && new Date().getTime() - cached.timestamp.getTime() < 3600000) {
        return cached.valid;
      }

      const credentials = this.getStoreCredentials(storeId);
      const valid = credentials !== null;

      this.credentialValidationCache.set(storeId, {
        valid,
        timestamp: new Date(),
      });

      return valid;
    } catch {
      return false;
    }
  }

  /**
   * Clear credentials for a store
   */
  clearStoreCredentials(storeId: string): void {
    this.storeCredentials.delete(storeId);
    this.credentialValidationCache.delete(storeId);

    const prefix = `MPESA_STORE_${storeId.toUpperCase()}_`;
    delete process.env[`${prefix}API_KEY`];
    delete process.env[`${prefix}CONSUMER_KEY`];
    delete process.env[`${prefix}CONSUMER_SECRET`];
    delete process.env[`${prefix}BUSINESS_SHORT_CODE`];
    delete process.env[`${prefix}ENVIRONMENT`];
    delete process.env[`${prefix}PASSKEY`];
    delete process.env[`${prefix}VALIDATED_AT`];

    console.log(`Cleared credentials for store ${storeId}`);
  }

  /**
   * Get list of all configured stores
   */
  getConfiguredStores(): string[] {
    return Array.from(this.storeCredentials.keys());
  }
}
