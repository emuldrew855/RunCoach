/**
 * Admin Controller
 *
 * Handles admin dashboard endpoints including analytics, user management,
 * and impersonation.
 */

import { Request, Response, NextFunction } from 'express';
import {
  getSystemAnalytics,
  getAllUsersWithAnalytics,
  getUserAnalytics,
  searchUsers,
  logAdminAction,
  getAdminAuditLogs,
  createImpersonationToken,
  getRecentSessions,
  getAPITelemetry,
  getRecentErrors,
  setUserAdminStatus,
  getGrowthMetrics,
  getEngagementMetrics,
} from '../models/Admin';
import { generateToken } from '../utils/jwt';
import { successResponse } from '../utils/apiResponse';
import { NotFoundError, ValidationError } from '../utils/errors';
import {
  getTokenUsageSummary,
  getTokenUsageByDate,
  getTokenUsageByModel,
  getTopUsersByTokenUsage,
} from '../services/tokenUsageService';

/**
 * GET /api/v1/admin/analytics
 * Get system-wide analytics overview
 */
export async function getSystemAnalyticsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const analytics = await getSystemAnalytics();

    // Log admin action
    await logAdminAction(
      req.user!.id,
      'view_analytics',
      undefined,
      undefined,
      req.ip,
      req.get('user-agent')
    );

    res.json(successResponse({ analytics }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/users
 * Get all users with analytics
 */
export async function getAllUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const users = await getAllUsersWithAnalytics(limit, offset);

    // Log admin action
    await logAdminAction(
      req.user!.id,
      'view_users',
      undefined,
      { limit, offset },
      req.ip,
      req.get('user-agent')
    );

    res.json(successResponse({ users, limit, offset }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/users/search
 * Search users by name or email
 */
export async function searchUsersController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const searchTerm = req.query.q as string;

    if (!searchTerm || searchTerm.length < 2) {
      throw new ValidationError('Search term must be at least 2 characters');
    }

    const users = await searchUsers(searchTerm);

    res.json(successResponse({ users, searchTerm }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/users/:userId
 * Get specific user analytics
 */
export async function getUserAnalyticsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      throw new ValidationError('Invalid user ID');
    }

    const analytics = await getUserAnalytics(userId);

    if (!analytics) {
      throw new NotFoundError('User');
    }

    // Log admin action
    await logAdminAction(
      req.user!.id,
      'view_user_details',
      userId,
      undefined,
      req.ip,
      req.get('user-agent')
    );

    res.json(successResponse({ analytics }));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/users/:userId/impersonate
 * Generate impersonation token to login as user
 */
export async function impersonateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = parseInt(req.params.userId);
    const { reason } = req.body;

    if (isNaN(userId)) {
      throw new ValidationError('Invalid user ID');
    }

    if (!reason || reason.length < 10) {
      throw new ValidationError('Reason for impersonation must be at least 10 characters');
    }

    // Verify target user exists
    const targetUser = await getUserAnalytics(userId);
    if (!targetUser) {
      throw new NotFoundError('User');
    }

    // Create impersonation token (1 hour expiry)
    const impersonationToken = await createImpersonationToken(
      req.user!.id,
      userId,
      reason,
      req.ip
    );

    // Generate JWT with impersonation flag
    const jwt = generateToken({
      userId: userId,
      stravaId: 0, // Not needed for impersonation
      impersonatedBy: req.user!.id,
    });

    res.json(
      successResponse(
        {
          jwt,
          impersonationToken,
          targetUser: {
            id: targetUser.id,
            name: `${targetUser.first_name} ${targetUser.last_name}`,
            email: targetUser.email,
          },
          expiresIn: '1 hour',
        },
        'Impersonation token created. Use this JWT to login as the user.'
      )
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/audit-logs
 * Get admin audit logs
 */
export async function getAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const adminUserId = req.query.adminUserId ? parseInt(req.query.adminUserId as string) : undefined;

    const logs = await getAdminAuditLogs(limit, offset, adminUserId);

    res.json(successResponse({ logs, limit, offset }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/sessions
 * Get recent user sessions
 */
export async function getSessions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

    const sessions = await getRecentSessions(limit, userId);

    res.json(successResponse({ sessions, limit }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/telemetry/api
 * Get API telemetry and performance metrics
 */
export async function getAPITelemetryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const endpoint = req.query.endpoint as string;
    const errorsOnly = req.query.errorsOnly === 'true';

    const telemetry = await getAPITelemetry(limit, endpoint, errorsOnly);

    res.json(successResponse({ telemetry, limit }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/errors
 * Get recent API errors
 */
export async function getErrors(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const errors = await getRecentErrors(limit);

    res.json(successResponse({ errors, limit }));
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/admin/users/:userId/admin
 * Update user admin status
 */
export async function updateUserAdminStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = parseInt(req.params.userId);
    const { isAdmin, notes } = req.body;

    if (isNaN(userId)) {
      throw new ValidationError('Invalid user ID');
    }

    if (typeof isAdmin !== 'boolean') {
      throw new ValidationError('isAdmin must be a boolean');
    }

    await setUserAdminStatus(userId, isAdmin, notes);

    // Log admin action
    await logAdminAction(
      req.user!.id,
      'update_admin_status',
      userId,
      { isAdmin, notes },
      req.ip,
      req.get('user-agent')
    );

    res.json(
      successResponse(
        { userId, isAdmin, notes },
        `User admin status updated to ${isAdmin ? 'admin' : 'non-admin'}`
      )
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/metrics/growth
 * Get user growth metrics over time
 */
export async function getGrowthMetricsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const metrics = await getGrowthMetrics(days);

    res.json(successResponse({ metrics, days }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/metrics/engagement
 * Get user engagement metrics over time
 */
export async function getEngagementMetricsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const metrics = await getEngagementMetrics(days);

    res.json(successResponse({ metrics, days }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/token-usage/summary
 * Get token usage summary (total tokens, costs, etc.)
 */
export async function getTokenUsageSummaryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await getTokenUsageSummary();

    res.json(successResponse({ summary }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/token-usage/by-date
 * Get token usage by date (for charts)
 */
export async function getTokenUsageByDateController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const usage = await getTokenUsageByDate(days);

    res.json(successResponse({ usage, days }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/token-usage/by-model
 * Get token usage by model (breakdown)
 */
export async function getTokenUsageByModelController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const usage = await getTokenUsageByModel(days);

    res.json(successResponse({ usage, days }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/token-usage/top-users
 * Get top users by token usage
 */
export async function getTopUsersByTokenController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const users = await getTopUsersByTokenUsage(limit);

    res.json(successResponse({ users, limit }));
  } catch (error) {
    next(error);
  }
}
