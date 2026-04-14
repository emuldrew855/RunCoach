/**
 * Admin Model
 *
 * Handles admin-related database operations including analytics,
 * user management, and audit logging.
 */

import { query } from '../config/database';

// Types
export interface UserAnalytics {
  id: number;
  strava_id: number;
  first_name: string;
  last_name: string;
  email: string;
  profile_picture_url: string | null;
  created_at: Date;
  last_login_at: Date;
  is_admin: boolean;
  total_sessions: number;
  avg_session_duration_seconds: number;
  last_session: Date;
  total_page_views: number;
  total_api_calls: number;
  total_activities: number;
  total_chat_messages: number;
  pending_actions_count: number;
}

export interface SystemAnalytics {
  total_users: number;
  new_users_7d: number;
  new_users_30d: number;
  active_users_24h: number;
  active_users_7d: number;
  sessions_24h: number;
  avg_session_duration_7d: number;
  activities_synced_7d: number;
  chat_messages_7d: number;
  pending_actions_count: number;
  api_calls_24h: number;
  avg_response_time_24h: number;
  api_errors_24h: number;
  database_size: string;
}

export interface AdminAuditLog {
  id: number;
  admin_user_id: number;
  action_type: string;
  target_user_id?: number;
  action_details?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface UserSession {
  id: string;
  user_id: number;
  started_at: Date;
  last_activity_at: Date;
  ended_at?: Date;
  duration_seconds?: number;
  page_views: number;
  api_calls: number;
  user_agent?: string;
  ip_address?: string;
  device_type?: string;
  browser?: string;
  entry_page?: string;
  exit_page?: string;
}

/**
 * Check if user is admin
 */
export async function isAdmin(userId: number): Promise<boolean> {
  const result = await query(
    'SELECT is_admin FROM users WHERE id = $1',
    [userId]
  );

  return result.rows.length > 0 && result.rows[0].is_admin === true;
}

/**
 * Get system-wide analytics
 */
export async function getSystemAnalytics(): Promise<SystemAnalytics> {
  const result = await query('SELECT * FROM system_analytics');
  if (!result.rows[0]) return result.rows[0];

  return parseNumericFields(result.rows[0], [
    'total_users', 'new_users_7d', 'new_users_30d', 'active_users_24h',
    'active_users_7d', 'sessions_24h', 'avg_session_duration_7d',
    'activities_synced_7d', 'chat_messages_7d', 'pending_actions_count',
    'api_calls_24h', 'avg_response_time_24h', 'api_errors_24h'
  ]);
}

/**
 * Get all users with analytics
 */
export async function getAllUsersWithAnalytics(
  limit: number = 50,
  offset: number = 0
): Promise<UserAnalytics[]> {
  const result = await query(
    `SELECT * FROM user_analytics_summary
     ORDER BY last_login_at DESC NULLS LAST
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const numericFields = [
    'id', 'total_sessions', 'avg_session_duration_seconds',
    'total_page_views', 'total_api_calls', 'total_activities',
    'total_chat_messages', 'pending_actions_count'
  ];

  return result.rows.map(row => parseNumericFields(row, numericFields));
}

/**
 * Get specific user analytics
 */
export async function getUserAnalytics(userId: number): Promise<UserAnalytics | null> {
  const result = await query(
    'SELECT * FROM user_analytics_summary WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) return null;

  const numericFields = [
    'id', 'total_sessions', 'avg_session_duration_seconds',
    'total_page_views', 'total_api_calls', 'total_activities',
    'total_chat_messages', 'pending_actions_count'
  ];

  return parseNumericFields(result.rows[0], numericFields);
}

/**
 * Search users by name or email
 */
export async function searchUsers(searchTerm: string): Promise<UserAnalytics[]> {
  const result = await query(
    `SELECT * FROM user_analytics_summary
     WHERE LOWER(first_name) LIKE LOWER($1)
        OR LOWER(last_name) LIKE LOWER($1)
        OR LOWER(email) LIKE LOWER($1)
     ORDER BY last_login_at DESC NULLS LAST
     LIMIT 20`,
    [`%${searchTerm}%`]
  );

  const numericFields = [
    'id', 'total_sessions', 'avg_session_duration_seconds',
    'total_page_views', 'total_api_calls', 'total_activities',
    'total_chat_messages', 'pending_actions_count'
  ];

  return result.rows.map(row => parseNumericFields(row, numericFields));
}

/**
 * Log admin action
 */
export async function logAdminAction(
  adminUserId: number,
  actionType: string,
  targetUserId?: number,
  actionDetails?: any,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await query(
    `INSERT INTO admin_audit_log
     (admin_user_id, action_type, target_user_id, action_details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminUserId, actionType, targetUserId, actionDetails ? JSON.stringify(actionDetails) : null, ipAddress, userAgent]
  );
}

/**
 * Get admin audit logs
 */
export async function getAdminAuditLogs(
  limit: number = 100,
  offset: number = 0,
  adminUserId?: number
): Promise<AdminAuditLog[]> {
  let sql = `SELECT * FROM admin_audit_log`;
  const params: any[] = [];

  if (adminUserId) {
    sql += ` WHERE admin_user_id = $1`;
    params.push(adminUserId);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Create impersonation token
 */
export async function createImpersonationToken(
  adminUserId: number,
  targetUserId: number,
  reason: string,
  ipAddress?: string
): Promise<string> {
  const token = generateRandomToken(64);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query(
    `INSERT INTO impersonation_tokens
     (admin_user_id, target_user_id, token, expires_at, reason, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminUserId, targetUserId, token, expiresAt, reason, ipAddress]
  );

  // Log the impersonation
  await logAdminAction(
    adminUserId,
    'impersonate',
    targetUserId,
    { reason },
    ipAddress
  );

  return token;
}

/**
 * Validate and use impersonation token
 */
export async function validateImpersonationToken(token: string): Promise<number | null> {
  const result = await query(
    `SELECT target_user_id
     FROM impersonation_tokens
     WHERE token = $1
       AND expires_at > NOW()
       AND used_at IS NULL`,
    [token]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Mark token as used
  await query(
    'UPDATE impersonation_tokens SET used_at = NOW() WHERE token = $1',
    [token]
  );

  return result.rows[0].target_user_id;
}

/**
 * Get recent sessions
 */
export async function getRecentSessions(
  limit: number = 50,
  userId?: number
): Promise<UserSession[]> {
  let sql = `
    SELECT s.*, u.first_name, u.last_name, u.email
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
  `;
  const params: any[] = [];

  if (userId) {
    sql += ` WHERE s.user_id = $1`;
    params.push(userId);
  }

  sql += ` ORDER BY s.started_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);

  const numericFields = ['user_id', 'duration_seconds', 'page_views', 'api_calls'];

  return result.rows.map(row => parseNumericFields(row, numericFields));
}

/**
 * Get API telemetry
 */
export async function getAPITelemetry(
  limit: number = 100,
  endpoint?: string,
  errorsOnly: boolean = false
): Promise<any[]> {
  let sql = `
    SELECT
      endpoint,
      method,
      status_code,
      AVG(response_time_ms)::INTEGER as avg_response_time,
      COUNT(*) as request_count,
      SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
    FROM api_telemetry
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `;
  const params: any[] = [];

  if (endpoint) {
    sql += ` AND endpoint LIKE $1`;
    params.push(`%${endpoint}%`);
  }

  if (errorsOnly) {
    sql += ` AND status_code >= 400`;
  }

  sql += ` GROUP BY endpoint, method, status_code ORDER BY request_count DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);

  const numericFields = ['status_code', 'avg_response_time', 'request_count', 'error_count'];

  return result.rows.map(row => parseNumericFields(row, numericFields));
}

/**
 * Get error logs
 */
export async function getRecentErrors(limit: number = 50): Promise<any[]> {
  const result = await query(
    `SELECT * FROM api_telemetry
     WHERE status_code >= 400
       AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );

  const numericFields = ['status_code', 'response_time_ms', 'user_id'];

  return result.rows.map(row => parseNumericFields(row, numericFields));
}

/**
 * Update user admin status
 */
export async function setUserAdminStatus(
  userId: number,
  isAdmin: boolean,
  notes?: string
): Promise<void> {
  await query(
    'UPDATE users SET is_admin = $1, admin_notes = $2 WHERE id = $3',
    [isAdmin, notes, userId]
  );
}

/**
 * Get growth metrics (user signups over time)
 */
export async function getGrowthMetrics(days: number = 30): Promise<any[]> {
  // Sanitize days parameter to prevent SQL injection
  const safeDays = Math.max(1, Math.min(Math.floor(Number(days) || 30), 365));

  const result = await query(
    `SELECT
       DATE(created_at) as date,
       COUNT(*)::INTEGER as count
     FROM users
     WHERE created_at > NOW() - INTERVAL '1 day' * $1
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [safeDays]
  );

  return result.rows.map(row => parseNumericFields(row, ['count']));
}

/**
 * Get engagement metrics (active users over time)
 */
export async function getEngagementMetrics(days: number = 30): Promise<any[]> {
  // Sanitize days parameter to prevent SQL injection
  const safeDays = Math.max(1, Math.min(Math.floor(Number(days) || 30), 365));

  const result = await query(
    `SELECT
       DATE(started_at) as date,
       COUNT(DISTINCT user_id)::INTEGER as count,
       COUNT(*)::INTEGER as sessions,
       COALESCE(AVG(duration_seconds)::INTEGER, 0) as avg_duration
     FROM user_sessions
     WHERE started_at > NOW() - INTERVAL '1 day' * $1
     GROUP BY DATE(started_at)
     ORDER BY date ASC`,
    [safeDays]
  );

  return result.rows.map(row => parseNumericFields(row, ['count', 'sessions', 'avg_duration']));
}

// Helper functions

/**
 * Helper to convert PostgreSQL numeric strings to JavaScript numbers
 */
function parseNumericFields<T extends Record<string, any>>(row: T, fields: string[]): T {
  if (!row) return row;
  const parsed = { ...row } as Record<string, any>;
  for (const field of fields) {
    if (parsed[field] !== undefined && parsed[field] !== null) {
      parsed[field] = Number(parsed[field]);
    }
  }
  return parsed as T;
}

function generateRandomToken(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
