/**
 * Service-to-Service Authentication Middleware
 *
 * Authenticates requests from other services (like agent service).
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to authenticate service-to-service requests
 */
export function requireServiceAuth(req: Request, res: Response, next: NextFunction): void {
  const serviceToken = req.headers['x-service-token'];
  const serviceSecret = process.env.SERVICE_SECRET;

  // If no service secret configured, allow (development mode)
  if (!serviceSecret) {
    console.warn('⚠️ SERVICE_SECRET not configured - allowing service request');
    return next();
  }

  // Check if token matches
  if (serviceToken !== serviceSecret) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid service token',
    });
    return;
  }

  // Mark request as service-authenticated
  (req as any).isServiceRequest = true;
  next();
}
