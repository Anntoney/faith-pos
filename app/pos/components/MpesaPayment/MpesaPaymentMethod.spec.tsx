/**
 * Unit tests for MpesaPaymentMethod Component
 * Requirements: 11.1, 11.2
 * TASK 22: M-Pesa Payment UI Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MpesaPaymentMethod } from './MpesaPaymentMethod';

describe('MpesaPaymentMethod Component', () => {
  let mockOnPhoneSubmit: jest.Mock;

  beforeEach(() => {
    mockOnPhoneSubmit = jest.fn();
  });

  it('should render phone number input field', () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const phoneInput = screen.getByPlaceholderText('254...');
    expect(phoneInput).toBeInTheDocument();
  });

  it('should render submit button', () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const submitButton = screen.getByRole('button', { name: /Initiate Payment/i });
    expect(submitButton).toBeInTheDocument();
  });

  it('should display phone number format hint', () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    expect(screen.getByText('Format: 254XXXXXXXXX')).toBeInTheDocument();
  });

  it('should render credit option checkbox', () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const creditCheckbox = screen.getByRole('checkbox', {
      name: /Apply to customer credit/i,
    });
    expect(creditCheckbox).toBeInTheDocument();
  });

  it('should validate phone number format (254 prefix)', async () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const phoneInput = screen.getByPlaceholderText('254...');
    const submitButton = screen.getByRole('button', { name: /Initiate Payment/i });

    // Enter invalid phone number
    await userEvent.type(phoneInput, '123456789');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid phone number format/i)).toBeInTheDocument();
    });
    expect(mockOnPhoneSubmit).not.toHaveBeenCalled();
  });

  it('should validate phone number format (+254 prefix)', async () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const phoneInput = screen.getByPlaceholderText('254...');
    const submitButton = screen.getByRole('button', { name: /Initiate Payment/i });

    // Enter valid phone number with +254
    await userEvent.type(phoneInput, '+254723456789');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnPhoneSubmit).toHaveBeenCalledWith('+254723456789', false);
    });
  });

  it('should accept 254XXXXXXXXX format', async () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const phoneInput = screen.getByPlaceholderText('254...');
    const submitButton = screen.getByRole('button', { name: /Initiate Payment/i });

    await userEvent.type(phoneInput, '254723456789');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnPhoneSubmit).toHaveBeenCalledWith('254723456789', false);
    });
  });

  it('should pass apply_to_credit flag when checkbox is checked', async () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const phoneInput = screen.getByPlaceholderText('254...');
    const creditCheckbox = screen.getByRole('checkbox');
    const submitButton = screen.getByRole('button', { name: /Initiate Payment/i });

    await userEvent.type(phoneInput, '254723456789');
    await userEvent.click(creditCheckbox);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnPhoneSubmit).toHaveBeenCalledWith('254723456789', true);
    });
  });

  it('should disable submit button when loading', () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} isLoading={true} />);

    const submitButton = screen.getByRole('button', { name: /Processing/i });
    expect(submitButton).toBeDisabled();
  });

  it('should disable submit button when phone is empty', () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const submitButton = screen.getByRole('button', { name: /Initiate Payment/i });
    expect(submitButton).toBeDisabled();
  });

  it('should display error message on submission error', async () => {
    mockOnPhoneSubmit.mockRejectedValueOnce(new Error('Payment service error'));

    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const phoneInput = screen.getByPlaceholderText('254...');
    const submitButton = screen.getByRole('button', { name: /Initiate Payment/i });

    await userEvent.type(phoneInput, '254723456789');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Payment service error/i)).toBeInTheDocument();
    });
  });

  it('should disable all inputs when disabled prop is true', () => {
    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} disabled={true} />);

    const phoneInput = screen.getByPlaceholderText('254...');
    const creditCheckbox = screen.getByRole('checkbox');
    const submitButton = screen.getByRole('button');

    expect(phoneInput).toBeDisabled();
    expect(creditCheckbox).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  it('should clear error message on new input', async () => {
    mockOnPhoneSubmit.mockRejectedValueOnce(new Error('Payment failed'));

    render(<MpesaPaymentMethod onPhoneSubmit={mockOnPhoneSubmit} />);

    const phoneInput = screen.getByPlaceholderText('254...');
    const submitButton = screen.getByRole('button', { name: /Initiate Payment/i });

    // First submission with error
    await userEvent.type(phoneInput, '123');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid phone number format/i)).toBeInTheDocument();
    });

    // Clear and enter valid phone
    await userEvent.clear(phoneInput);
    await userEvent.type(phoneInput, '254723456789');

    // Error should clear
    await waitFor(() => {
      expect(screen.queryByText(/Invalid phone number format/i)).not.toBeInTheDocument();
    });
  });
});
