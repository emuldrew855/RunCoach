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
};
