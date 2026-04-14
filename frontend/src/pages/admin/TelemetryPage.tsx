/**
 * API Telemetry Page
 *
 * View API performance metrics and telemetry data.
 */

import { useEffect, useState } from 'react';
import { adminAPI } from '../../services/adminApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminErrorState from '../../components/admin/AdminErrorState';
import { Activity, Clock, AlertCircle } from 'lucide-react';

interface TelemetryEntry {
  id: number;
  user_id: number | null;
  method: string;
  endpoint: string;
  status_code: number;
  response_time_ms: number;
  created_at: string;
}

export default function TelemetryPage() {
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'errors'>('all');

  useEffect(() => {
    loadTelemetry();
  }, [filter]);

  async function loadTelemetry() {
    try {
      setLoading(true);
      setError(null);
      const response = await adminAPI.getAPITelemetry({
        limit: 100,
        errorsOnly: filter === 'errors',
      });
      const telemetryData = response.data.data.telemetry;
      setTelemetry(Array.isArray(telemetryData) ? telemetryData : []);
    } catch (err) {
      console.error('Failed to load telemetry:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setTelemetry([]);
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 500) return 'text-red-600 bg-red-100 dark:bg-red-900/20';
    if (statusCode >= 400) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20';
    if (statusCode >= 300) return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
    return 'text-green-600 bg-green-100 dark:bg-green-900/20';
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'POST': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'PUT': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20';
      case 'DELETE': return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading telemetry...</div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <AdminErrorState
          title="Failed to load telemetry"
          message={error}
          onRetry={loadTelemetry}
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
              API Telemetry
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Monitor API performance and request logs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'all'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              All Requests
            </button>
            <button
              onClick={() => setFilter('errors')}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                filter === 'errors'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              Errors Only
            </button>
          </div>
        </div>

        {/* Telemetry Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Endpoint
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Response Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    User ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {telemetry.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {entry.created_at ? new Date(entry.created_at).toLocaleTimeString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${getMethodColor(entry.method)}`}>
                        {entry.method}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {entry.endpoint}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${getStatusColor(entry.status_code)}`}>
                        {entry.status_code}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {entry.response_time_ms != null ? `${entry.response_time_ms}ms` : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {entry.user_id || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {telemetry.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Activity size={48} className="mx-auto mb-3 opacity-30" />
              <p>No telemetry data found</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
