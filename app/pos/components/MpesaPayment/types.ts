/**
 * Shared payment status enum for frontend M-Pesa components
 * Mirrors backend PaymentStatus without importing backend paths
 */

export enum PaymentStatus {
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}
