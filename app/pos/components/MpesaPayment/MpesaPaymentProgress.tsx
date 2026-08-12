/**
 * M-Pesa Payment Progress Component
 * Displays payment status and progress during processing
 * Requirements: 2.5, 11.3
 */

'use client';

import React from 'react';
import { PaymentStatus } from './types';

interface MpesaPaymentProgressProps {
  status: PaymentStatus;
  amount?: number;
  phoneNumber?: string;
  transactionId?: string;
}

export const MpesaPaymentProgress: React.FC<MpesaPaymentProgressProps> = ({
  status,
  amount,
  phoneNumber,
  transactionId,
}) => {
  const getStatusMessage = (status: PaymentStatus): string => {
    switch (status) {
      case PaymentStatus.INITIATED:
        return 'Payment initiated — ask customer to enter M-Pesa PIN';
      case PaymentStatus.PENDING:
        return 'Awaiting confirmation...';
      case PaymentStatus.COMPLETED:
        return 'Payment completed successfully';
      case PaymentStatus.FAILED:
        return 'Payment failed';
      case PaymentStatus.EXPIRED:
        return 'Payment expired';
      case PaymentStatus.CANCELLED:
        return 'Payment cancelled';
      default:
        return 'Processing...';
    }
  };

  const isProcessing =
    status === PaymentStatus.INITIATED || status === PaymentStatus.PENDING;

  return (
    <div className="space-y-4 text-center">
      {isProcessing && (
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
      )}
      <h4 className="text-base font-semibold">{getStatusMessage(status)}</h4>

      <div className="space-y-2 rounded-md bg-muted/50 p-3 text-left text-sm">
        {amount !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">KES {Number(amount).toFixed(2)}</span>
          </div>
        )}
        {phoneNumber && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Phone</span>
            <span className="font-medium">{phoneNumber}</span>
          </div>
        )}
        {transactionId && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Reference</span>
            <span className="truncate font-mono text-xs">{transactionId}</span>
          </div>
        )}
      </div>

      {isProcessing && (
        <p className="text-xs text-muted-foreground">
          Checking status every 5 seconds (times out after 2 minutes)
        </p>
      )}
    </div>
  );
};

export default MpesaPaymentProgress;
