/**
 * Admin Routes
 *
 * All admin-only endpoints requiring admin authentication.
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import * as adminController from '../controllers/adminController';

const router = Router();

// All routes require authentication and admin privileges
router.use(authenticateToken);
router.use(requireAdmin);

// Analytics overview
router.get('/analytics', adminController.getSystemAnalyticsController);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/search', adminController.searchUsersController);
router.get('/users/:userId', adminController.getUserAnalyticsController);
router.put('/users/:userId/admin', adminController.updateUserAdminStatus);

// User impersonation
router.post('/users/:userId/impersonate', adminController.impersonateUser);

// Audit logs
router.get('/audit-logs', adminController.getAuditLogs);

// Sessions
router.get('/sessions', adminController.getSessions);

// Telemetry
router.get('/telemetry/api', adminController.getAPITelemetryController);
router.get('/errors', adminController.getErrors);

// Metrics
router.get('/metrics/growth', adminController.getGrowthMetricsController);
router.get('/metrics/engagement', adminController.getEngagementMetricsController);

// Token Usage
router.get('/token-usage/summary', adminController.getTokenUsageSummaryController);
router.get('/token-usage/by-date', adminController.getTokenUsageByDateController);
router.get('/token-usage/by-model', adminController.getTokenUsageByModelController);
router.get('/token-usage/top-users', adminController.getTopUsersByTokenController);

// Agent Analytics
router.get('/agent-analytics/summary', adminController.getAgentAnalyticsSummaryController);
router.get('/agent-analytics/intents', adminController.getAgentIntentDistributionController);
router.get('/agent-analytics/models', adminController.getAgentModelUsageController);
router.get('/agent-analytics/daily', adminController.getAgentDailyMetricsController);
router.get('/agent-analytics/recent', adminController.getAgentRecentRequestsController);

// Feedback Management
router.get('/feedback', adminController.getAllFeedbackController);
router.get('/feedback/count', adminController.getNewFeedbackCountController);
router.get('/feedback/:feedbackId', adminController.getFeedbackByIdController);
router.put('/feedback/:feedbackId', adminController.updateFeedbackController);

export default router;
