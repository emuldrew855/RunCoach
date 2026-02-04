/**
 * Notification Model
 *
 * Manages in-app notifications for users.
 * Used for Monday analysis alerts and action execution results.
 */

import { query } from '../config/database';

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message?: string;
  link?: string;
  is_read: boolean;
  created_at: Date;
}

/**
 * Create a new notification
 */
export async function createNotification(
  userId: number,
  type: string,
  title: string,
  message?: string,
  link?: string
): Promise<Notification> {
  const result = await query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, type, title, message, link]
  );
  return result.rows[0];
}

/**
 * Get all notifications for a user
 */
export async function getNotificationsByUser(
  userId: number,
  limit: number = 50
): Promise<Notification[]> {
  const result = await query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/**
 * Get unread notifications for a user
 */
export async function getUnreadNotifications(userId: number): Promise<Notification[]> {
  const result = await query(
    `SELECT * FROM notifications
     WHERE user_id = $1 AND is_read = false
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get count of unread notifications
 */
export async function getUnreadCount(userId: number): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count
     FROM notifications
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return parseInt(result.rows[0].count);
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: number, userId: number): Promise<boolean> {
  const result = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: number): Promise<number> {
  const result = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE user_id = $1 AND is_read = false
     RETURNING *`,
    [userId]
  );
  return result.rowCount || 0;
}

/**
 * Delete notification
 */
export async function deleteNotification(
  notificationId: number,
  userId: number
): Promise<boolean> {
  const result = await query(
    `DELETE FROM notifications
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Delete old read notifications (cleanup)
 */
export async function deleteOldNotifications(daysOld: number = 30): Promise<number> {
  const result = await query(
    `DELETE FROM notifications
     WHERE is_read = true
     AND created_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'`,
    []
  );
  return result.rowCount || 0;
}
