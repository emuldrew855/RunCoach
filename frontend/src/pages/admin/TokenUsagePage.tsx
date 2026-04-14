/**
 * Token Usage Page
 *
 * Displays per-user token usage, costs, and analytics.
 */

import { useEffect, useState } from 'react';
import { Zap, DollarSign, TrendingUp, Users, Activity } from 'lucide-react';
import { adminAPI } from '../../services/adminApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminErrorState from '../../components/admin/AdminErrorState';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface TokenUsageSummary {
  total_tokens: number;
  tokens_24h: number;
  tokens_7d: number;
  tokens_30d: number;
  cost_24h_usd: number;
  cost_7d_usd: number;
  cost_30d_usd: number;
  total_cost_usd: number;
  total_requests: number;
  avg_tokens_per_request: number;
}

interface TokenUsageByDate {
  date: string;
  total_tokens: number;
  cost_usd: number;
  request_count: number;
}

interface TokenUsageByModel {
  model: string;
  total_tokens: number;
  cost_usd: number;
  request_count: number;
  avg_tokens_per_request: number;
}

interface TopUser {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  total_tokens: number;
  tokens_30d: number;
  total_cost_usd: number;
  cost_30d_usd: number;
  total_requests: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function TokenUsagePage() {
  const [summary, setSummary] = useState<TokenUsageSummary | null>(null);
  const [usageByDate, setUsageByDate] = useState<TokenUsageByDate[]>([]);
  const [usageByModel, setUsageByModel] = useState<TokenUsageByModel[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    loadTokenUsageData();
  }, [days]);

  async function loadTokenUsageData() {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, byDateRes, byModelRes, topUsersRes] = await Promise.all([
        adminAPI.getTokenUsageSummary(),
        adminAPI.getTokenUsageByDate(days),
        adminAPI.getTokenUsageByModel(days),
        adminAPI.getTopUsersByToken(50),
      ]);

      setSummary(summaryRes.data.data.summary || null);
      setUsageByDate(byDateRes.data.data.usage || []);
      setUsageByModel(byModelRes.data.data.usage || []);
      setTopUsers(topUsersRes.data.data.users || []);
    } catch (err) {
      console.error('Failed to load token usage data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading token usage data...</div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !summary) {
    return (
      <AdminLayout>
        <AdminErrorState
          title="Failed to load token usage data"
          message={error || 'Unable to retrieve token usage analytics. Please try again.'}
          onRetry={loadTokenUsageData}
          retrying={loading}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              OpenAI Token Usage & Costs
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Monitor AI usage, costs, and per-user consumption
            </p>
          </div>

          {/* Time Range Selector */}
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            label="Tokens (24h)"
            value={Number(summary.tokens_24h || 0).toLocaleString()}
            subtext={`$${Number(summary.cost_24h_usd || 0).toFixed(2)}`}
            color="blue"
          />
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            label="Tokens (7d)"
            value={Number(summary.tokens_7d || 0).toLocaleString()}
            subtext={`$${Number(summary.cost_7d_usd || 0).toFixed(2)}`}
            color="green"
          />
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            label="Tokens (30d)"
            value={Number(summary.tokens_30d || 0).toLocaleString()}
            subtext={`$${Number(summary.cost_30d_usd || 0).toFixed(2)}`}
            color="purple"
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label="Total Cost"
            value={`$${Number(summary.total_cost_usd || 0).toFixed(2)}`}
            subtext="All-time"
            color="blue"
          />
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="Avg/Request"
            value={Number(summary.avg_tokens_per_request || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            subtext={`${Number(summary.total_requests || 0).toLocaleString()} total`}
            color="green"
          />
        </div>

        {/* Charts Row 1: Token Usage Over Time */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Token Usage Over Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Token Usage Over Time
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={usageByDate}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={(date) =>
                    new Date(date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                <YAxis stroke="#9CA3AF" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#F3F4F6' }}
                  formatter={(value: any) => [value.toLocaleString(), 'Tokens']}
                />
                <Line
                  type="monotone"
                  dataKey="total_tokens"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6' }}
                  name="Tokens"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Cost Over Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Cost Over Time (USD)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={usageByDate}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={(date) =>
                    new Date(date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                <YAxis stroke="#9CA3AF" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#F3F4F6' }}
                  formatter={(value: any) => [`$${value.toFixed(2)}`, 'Cost']}
                />
                <Line
                  type="monotone"
                  dataKey="cost_usd"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: '#10B981' }}
                  name="Cost"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2: Model Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Model Usage (Tokens) */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Usage by Model (Last {days} days)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={usageByModel}
                  dataKey="total_tokens"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `${entry.model}: ${(entry.total_tokens / 1000).toFixed(0)}k`}
                >
                  {usageByModel.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => [value.toLocaleString(), 'Tokens']}
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#F3F4F6' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Model Costs (Bar Chart) */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Cost by Model (Last {days} days)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={usageByModel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="model"
                  stroke="#9CA3AF"
                  fontSize={12}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke="#9CA3AF" fontSize={12} />
                <Tooltip
                  formatter={(value: any) => [`$${value.toFixed(2)}`, 'Cost']}
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#F3F4F6' }}
                />
                <Bar dataKey="cost_usd" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Users Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Top Users by Token Usage
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Users ranked by token consumption (last 30 days)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tokens (30d)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Cost (30d)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Tokens
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Cost
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Requests
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {topUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No token usage data yet
                    </td>
                  </tr>
                ) : (
                  topUsers.map((user, index) => (
                    <tr
                      key={user.user_id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span
                            className={`text-sm font-semibold ${
                              index === 0
                                ? 'text-yellow-500'
                                : index === 1
                                ? 'text-gray-400'
                                : index === 2
                                ? 'text-orange-500'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            #{index + 1}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {user.first_name} {user.last_name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {user.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {Number(user.tokens_30d || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          ${Number(user.cost_30d_usd || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {Number(user.total_tokens || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          ${Number(user.total_cost_usd || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {Number(user.total_requests || 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Model Details Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Model Performance (Last {days} days)
              </h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Tokens
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Cost
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Requests
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Avg Tokens/Request
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {usageByModel.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No model usage data yet
                    </td>
                  </tr>
                ) : (
                  usageByModel.map((model) => (
                    <tr
                      key={model.model}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {model.model}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {Number(model.total_tokens || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          ${Number(model.cost_usd || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {Number(model.request_count || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {Number(model.avg_tokens_per_request || 0).toFixed(0)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
            {value}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 truncate">{subtext}</p>
        </div>
      </div>
    </div>
  );
}
