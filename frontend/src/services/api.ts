import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle authentication errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Only redirect if we're not already on the login page
      if (window.location.pathname !== '/') {
        localStorage.removeItem('jwt');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authAPI = {
  getCurrentUser: () => api.get('/auth/me'),
  initiateStravaLogin: () => {
    window.location.href = `${API_URL}/auth/strava`;
  },
};

// Activities API
export const activitiesAPI = {
  getActivities: (params?: { limit?: number; offset?: number }) =>
    api.get('/activities', { params }),
  getActivity: (id: number, refresh?: boolean) =>
    api.get(`/activities/${id}`, { params: refresh ? { refresh: 'true' } : undefined }),
  recomputeInsights: (id: number) => api.post(`/activities/${id}/recompute-insights`),
  syncActivities: () => api.post('/activities/sync'),
  getStats: (days?: number) => api.get('/activities/stats', { params: { days } }),
  getHRZones: (days?: number) => api.get('/activities/hr-zones', { params: { days } }),
  getWeeklyVolume: (params?: { weeks?: number; includePlanned?: boolean; futureWeeks?: number; weekStartsOn?: 'sunday' | 'monday' }) =>
    api.get('/activities/weekly-volume', { params }),
};

// Profile API
export const profileAPI = {
  getProfile: () => api.get('/profile'),
  updateProfile: (data: any) => api.put('/profile', data),
};

// Goals API
export const goalsAPI = {
  getGoals: () => api.get('/goals'),
  createGoal: (data: any) => api.post('/goals', data),
  updateGoal: (id: number, data: any) => api.put(`/goals/${id}`, data),
};

// Chat API
export const chatAPI = {
  getConversations: () => api.get('/chat/conversations'),
  createConversation: (title?: string) => api.post('/chat/conversations', { title }),
  getConversationHistory: (conversationId: string) =>
    api.get(`/chat/conversations/${conversationId}`),
  updateConversation: (conversationId: string, title: string) =>
    api.put(`/chat/conversations/${conversationId}`, { title }),
  deleteConversation: (conversationId: string) =>
    api.delete(`/chat/conversations/${conversationId}`),
  sendMessage: (conversationId: string, message: string) =>
    api.post('/chat/message', { conversationId, message }, {
      responseType: 'stream',
      adapter: 'fetch',
    }),
  // Pending actions
  getPendingActions: () => api.get('/agent/actions/pending'),
  getPendingActionsCount: () => api.get('/agent/actions/count'),
  approveAction: (actionId: string) => api.post(`/agent/actions/${actionId}/approve`),
  rejectAction: (actionId: string, reason?: string) =>
    api.post(`/agent/actions/${actionId}/reject`, { reason }),
};

// Training Plan API
export const trainingPlanAPI = {
  getPlans: () => api.get('/training/plans'),
  getActivePlan: () => api.get('/training/plans/active'),
  uploadPlan: (formData: FormData) =>
    api.post('/training/plans/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  createPlan: (data: any) => api.post('/training/plans', data),
  updatePlan: (id: number, data: any) => api.put(`/training/plans/${id}`, data),
  deletePlan: (id: number) => api.delete(`/training/plans/${id}`),

  getWorkouts: (params?: { planId?: number; startDate?: string; endDate?: string; days?: number }) =>
    api.get('/training/workouts', { params }),
  createWorkout: (data: any) => api.post('/training/workouts', data),
  updateWorkout: (id: number, data: any) => api.put(`/training/workouts/${id}`, data),
  deleteWorkout: (id: number) => api.delete(`/training/workouts/${id}`),
  completeWorkout: (id: number, activityId: number, status?: string) =>
    api.post(`/training/workouts/${id}/complete`, { activityId, status }),

  getAlerts: () => api.get('/training/alerts'),
};

// Agent Actions API
export const agentActionsAPI = {
  getPendingActions: () => api.get('/agent/actions/pending'),
  getPendingAction: (actionId: string) => api.get(`/agent/actions/${actionId}`),
  approveAction: (actionId: string) => api.post(`/agent/actions/${actionId}/approve`),
  rejectAction: (actionId: string, reason?: string) =>
    api.post(`/agent/actions/${actionId}/reject`, { reason }),
  getPendingActionsCount: () => api.get('/agent/actions/count'),
};

// Notifications API
export const notificationsAPI = {
  getNotifications: (limit?: number) => api.get('/notifications', { params: { limit } }),
  getUnread: () => api.get('/notifications/unread'),
  getUnreadCount: () => api.get('/notifications/count'),
  markAsRead: (notificationId: number) => api.post(`/notifications/${notificationId}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  deleteNotification: (notificationId: number) => api.delete(`/notifications/${notificationId}`),
};

// Race History API
export const raceHistoryAPI = {
  getRaceHistory: () => api.get('/races/history'),
  getRace: (id: number) => api.get(`/races/history/${id}`),
  createRace: (data: any) => api.post('/races/history', data),
  updateRace: (id: number, data: any) => api.put(`/races/history/${id}`, data),
  deleteRace: (id: number) => api.delete(`/races/history/${id}`),
  getPersonalBests: () => api.get('/races/personal-bests'),
};

// Memory API (Phase 3: RAG + Vector Search)
export const memoryAPI = {
  getInsights: () => api.get('/memories/insights'),
  getPatterns: (category?: string) =>
    api.get('/memories/patterns', { params: category ? { category } : {} }),
  getSummaries: () => api.get('/memories/summaries'),
  getStats: () => api.get('/memories/stats'),
  consolidate: () => api.post('/memories/consolidate'),
};

// Coaching API (AI-powered coaching features)
export const coachingAPI = {
  getDailyInsight: () => api.get('/coaching/daily-insight'),
  dismissInsight: () => api.post('/coaching/daily-insight/dismiss'),
  getTrainingStatus: () => api.get('/coaching/training-status'),
  getWeeklyExecution: () => api.get('/coaching/weekly-execution'),
};

// Chart Data API (Dynamic performance visualizations)
export const chartDataAPI = {
  getPaceComparison: (params: { activityId: number; distanceMin?: number; distanceMax?: number; limit?: number }) =>
    api.get('/chart-data/pace-comparison', { params }),
  getSplitComparison: (params: { activityId: number; distanceMin?: number; distanceMax?: number; limit?: number }) =>
    api.get('/chart-data/split-comparison', { params }),
  getHRZoneDistribution: (params: { activityId: number }) =>
    api.get('/chart-data/hr-zone-distribution', { params }),
  getExecutionScoreTrend: (params: { workoutType?: string; limit?: number; days?: number }) =>
    api.get('/chart-data/execution-score-trend', { params }),
  getSimilarWorkouts: (params: { activityId: number; distanceMin?: number; distanceMax?: number; workoutType?: string; limit?: number }) =>
    api.get('/chart-data/similar-workouts', { params }),
  getPBProgression: (params: { distance: number; days?: number }) =>
    api.get('/chart-data/pb-progression', { params }),
};
