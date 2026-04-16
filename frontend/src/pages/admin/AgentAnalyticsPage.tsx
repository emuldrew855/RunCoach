/**
 * Agent Analytics Page
 *
 * Displays AI agent performance metrics, context window usage,
 * intent distribution, and request details.
 */

import { useEffect, useState } from 'react';
import {
  Brain,
  Zap,
  Clock,
  Target,
  Activity,
  GitBranch,
  Wrench,
} from 'lucide-react';
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

interface AgentSummary {
  total_requests: number;
  requests_24h: number;
  requests_7d: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  avg_tokens_per_request: number;
  avg_context_tokens: number;
  avg_context_utilization_percent: number;
  max_context_tokens: number;
  avg_response_time_ms: number;
  p95_response_time_ms: number;
  max_response_time_ms: number;
  two_pass_requests_7d: number;
  single_pass_requests_7d: number;
  total_tool_calls_7d: number;
  total_cost_usd: number;
  cost_24h_usd: number;
  cost_7d_usd: number;
}

interface IntentData {
  intent: string;
  request_count: number;
  avg_confidence: number;
  avg_tokens: number;
  avg_response_time_ms: number;
  total_cost_usd: number;
}

interface DailyMetric {
  date: string;
  request_count: number;
  total_tokens: number;
  avg_tokens: number;
  avg_context_tokens: number;
  avg_response_time_ms: number;
  cost_usd: number;
  two_pass_count: number;
  single_pass_count: number;
  total_tool_calls: number;
}

interface RecentRequest {
  id: number;
  created_at: string;
  user_name: string;
  intent: string;
  intent_confidence: number;
  architecture: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  context_tokens: number;
  context_utilization_percent: number;
  response_time_ms: number;
  tool_calls_count: number;
  tools_used: string[];
  cost_usd: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const INTENT_COLORS: Record<string, string> = {
  run_analysis: '#3B82F6',
  plan_review: '#10B981',
  progress_tracking: '#F59E0B',
  general_chat: '#8B5CF6',
};

export default function AgentAnalyticsPage() {
  const [summary, setSummary] = useState<AgentSummary | null>(null);
  const [intents, setIntents] = useState<IntentData[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    loadAgentAnalytics();
  }, [days]);

  async function loadAgentAnalytics() {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, intentsRes, dailyRes, recentRes] = await Promise.all([
        adminAPI.getAgentAnalyticsSummary(),
        adminAPI.getAgentIntentDistribution(),
        adminAPI.getAgentDailyMetrics(days),
        adminAPI.getAgentRecentRequests(100),
      ]);

