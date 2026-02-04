import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err);

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    res.status(400).json({
      error: 'Validation error',
      details: err.errors,
    });
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Handle database errors
  if (err.code && err.code.startsWith('23')) {
    res.status(400).json({ error: 'Database constraint violation' });
    return;
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
}
