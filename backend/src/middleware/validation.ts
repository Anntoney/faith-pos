/**
 * Payment Validation Middleware
 * Validates incoming requests for payment operations
 * Requirements: 1.4, 3.1, 7.4
 * TASK 21: Add Data Validation Middleware
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Validate payment initiation request
 * Checks: phone number format, amount, store_id
 * Requirements: 1.4 - Phone number validation
 */
export function validatePaymentRequest(req: Request, res: Response, next: NextFunction): void {
  try {
    const { transaction_id, phone_number, amount, store_id } = req.body;

    // Validate transaction_id
    if (!transaction_id || typeof transaction_id !== 'string') {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'transaction_id is required and must be a string',
      });
      return;
    }

    // Validate phone number format
    // Requirements: 1.4 - Validates phone number is in 254-prefixed format
    const phoneRegex = /^(\+)?254\d{9,10}$/;
    if (!phone_number || !phoneRegex.test(phone_number)) {
      res.status(400).json({
        error: 'INVALID_PHONE',
        message: 'phone_number must be in format 254XXXXXXXXX or +254XXXXXXXXX',
      });
      return;
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'amount is required and must be a positive number',
      });
      return;
    }

    // Validate store_id
    if (!store_id || typeof store_id !== 'string') {
      res.status(400).json({
        error: 'INVALID_STORE',
        message: 'store_id is required and must be a string',
      });
      return;
    }

    // All validations passed
    next();
  } catch (error) {
    res.status(500).json({
      error: 'VALIDATION_ERROR',
      message: error instanceof Error ? error.message : 'Validation failed',
    });
  }
}

/**
 * Validate webhook request signature
 * Checks: webhook signature validity, M-Pesa format
 * Requirements: 3.1 - Validates webhook signature
 */
export function validateWebhookRequest(req: Request, res: Response, next: NextFunction): void {
  try {
    // Extract signature from header
    // Requirements: 3.1 - Validates webhook signature for authenticity
    const signature = req.headers['x-m2m-signature'];
    const storeId = req.headers['x-store-id'];

    if (!signature || typeof signature !== 'string') {
      res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Webhook signature missing or invalid',
      });
      return;
    }

    if (!storeId || typeof storeId !== 'string') {
      res.status(400).json({
        error: 'INVALID_STORE_ID',
        message: 'Store ID missing from webhook header',
      });
      return;
    }

    // Validate webhook payload structure
    const { Body } = req.body;
    if (!Body || !Body.stkCallback) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'Webhook payload must contain Body.stkCallback',
      });
      return;
    }

    // Check required stkCallback fields
    const { CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;
    if (!CheckoutRequestID || ResultCode === undefined || !ResultDesc) {
      res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'stkCallback must contain CheckoutRequestID, ResultCode, ResultDesc',
      });
      return;
    }

    // All validations passed
    next();
  } catch (error) {
    res.status(500).json({
      error: 'VALIDATION_ERROR',
      message: error instanceof Error ? error.message : 'Webhook validation failed',
    });
  }
}

/**
 * Validate payment ID format
 * Checks: UUID format validation
 */
export function validatePaymentId(req: Request, res: Response, next: NextFunction): void {
  try {
    const { payment_id } = req.params;

    // Validate UUID format (basic check)
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!payment_id || !uuidRegex.test(payment_id)) {
      res.status(400).json({
        error: 'INVALID_PAYMENT_ID',
        message: 'payment_id must be a valid UUID format',
      });
      return;
    }

    // All validations passed
    next();
  } catch (error) {
    res.status(500).json({
      error: 'VALIDATION_ERROR',
      message: error instanceof Error ? error.message : 'Payment ID validation failed',
    });
  }
}

/**
 * Validate store ID format
 * Checks: Store ID is not empty
 */
export function validateStoreId(req: Request, res: Response, next: NextFunction): void {
  try {
    const storeId = req.params.store_id || req.query.store_id || req.headers['x-store-id'];

    if (!storeId || typeof storeId !== 'string' || storeId.trim() === '') {
      res.status(400).json({
        error: 'INVALID_STORE_ID',
        message: 'store_id is required and must be a non-empty string',
      });
      return;
    }

    // All validations passed
    next();
  } catch (error) {
    res.status(500).json({
      error: 'VALIDATION_ERROR',
      message: error instanceof Error ? error.message : 'Store ID validation failed',
    });
  }
}

/**
 * Validate pagination parameters
 * Checks: limit and offset are valid numbers within bounds
 */
export function validatePaginationParams(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    if (isNaN(limit) || limit <= 0 || limit > 100) {
      res.status(400).json({
        error: 'INVALID_LIMIT',
        message: 'limit must be a number between 1 and 100',
      });
      return;
    }

    if (isNaN(offset) || offset < 0) {
      res.status(400).json({
        error: 'INVALID_OFFSET',
        message: 'offset must be a non-negative number',
      });
      return;
    }

    // Store validated values in request for use by handlers
    (req as any).pagination = { limit, offset };

    // All validations passed
    next();
  } catch (error) {
    res.status(500).json({
      error: 'VALIDATION_ERROR',
      message: error instanceof Error ? error.message : 'Pagination validation failed',
    });
  }
}

/**
 * Error handling middleware for validation errors
 */
export function validationErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof Error) {
    res.status(400).json({
      error: 'VALIDATION_FAILED',
      message: err.message,
    });
  } else {
    res.status(500).json({
      error: 'UNKNOWN_ERROR',
      message: 'An unexpected validation error occurred',
    });
  }
}
