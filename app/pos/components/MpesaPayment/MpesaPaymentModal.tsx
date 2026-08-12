/**
 * M-Pesa Payment Modal Component
 * Wrapper modal for the complete payment flow
 * Requirements: 11.1, 11.3, 11.4
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PaymentStatus } from './types';
import { MpesaPaymentMethod } from './MpesaPaymentMethod';
import { MpesaPaymentProgress } from './MpesaPaymentProgress';
import { MpesaPaymentResult } from './MpesaPaymentResult';

interface MpesaPaymentModalProps {
  isOpen: boolean;
  transactionId: string;
  amount: number; // Major currency units (KES) — converted to cents for API
  storeId: string;
  customerId?: string | null;
  onClose: () => void;
  onSuccess: (paymentData: Record<string, unknown>) => void;
  onError?: (error: string) => void;
  onSelectAlternative?: () => void;
}

type PaymentPhase = 'input' | 'processing' | 'result';

export const MpesaPaymentModal: React.FC<MpesaPaymentModalProps> = ({
  isOpen,
  transactionId,
  amount,
  storeId,
  customerId,
  onClose,
  onSuccess,
  onError,
  onSelectAlternative,
}) => {
  const [phase, setPhase] = useState<PaymentPhase>('input');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(PaymentStatus.INITIATED);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/system/status')
      .then(r => r.json())
      .then(data => setIsOffline(Boolean(data.offline_mode)))
      .catch(() => setIsOffline(false));
  }, [isOpen]);

  useEffect(() => {
    return () => clearPolling();
  }, [clearPolling]);

  const startPolling = useCallback(
    (id: string) => {
      clearPolling();
      pollingRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/payments/${id}/status`);
          if (!response.ok) {
            throw new Error('Failed to fetch payment status');
          }

          const data = await response.json();
          setPaymentStatus(data.status);

          if (
            data.status === PaymentStatus.COMPLETED ||
            data.status === PaymentStatus.FAILED ||
            data.status === PaymentStatus.EXPIRED ||
            data.status === PaymentStatus.CANCELLED
          ) {
            clearPolling();
            setErrorMessage(data.error_message || null);
            setPhase('result');

            if (data.status === PaymentStatus.COMPLETED) {
              onSuccess({
                paymentId: data.payment_id,
                status: data.status,
                amount: data.amount,
              });
            }
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 5000);
    },
    [clearPolling, onSuccess]
  );

  const handlePhoneSubmit = useCallback(
    async (phone: string, applyToCredit?: boolean) => {
      try {
        setIsLoading(true);
        setPhoneNumber(phone);

        // Convert major units (KES) to cents for backend
        const amountCents = Math.round(amount * 100);

        const response = await fetch('/api/payments/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transaction_id: transactionId,
            phone_number: phone,
            amount: amountCents,
            store_id: storeId,
            apply_to_credit: applyToCredit,
            customer_id: customerId || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Payment initiation failed');
        }

        setPaymentId(data.payment_id);
        setPaymentStatus(data.status);
        setPhase('processing');
        setErrorMessage(null);
        startPolling(data.payment_id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Payment initiation failed';
        setErrorMessage(message);
        onError?.(message);
        setPhase('result');
        setPaymentStatus(PaymentStatus.FAILED);
      } finally {
        setIsLoading(false);
      }
    },
    [transactionId, amount, storeId, customerId, onError, startPolling]
  );

  const handleRetry = useCallback(() => {
    clearPolling();
    setPhase('input');
    setPaymentId(null);
    setPaymentStatus(PaymentStatus.INITIATED);
    setPhoneNumber('');
    setErrorMessage(null);
  }, [clearPolling]);

  const handleClose = useCallback(() => {
    clearPolling();
    setPhase('input');
    setPaymentId(null);
    setPaymentStatus(PaymentStatus.INITIATED);
    setPhoneNumber('');
    setErrorMessage(null);
    onClose();
  }, [clearPolling, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">M-Pesa Payment</h2>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {isOffline && (
          <div className="bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            System Offline — Payments will be processed when online
          </div>
        )}

        <div className="p-4">
          {phase === 'input' && (
            <MpesaPaymentMethod
              onPhoneSubmit={handlePhoneSubmit}
              isLoading={isLoading}
              disabled={false}
            />
          )}

          {phase === 'processing' && paymentId && (
            <MpesaPaymentProgress
              status={paymentStatus}
              amount={amount}
              phoneNumber={phoneNumber}
              transactionId={transactionId}
            />
          )}

          {phase === 'result' && (
            <MpesaPaymentResult
              status={paymentStatus}
              errorMessage={errorMessage}
              amount={amount}
              onRetry={paymentStatus !== PaymentStatus.COMPLETED ? handleRetry : undefined}
              onClose={paymentStatus === PaymentStatus.COMPLETED ? handleClose : undefined}
              onSelectAlternative={onSelectAlternative}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MpesaPaymentModal;
