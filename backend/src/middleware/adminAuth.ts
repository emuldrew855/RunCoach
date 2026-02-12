/**
 * Admin Authentication Middleware
 *
 * Verifies that the authenticated user has admin privileges.
 */

import { Request, Response, NextFunction } from 'express';
import { isAdmin } from '../models/Admin';
import { AuthorizationError } from '../utils/errors';

/**
 * Middleware to check if user is an admin
 * Must be used after authenticateToken middleware
 */
export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthorizationError('Authentication required');
    }

    const userIsAdmin = await isAdmin(userId);

    if (!userIsAdmin) {
      throw new AuthorizationError('Admin privileges required');
    }

    // Add admin flag to request for convenience
    req.user!.isAdmin = true;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Extend Express Request type to include isAdmin flag
 */
declare global {
  namespace Express {
    interface User {
      id: number;
      stravaId: number;
      isAdmin?: boolean;
    }
  }
}
