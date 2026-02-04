/**
 * Notification Controller
 *
 * Handles HTTP requests for notifications.
 */

import { Request, Response } from 'express';
import {
  getNotificationsByUser,
  getUnreadNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../models/Notification';

/**
 * GET /api/notifications
 * Get all notifications for the authenticated user
 */
export async function getNotifications(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const notifications = await getNotificationsByUser(userId, limit);

    return res.json({ notifications });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

/**
 * GET /api/notifications/unread
 * Get unread notifications for the authenticated user
 */
export async function getUnread(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const notifications = await getUnreadNotifications(userId);

    return res.json({ notifications });
  } catch (error: any) {
    console.error('Error fetching unread notifications:', error);
    return res.status(500).json({ error: 'Failed to fetch unread notifications' });
  }
}

/**
 * GET /api/notifications/count
 * Get count of unread notifications
 */
export async function getUnreadCountController(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const count = await getUnreadCount(userId);

    return res.json({ count });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
}

/**
 * POST /api/notifications/:id/read
 * Mark notification as read
 */
export async function markNotificationAsRead(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const notificationId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const success = await markAsRead(notificationId, userId);

    if (!success) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json({ message: 'Notification marked as read' });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const count = await markAllAsRead(userId);

    return res.json({ message: 'All notifications marked as read', count });
  } catch (error: any) {
    console.error('Error marking all as read:', error);
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
}

/**
 * DELETE /api/notifications/:id
 * Delete notification
 */
export async function deleteNotificationController(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const notificationId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const success = await deleteNotification(notificationId, userId);

    if (!success) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json({ message: 'Notification deleted' });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
}
