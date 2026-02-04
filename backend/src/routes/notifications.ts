/**
 * Notification Routes
 *
 * Routes for managing user notifications.
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getNotifications,
  getUnread,
  getUnreadCountController,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotificationController,
} from '../controllers/notificationController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get all notifications
router.get('/', getNotifications);

// Get unread notifications
router.get('/unread', getUnread);

// Get unread count
router.get('/count', getUnreadCountController);

// Mark notification as read
router.post('/:id/read', markNotificationAsRead);

// Mark all as read
router.post('/read-all', markAllNotificationsAsRead);

// Delete notification
router.delete('/:id', deleteNotificationController);

export default router;