      setSummary(summaryRes.data.data.summary || null);
      setIntents(intentsRes.data.data.intents || []);
      setDailyMetrics(dailyRes.data.data.metrics || []);
      setRecentRequests(recentRes.data.data.requests || []);
    } catch (err) {
      console.error('Failed to load agent analytics:', err);
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
          <div className="text-gray-500 dark:text-gray-400">Loading agent analytics...</div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <AdminErrorState
          title="Failed to load agent analytics"
          message={error || 'Unable to retrieve agent analytics. Please try again.'}
          onRetry={loadAgentAnalytics}
          retrying={loading}
        />
      </AdminLayout>
    );
  }

  // Architecture breakdown for pie chart
  const architectureData = summary ? [
    { name: 'Single-Pass', value: summary.single_pass_requests_7d || 0 },
    { name: 'Two-Pass', value: summary.two_pass_requests_7d || 0 },
  ].filter(d => d.value > 0) : [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              AI Agent Analytics
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Monitor context window usage, response times, and intent distribution
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Brain className="w-5 h-5" />}
            label="Requests (24h)"
            value={Number(summary?.requests_24h || 0).toLocaleString()}
            subtext={`${Number(summary?.requests_7d || 0).toLocaleString()} in 7d`}
            color="blue"
          />
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            label="Avg Context Tokens"
            value={Number(summary?.avg_context_tokens || 0).toLocaleString()}
            subtext={`${Number(summary?.avg_context_utilization_percent || 0).toFixed(1)}% of 128k window`}
            color="purple"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Avg Response Time"
            value={`${Number(summary?.avg_response_time_ms || 0).toLocaleString()}ms`}
            subtext={`P95: ${Number(summary?.p95_response_time_ms || 0).toLocaleString()}ms`}
            color="green"
          />
          <StatCard
            icon={<Wrench className="w-5 h-5" />}
            label="Tool Calls (7d)"
            value={Number(summary?.total_tool_calls_7d || 0).toLocaleString()}
            subtext={`$${Number(summary?.cost_7d_usd || 0).toFixed(2)} cost`}
            color="orange"
          />
        </div>

        {/* Token & Context Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Token Distribution</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Prompt Tokens</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {Number(summary?.total_prompt_tokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Completion Tokens</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {Number(summary?.total_completion_tokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Avg per Request</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {Number(summary?.avg_tokens_per_request || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Context Window</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Avg Context Tokens</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {Number(summary?.avg_context_tokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Max Context Tokens</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {Number(summary?.max_context_tokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Avg Utilization</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {Number(summary?.avg_context_utilization_percent || 0).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Architecture (7d)</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Single-Pass</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {Number(summary?.single_pass_requests_7d || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Two-Pass</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {Number(summary?.two_pass_requests_7d || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Tool Calls</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {Number(summary?.total_tool_calls_7d || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Token Usage Over Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Context Tokens Over Time
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyMetrics}>
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
                  formatter={(value: any, name: string) => [
                    value?.toLocaleString() || '0',
                    name === 'avg_context_tokens' ? 'Avg Context' : 'Avg Total'
                  ]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avg_context_tokens"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  dot={{ fill: '#8B5CF6' }}
                  name="Avg Context Tokens"
                />
                <Line
                  type="monotone"
                  dataKey="avg_tokens"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6' }}
                  name="Avg Total Tokens"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Response Time Over Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Response Time Over Time
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyMetrics}>
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
                  formatter={(value: any) => [`${value?.toLocaleString() || '0'}ms`, 'Response Time']}
                />
                <Line
                  type="monotone"
                  dataKey="avg_response_time_ms"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: '#10B981' }}
                  name="Avg Response Time"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Intent Distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Intent Distribution (Last 30d)
            </h3>
            {intents.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={intents}
                    dataKey="request_count"
                    nameKey="intent"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.intent}: ${entry.request_count}`}
                  >
                    {intents.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={INTENT_COLORS[entry.intent] || COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [value.toLocaleString(), 'Requests']}
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#F3F4F6' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-500">
                No intent data available yet
              </div>
            )}
          </div>

          {/* Architecture Distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Architecture Distribution (Last 7d)
            </h3>
            {architectureData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={architectureData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    <Cell fill="#10B981" />
                    <Cell fill="#F59E0B" />
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [value.toLocaleString(), 'Requests']}
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#F3F4F6' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-500">
                No architecture data available yet
              </div>
            )}
          </div>
        </div>

        {/* Intent Performance Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Intent Performance
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Average metrics by intent type (last 30 days)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Intent
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Requests
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Avg Confidence
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Avg Tokens
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Avg Response Time
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {intents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No intent data available yet
                    </td>
                  </tr>
                ) : (
                  intents.map((intent) => (
                    <tr
                      key={intent.intent}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: INTENT_COLORS[intent.intent] || '#6B7280' }}
                          />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {intent.intent || 'unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {Number(intent.request_count || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {Number(intent.avg_confidence || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {Number(intent.avg_tokens || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {Number(intent.avg_response_time_ms || 0).toLocaleString()}ms
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          ${Number(intent.total_cost_usd || 0).toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Requests Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Recent Agent Requests
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Last 100 requests with full context and token details
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Intent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Arch
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Context
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Util %
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tools
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {recentRequests.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No recent requests. Agent analytics will appear as users interact with the coach.
                    </td>
                  </tr>
                ) : (
                  recentRequests.map((req) => (
                    <tr
                      key={req.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(req.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {req.user_name || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${INTENT_COLORS[req.intent] || '#6B7280'}20`,
                            color: INTENT_COLORS[req.intent] || '#6B7280',
                          }}
                        >
                          {req.intent || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            req.architecture === 'two_pass'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}
                        >
                          {req.architecture === 'two_pass' ? '2-Pass' : '1-Pass'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {Number(req.context_tokens || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {Number(req.total_tokens || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span
                          className={`text-sm font-medium ${
                            (req.context_utilization_percent || 0) > 50
                              ? 'text-red-600 dark:text-red-400'
                              : (req.context_utilization_percent || 0) > 25
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}
                        >
                          {Number(req.context_utilization_percent || 0).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {Number(req.response_time_ms || 0).toLocaleString()}ms
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {req.tool_calls_count || 0}
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
  color: 'blue' | 'green' | 'purple' | 'orange';
}

function StatCard({ icon, label, value, subtext, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
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
