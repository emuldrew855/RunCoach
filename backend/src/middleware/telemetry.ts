/**
 * Telemetry Middleware
 *
 * Tracks API requests, response times, and errors for admin analytics.
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';

/**
 * Telemetry middleware - tracks all API requests
 */
export function telemetryMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Capture original end function
  const originalEnd = res.end;
  const originalJson = res.json;

  let responseSize = 0;

  // Override res.json to capture response data
  res.json = function (body?: any): Response {
    if (body) {
      responseSize = JSON.stringify(body).length;
    }
    return originalJson.call(this, body);
  };

  // Override res.end to log telemetry
  res.end = function (this: Response, chunk?: any, encoding?: any, callback?: any): Response {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Calculate request size
    const requestSize = req.get('content-length') ? parseInt(req.get('content-length')!) : 0;

    // Log telemetry asynchronously (don't block response)
    setImmediate(() => {
      logTelemetry(
        req.user?.id,
        req.method,
        req.path,
        statusCode,
        responseTime,
        requestSize,
        responseSize,
        req.ip,
        req.get('user-agent')
      ).catch((error) => {
        console.error('Failed to log telemetry:', error);
      });
    });

    return originalEnd.call(this, chunk, encoding, callback);
  } as any;

  next();
}

/**
 * Log API telemetry to database
 */
async function logTelemetry(
  userId: number | undefined,
  method: string,
  endpoint: string,
  statusCode: number,
  responseTimeMs: number,
  requestSizeBytes: number,
  responseSizeBytes: number,
  ipAddress: string | undefined,
  userAgent: string | undefined
): Promise<void> {
  // Skip telemetry for health checks and static assets
  if (endpoint === '/health' || endpoint.startsWith('/static')) {
    return;
  }

  try {
    await query(
      `INSERT INTO api_telemetry
       (user_id, method, endpoint, status_code, response_time_ms,
        request_size_bytes, response_size_bytes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId || null,
        method,
        endpoint,
        statusCode,
        responseTimeMs,
        requestSizeBytes,
        responseSizeBytes,
        ipAddress || null,
        userAgent || null,
      ]
    );
  } catch (error) {
    // Don't throw error - telemetry failures shouldn't break API
    console.error('Telemetry logging error:', error);
  }
}

/**
 * Session tracking middleware
 * Creates or updates user session
 */
export async function sessionTrackingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    const sessionId = req.get('x-session-id'); // Frontend should send this

    if (userId && sessionId) {
      // Update session activity
      await query(
        `UPDATE user_sessions
         SET last_activity_at = NOW(),
             api_calls = api_calls + 1
         WHERE id = $1 AND user_id = $2`,
        [sessionId, userId]
      );
    } else if (userId && !sessionId) {
      // Create new session
      const userAgent = req.get('user-agent');
      const deviceType = detectDeviceType(userAgent);
      const browser = detectBrowser(userAgent);

      const result = await query(
        `INSERT INTO user_sessions
         (user_id, user_agent, ip_address, device_type, browser, entry_page)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [userId, userAgent, req.ip, deviceType, browser, req.path]
      );

      // Send session ID back to frontend
      res.setHeader('X-Session-Id', result.rows[0].id);
    }
  } catch (error) {
    console.error('Session tracking error:', error);
  }

  next();
}

/**
 * Detect device type from user agent
 */
function detectDeviceType(userAgent: string | undefined): string {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'tablet';
  } else {
    return 'desktop';
  }
}

/**
 * Detect browser from user agent
 */
function detectBrowser(userAgent: string | undefined): string {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  if (ua.includes('chrome') && !ua.includes('edge')) return 'Chrome';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('edge')) return 'Edge';
  if (ua.includes('opera') || ua.includes('opr')) return 'Opera';

  return 'other';
}
