/**
 * M-Pesa Payment Result Component
 * Displays payment success/failure messages
 * Requirements: 11.4, 5.2
 */

'use client';

import React from 'react';
import { PaymentStatus } from './types';

interface MpesaPaymentResultProps {
  status: PaymentStatus;
  errorMessage?: string | null;
  amount?: number;
  receiptNumber?: string;
  onRetry?: () => void;
  onClose?: () => void;
  onSelectAlternative?: () => void;
}

export const MpesaPaymentResult: React.FC<MpesaPaymentResultProps> = ({
  status,
  errorMessage,
  amount,
  receiptNumber,
  onRetry,
  onClose,
  onSelectAlternative,
}) => {
  const isSuccess = status === PaymentStatus.COMPLETED;
  const isFailure =
    status === PaymentStatus.FAILED ||
    status === PaymentStatus.EXPIRED ||
    status === PaymentStatus.CANCELLED;

  const getResultMessage = (): string => {
    switch (status) {
      case PaymentStatus.COMPLETED:
        return 'Payment completed successfully!';
      case PaymentStatus.FAILED:
        return 'Payment failed. Please try again or select another payment method.';
      case PaymentStatus.EXPIRED:
        return 'Payment expired. Customer did not enter PIN in time.';
      case PaymentStatus.CANCELLED:
        return 'Payment cancelled by operator.';
      default:
        return 'Payment processing...';
    }
  };

  return (
    <div className="space-y-4 text-center">
      <div
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
          isSuccess
            ? 'bg-green-100 text-green-700'
            : isFailure
              ? 'bg-red-100 text-red-700'
              : 'bg-muted'
        }`}
      >
        {isSuccess ? '✓' : isFailure ? '✕' : '…'}
      </div>

      <h3 className="text-base font-semibold">{getResultMessage()}</h3>

      <div className="space-y-2 rounded-md bg-muted/50 p-3 text-left text-sm">
        {amount !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">KES {Number(amount).toFixed(2)}</span>
          </div>
        )}
        {receiptNumber && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Receipt</span>
            <span className="font-mono text-xs">{receiptNumber}</span>
          </div>
        )}
        {errorMessage && (
          <p className="rounded bg-red-50 px-2 py-1 text-red-700 dark:bg-red-950/40 dark:text-red-200">
            {errorMessage}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {isSuccess && onClose && (
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
            onClick={onClose}
          >
            Done
          </button>
        )}

        {isFailure && (
          <>
            {onRetry && (
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
                onClick={onRetry}
              >
                Retry Payment
              </button>
            )}
            {onSelectAlternative && (
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
                onClick={onSelectAlternative}
              >
                Select Different Method
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MpesaPaymentResult;
