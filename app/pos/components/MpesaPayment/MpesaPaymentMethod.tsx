/**
 * M-Pesa Payment Method Component
 * Displays M-Pesa payment option and phone number input
 * Requirements: 11.1, 11.2
 */

'use client';

import React, { useState } from 'react';

interface MpesaPaymentMethodProps {
  onPhoneSubmit: (phoneNumber: string, applyToCredit?: boolean) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
}

export const MpesaPaymentMethod: React.FC<MpesaPaymentMethodProps> = ({
  onPhoneSubmit,
  isLoading = false,
  disabled = false,
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [applyToCredit, setApplyToCredit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validatePhoneNumber = (phone: string): boolean => {
    const phoneRegex = /^(\+)?254\d{9,10}$/;
    return phoneRegex.test(phone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validatePhoneNumber(phoneNumber)) {
      setError('Invalid phone number format. Use 254XXXXXXXXX');
      return;
    }

    try {
      await onPhoneSubmit(phoneNumber, applyToCredit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment initiation failed');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter the customer&apos;s M-Pesa number to send an STK push prompt.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-medium">
            M-Pesa Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            placeholder="2547XXXXXXXX"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            disabled={isLoading || disabled}
            required
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          />
          <p className="text-xs text-muted-foreground">Format: 254XXXXXXXXX</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="apply-credit"
            type="checkbox"
            checked={applyToCredit}
            onChange={(e) => setApplyToCredit(e.target.checked)}
            disabled={isLoading || disabled}
            className="h-4 w-4"
          />
          <label htmlFor="apply-credit" className="text-sm">
            Apply to customer credit
          </label>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || disabled || !phoneNumber}
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isLoading ? 'Sending STK Push...' : 'Pay with M-Pesa'}
        </button>
      </form>
    </div>
  );
};

export default MpesaPaymentMethod;
