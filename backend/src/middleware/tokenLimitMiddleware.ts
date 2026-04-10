/**
 * Token Limit Middleware
 *
 * Prevents users from exceeding daily token limits to control costs.
 * Default limit: 50,000 tokens per 24 hours per user
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';

// Default daily token limit (can be overridden with env var)
const DAILY_TOKEN_LIMIT = parseInt(process.env.DAILY_TOKEN_LIMIT || '50000');

// Admin users bypass limit (can be overridden with env var)
const ADMIN_BYPASS_LIMIT = process.env.ADMIN_BYPASS_TOKEN_LIMIT === 'true';

export interface TokenLimitRequest extends Request {
  user?: {
    id: number;
    stravaId: number;
    impersonatedBy?: number;
    isAdmin?: boolean;
  };
  tokenUsage?: {
    tokensUsed24h: number;
    tokensRemaining: number;
    limitExceeded: boolean;
  };
}

/**
 * Check if user has exceeded daily token limit
 */
export async function checkTokenLimit(
  req: TokenLimitRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(); // No user, let auth middleware handle it
    }

    // Skip token limit check in development environment
    if (process.env.NODE_ENV === 'development') {
      console.log('🔓 Token limit check skipped (development mode)');
      req.tokenUsage = {
        tokensUsed24h: 0,
        tokensRemaining: Infinity,
        limitExceeded: false,
      };
      return next();
    }

    // Check if admin bypass is enabled
    if (ADMIN_BYPASS_LIMIT && req.user?.isAdmin) {
      req.tokenUsage = {
        tokensUsed24h: 0,
        tokensRemaining: Infinity,
        limitExceeded: false,
      };
      return next();
    }

    // Query token usage in last 24 hours
    const result = await query(
      `SELECT COALESCE(SUM(total_tokens), 0) as tokens_24h
       FROM token_usage
       WHERE user_id = $1
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    );

    const tokensUsed24h = parseInt(result.rows[0]?.tokens_24h || '0');
    const tokensRemaining = Math.max(0, DAILY_TOKEN_LIMIT - tokensUsed24h);
    const limitExceeded = tokensUsed24h >= DAILY_TOKEN_LIMIT;

    // Attach usage info to request for logging
    req.tokenUsage = {
      tokensUsed24h,
      tokensRemaining,
      limitExceeded,
    };

    if (limitExceeded) {
      console.warn(`⚠️ User ${userId} exceeded token limit: ${tokensUsed24h}/${DAILY_TOKEN_LIMIT}`);
      res.status(429).json({
        success: false,
        error: 'Daily token limit exceeded',
        code: 'TOKEN_LIMIT_EXCEEDED',
        details: {
          limit: DAILY_TOKEN_LIMIT,
          used: tokensUsed24h,
          remaining: 0,
          resetIn: '24 hours from first token usage',
          message: 'You have reached your daily AI usage limit. This helps us manage costs. Your limit will reset in 24 hours from your first message today.',
        },
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Token limit check error:', error);
    // Don't block requests on middleware errors - fail open
    next();
  }
}

/**
 * Get token usage for user (for display in UI)
 */
export async function getUserTokenUsage(userId: number): Promise<{
  tokensUsed24h: number;
  tokensRemaining: number;
  percentUsed: number;
  limit: number;
}> {
  const result = await query(
    `SELECT COALESCE(SUM(total_tokens), 0) as tokens_24h
     FROM token_usage
     WHERE user_id = $1
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId]
  );

  const tokensUsed24h = parseInt(result.rows[0]?.tokens_24h || '0');
  const tokensRemaining = Math.max(0, DAILY_TOKEN_LIMIT - tokensUsed24h);
  const percentUsed = (tokensUsed24h / DAILY_TOKEN_LIMIT) * 100;

  return {
    tokensUsed24h,
    tokensRemaining,
    percentUsed: Math.min(100, percentUsed),
    limit: DAILY_TOKEN_LIMIT,
  };
}
