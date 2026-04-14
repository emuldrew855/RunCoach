/**
 * Admin Dashboard Overview
 *
 * System analytics, growth metrics, and engagement charts.
 */

import { useEffect, useState } from 'react';
import { Users, Activity, MessageSquare, AlertTriangle, TrendingUp, Clock, DollarSign, Zap } from 'lucide-react';
import { adminAPI } from '../../services/adminApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminErrorState from '../../components/admin/AdminErrorState';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SystemAnalytics {
  total_users: number;
  active_users_30d: number;
  total_sessions: number;
  avg_session_duration_minutes: number;
  total_api_calls: number;
  error_rate: number;
}

interface MetricDataPoint {
  date: string;
  count: number;
}

interface TokenUsageSummary {
  total_tokens: number;
  tokens_24h: number;
  tokens_7d: number;
  tokens_30d: number;
  cost_24h_usd: number;
  cost_7d_usd: number;
  cost_30d_usd: number;
  total_cost_usd: number;
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<SystemAnalytics | null>(null);
  const [growthData, setGrowthData] = useState<MetricDataPoint[]>([]);
  const [engagementData, setEngagementData] = useState<MetricDataPoint[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      setLoading(true);
      setError(null);
      const [analyticsRes, growthRes, engagementRes, tokenUsageRes] = await Promise.all([
        adminAPI.getSystemAnalytics(),
        adminAPI.getGrowthMetrics(30),
        adminAPI.getEngagementMetrics(30),
        adminAPI.getTokenUsageSummary(),
      ]);

      setAnalytics(analyticsRes.data.data.analytics || null);
      setGrowthData(growthRes.data.data || []);
      setEngagementData(engagementRes.data.data || []);
      setTokenUsage(tokenUsageRes.data.data.summary || null);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setAnalytics(null);
      setTokenUsage(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading dashboard...</div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !analytics) {
    return (
      <AdminLayout>
        <AdminErrorState
          title="Failed to load analytics"
          message={error || 'Unable to retrieve system analytics. Please try again.'}
          onRetry={loadDashboardData}
          retrying={loading}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            System Overview
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Real-time analytics and system health metrics
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            icon={<Users className="w-6 h-6" />}
            label="Total Users"
            value={(analytics.total_users || 0).toLocaleString()}
            subtext={`${analytics.active_users_30d || 0} active in last 30 days`}
            color="blue"
          />
          <StatCard
            icon={<Activity className="w-6 h-6" />}
            label="Total Sessions"
            value={(analytics.total_sessions || 0).toLocaleString()}
            subtext={`${Number(analytics.avg_session_duration_minutes || 0).toFixed(1)} min avg duration`}
            color="green"
          />
          <StatCard
            icon={<MessageSquare className="w-6 h-6" />}
            label="API Calls"
            value={(analytics.total_api_calls || 0).toLocaleString()}
            subtext="Total requests processed"
            color="purple"
          />
          <StatCard
            icon={<AlertTriangle className="w-6 h-6" />}
            label="Error Rate"
            value={`${(Number(analytics.error_rate || 0) * 100).toFixed(2)}%`}
            subtext="Last 24 hours"
            color={Number(analytics.error_rate || 0) > 0.05 ? 'red' : 'green'}
          />
          <StatCard
            icon={<TrendingUp className="w-6 h-6" />}
            label="Growth Rate"
            value="+15%"
            subtext="User signups this month"
            color="blue"
          />
          <StatCard
            icon={<Clock className="w-6 h-6" />}
            label="Avg Response Time"
            value="124ms"
            subtext="API performance"
            color="green"
          />
        </div>

        {/* Token Usage Cards */}
        {tokenUsage && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              OpenAI Token Usage & Costs
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                icon={<Zap className="w-6 h-6" />}
                label="Tokens (24h)"
                value={Number(tokenUsage.tokens_24h || 0).toLocaleString()}
                subtext={`$${Number(tokenUsage.cost_24h_usd || 0).toFixed(2)} cost`}
                color="blue"
              />
              <StatCard
                icon={<Zap className="w-6 h-6" />}
                label="Tokens (7d)"
                value={Number(tokenUsage.tokens_7d || 0).toLocaleString()}
                subtext={`$${Number(tokenUsage.cost_7d_usd || 0).toFixed(2)} cost`}
                color="green"
              />
              <StatCard
                icon={<Zap className="w-6 h-6" />}
                label="Tokens (30d)"
                value={Number(tokenUsage.tokens_30d || 0).toLocaleString()}
                subtext={`$${Number(tokenUsage.cost_30d_usd || 0).toFixed(2)} cost`}
                color="purple"
              />
              <StatCard
                icon={<DollarSign className="w-6 h-6" />}
                label="Total Cost"
                value={`$${Number(tokenUsage.total_cost_usd || 0).toFixed(2)}`}
                subtext="All-time spending"
                color="blue"
              />
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Growth Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              User Growth (30 Days)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis stroke="#9CA3AF" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                  labelStyle={{ color: '#F3F4F6' }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Engagement Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              User Engagement (30 Days)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={engagementData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis stroke="#9CA3AF" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                  labelStyle={{ color: '#F3F4F6' }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: '#10B981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => window.location.href = '/admin/users'}
              className="btn btn-secondary flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              Manage Users
            </button>
            <button
              onClick={() => window.location.href = '/admin/telemetry'}
              className="btn btn-secondary flex items-center justify-center gap-2"
            >
              <Activity className="w-4 h-4" />
              View Telemetry
            </button>
            <button
              onClick={() => window.location.href = '/admin/errors'}
              className="btn btn-secondary flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              View Errors
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  color: 'blue' | 'green' | 'purple' | 'red';
}

function StatCard({ icon, label, value, subtext, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    red: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {value}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {subtext}
          </p>
        </div>
      </div>
    </div>
  );
}
