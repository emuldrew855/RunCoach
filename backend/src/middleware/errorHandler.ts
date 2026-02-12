/**
 * Global Error Handler Middleware
 *
 * Handles all errors thrown in the application and returns
 * consistent, user-friendly error responses.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, isOperationalError } from '../utils/errors';
import { errorResponse } from '../utils/apiResponse';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging (only stack trace in development)
  if (process.env.NODE_ENV === 'development') {
    console.error('Error stack:', err.stack);
  } else {
    console.error('Error:', err.message);
  }

  // Handle our custom AppError and its subclasses
  if (err instanceof AppError) {
    res.status(err.statusCode).json(errorResponse(err.message, err.details));
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const validationErrors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    res.status(400).json(errorResponse('Validation failed', validationErrors));
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json(errorResponse('Invalid authentication token'));
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json(errorResponse('Authentication token expired'));
    return;
  }

  // Handle Postgres database errors
  if ('code' in err && typeof (err as any).code === 'string') {
    const pgError = err as any;

    // Unique constraint violation (23505)
    if (pgError.code === '23505') {
      res.status(409).json(errorResponse('Resource already exists'));
      return;
    }

    // Foreign key violation (23503)
    if (pgError.code === '23503') {
      res.status(400).json(errorResponse('Invalid reference to related resource'));
      return;
    }

    // Not null violation (23502)
    if (pgError.code === '23502') {
      res.status(400).json(errorResponse('Required field is missing'));
      return;
    }

    // Other constraint violations (23xxx)
    if (pgError.code.startsWith('23')) {
      res.status(400).json(errorResponse('Database constraint violation'));
      return;
    }
  }

  // Handle unexpected operational errors (e.g., from third-party libraries)
  if (isOperationalError(err)) {
    res.status(500).json(errorResponse(err.message));
    return;
  }

  // Handle completely unexpected errors (programming errors)
  // Don't leak error details to client in production
  const message =
    process.env.NODE_ENV === 'development'
      ? err.message
      : 'An unexpected error occurred';

  res.status(500).json(errorResponse(message));

  // Log critical errors for monitoring
  if (!isOperationalError(err)) {
    console.error('CRITICAL: Non-operational error occurred:', err);
  }
}
