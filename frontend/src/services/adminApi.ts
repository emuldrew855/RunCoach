/**
 * Admin API Service
 *
 * API calls for admin dashboard functionality.
 */

import api from './api';

export const adminAPI = {
  // Analytics
  getSystemAnalytics: () => api.get('/admin/analytics'),
  getGrowthMetrics: (days: number = 30) => api.get(`/admin/metrics/growth?days=${days}`),
  getEngagementMetrics: (days: number = 30) => api.get(`/admin/metrics/engagement?days=${days}`),

  // User Management
  getAllUsers: (params?: { limit?: number; offset?: number }) =>
    api.get('/admin/users', { params }),
  searchUsers: (query: string) => api.get(`/admin/users/search?q=${query}`),
  getUserDetails: (userId: number) => api.get(`/admin/users/${userId}`),
  updateUserAdminStatus: (userId: number, isAdmin: boolean, notes?: string) =>
    api.put(`/admin/users/${userId}/admin`, { isAdmin, notes }),

  // Impersonation
  impersonateUser: (userId: number, reason: string) =>
    api.post(`/admin/users/${userId}/impersonate`, { reason }),

  // Telemetry & Monitoring
  getAPITelemetry: (params?: { limit?: number; endpoint?: string; errorsOnly?: boolean }) =>
    api.get('/admin/telemetry/api', { params }),
  getRecentErrors: (limit: number = 50) => api.get(`/admin/errors?limit=${limit}`),
  getSessions: (params?: { limit?: number; userId?: number }) =>
    api.get('/admin/sessions', { params }),

  // Audit Logs
  getAuditLogs: (params?: { limit?: number; offset?: number; adminUserId?: number }) =>
    api.get('/admin/audit-logs', { params }),

  // Token Usage
  getTokenUsageSummary: () => api.get('/admin/token-usage/summary'),
  getTokenUsageByDate: (days: number = 30) => api.get(`/admin/token-usage/by-date?days=${days}`),
  getTokenUsageByModel: (days: number = 30) => api.get(`/admin/token-usage/by-model?days=${days}`),
  getTopUsersByToken: (limit: number = 10) => api.get(`/admin/token-usage/top-users?limit=${limit}`),

  // Agent Analytics
  getAgentAnalyticsSummary: () => api.get('/admin/agent-analytics/summary'),
  getAgentIntentDistribution: () => api.get('/admin/agent-analytics/intents'),
  getAgentModelUsage: () => api.get('/admin/agent-analytics/models'),
  getAgentDailyMetrics: (days: number = 30) => api.get(`/admin/agent-analytics/daily?days=${days}`),
  getAgentRecentRequests: (limit: number = 50) => api.get(`/admin/agent-analytics/recent?limit=${limit}`),

  // Feedback Management
  getAllFeedback: (params?: { limit?: number; offset?: number; status?: string }) =>
    api.get('/admin/feedback', { params }),
  getNewFeedbackCount: () => api.get('/admin/feedback/count'),
  getFeedbackById: (feedbackId: number) => api.get(`/admin/feedback/${feedbackId}`),
  updateFeedback: (feedbackId: number, data: { status?: string; adminNotes?: string }) =>
    api.put(`/admin/feedback/${feedbackId}`, data),
};
