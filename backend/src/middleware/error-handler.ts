import { NextFunction, Request, Response } from 'express';
import { BillingValidationError } from '@sem/shared';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'APP_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: err.errors[0]?.message || 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.errors,
    });
    return;
  }

  if (err instanceof BillingValidationError) {
    res.status(400).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  const msg = err instanceof Error ? err.message : 'Internal server error';
  if (process.env.NODE_ENV !== 'test') {
    console.error('[API Error]', err);
  }
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : msg,
    code: 'INTERNAL_ERROR',
  });
}
