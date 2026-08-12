/**
 * Unit tests for MpesaPaymentProgress Component
 * Requirements: 2.5, 11.3
 * TASK 22: Payment Progress UI Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { PaymentStatus } from '@/backend/src/types/payment';
import { MpesaPaymentProgress } from './MpesaPaymentProgress';

describe('MpesaPaymentProgress Component', () => {
  it('should display INITIATED status message', () => {
    render(
      <MpesaPaymentProgress status={PaymentStatus.INITIATED} phoneNumber="254723456789" />
    );

    expect(screen.getByText(/Please enter your M-Pesa PIN/i)).toBeInTheDocument();
  });

  it('should display PENDING status message', () => {
    render(<MpesaPaymentProgress status={PaymentStatus.PENDING} />);

    expect(screen.getByText(/Awaiting confirmation/i)).toBeInTheDocument();
  });

  it('should display COMPLETED status message', () => {
    render(<MpesaPaymentProgress status={PaymentStatus.COMPLETED} />);

    expect(screen.getByText(/Payment completed successfully/i)).toBeInTheDocument();
  });

  it('should display FAILED status message', () => {
    render(<MpesaPaymentProgress status={PaymentStatus.FAILED} />);

    expect(screen.getByText(/Payment failed/i)).toBeInTheDocument();
  });

  it('should display EXPIRED status message', () => {
    render(<MpesaPaymentProgress status={PaymentStatus.EXPIRED} />);

    expect(screen.getByText(/Payment expired/i)).toBeInTheDocument();
  });

  it('should display CANCELLED status message', () => {
    render(<MpesaPaymentProgress status={PaymentStatus.CANCELLED} />);

    expect(screen.getByText(/Payment cancelled/i)).toBeInTheDocument();
  });

  it('should display amount when provided', () => {
    render(
      <MpesaPaymentProgress
        status={PaymentStatus.PENDING}
        amount={50000}
        phoneNumber="254723456789"
      />
    );

    expect(screen.getByText(/KES 500.00/)).toBeInTheDocument();
  });

  it('should display phone number when provided', () => {
    render(
      <MpesaPaymentProgress
        status={PaymentStatus.PENDING}
        phoneNumber="254723456789"
      />
    );

    expect(screen.getByText('254723456789')).toBeInTheDocument();
  });

  it('should display transaction ID when provided', () => {
    render(
      <MpesaPaymentProgress
        status={PaymentStatus.PENDING}
        transactionId="txn-12345"
      />
    );

    expect(screen.getByText('txn-12345')).toBeInTheDocument();
  });

  it('should display all details when all props provided', () => {
    render(
      <MpesaPaymentProgress
        status={PaymentStatus.PENDING}
        amount={50000}
        phoneNumber="254723456789"
        transactionId="txn-12345"
      />
    );

    expect(screen.getByText(/KES 500.00/)).toBeInTheDocument();
    expect(screen.getByText('254723456789')).toBeInTheDocument();
    expect(screen.getByText('txn-12345')).toBeInTheDocument();
  });

  it('should show spinner during INITIATED status', () => {
    const { container } = render(
      <MpesaPaymentProgress status={PaymentStatus.INITIATED} />
    );

    const spinner = container.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('should show spinner during PENDING status', () => {
    const { container } = render(
      <MpesaPaymentProgress status={PaymentStatus.PENDING} />
    );

    const spinner = container.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('should not show spinner when payment is completed', () => {
    const { container } = render(
      <MpesaPaymentProgress status={PaymentStatus.COMPLETED} />
    );

    const spinner = container.querySelector('.spinner');
    expect(spinner).not.toBeInTheDocument();
  });

  it('should apply correct CSS class for status color', () => {
    const { container } = render(
      <MpesaPaymentProgress status={PaymentStatus.COMPLETED} />
    );

    const progressDiv = container.querySelector('.status-success');
    expect(progressDiv).toBeInTheDocument();
  });

  it('should apply danger class for failed status', () => {
    const { container } = render(
      <MpesaPaymentProgress status={PaymentStatus.FAILED} />
    );

    const progressDiv = container.querySelector('.status-danger');
    expect(progressDiv).toBeInTheDocument();
  });

  it('should apply info class for pending status', () => {
    const { container } = render(
      <MpesaPaymentProgress status={PaymentStatus.PENDING} />
    );

    const progressDiv = container.querySelector('.status-info');
    expect(progressDiv).toBeInTheDocument();
  });

  it('should display progress bar during processing', () => {
    const { container } = render(
      <MpesaPaymentProgress status={PaymentStatus.INITIATED} />
    );

    const progressBar = container.querySelector('.progress-bar');
    expect(progressBar).toBeInTheDocument();
  });

  it('should format amount in KES currency', () => {
    render(
      <MpesaPaymentProgress
        status={PaymentStatus.PENDING}
        amount={100} // 100 cents = 1 KES
      />
    );

    expect(screen.getByText(/KES 1.00/)).toBeInTheDocument();
  });

  it('should handle large amounts correctly', () => {
    render(
      <MpesaPaymentProgress
        status={PaymentStatus.PENDING}
        amount={10000000} // 100,000 KES
      />
    );

    expect(screen.getByText(/KES 100,000.00/)).toBeInTheDocument();
  });
});
