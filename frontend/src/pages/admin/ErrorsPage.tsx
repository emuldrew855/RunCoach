/**
 * Errors Page
 *
 * View recent API errors and failures.
 */

import { useEffect, useState } from 'react';
import { adminAPI } from '../../services/adminApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminErrorState from '../../components/admin/AdminErrorState';
import { AlertTriangle } from 'lucide-react';

interface ErrorEntry {
  id: number;
  user_id: number | null;
  method: string;
  endpoint: string;
  status_code: number;
  error_message: string;
  error_stack: string;
  created_at: string;
}

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedError, setExpandedError] = useState<number | null>(null);

  useEffect(() => {
    loadErrors();
  }, []);

  async function loadErrors() {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await adminAPI.getRecentErrors(50);
      const errorsData = response.data.data.errors;
      setErrors(Array.isArray(errorsData) ? errorsData : []);
    } catch (err) {
      console.error('Failed to load errors:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setLoadError(errorMessage);
      setErrors([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading errors...</div>
        </div>
      </AdminLayout>
    );
  }

  if (loadError) {
    return (
      <AdminLayout>
        <AdminErrorState
          title="Failed to load error logs"
          message={loadError}
          onRetry={loadErrors}
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
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <AlertTriangle className="w-7 h-7 text-red-600" />
              Recent Errors
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Last 50 API errors and exceptions
            </p>
          </div>
          <button
            onClick={loadErrors}
            className="btn btn-secondary"
          >
            Refresh
          </button>
        </div>

        {/* Errors List */}
        <div className="space-y-4">
          {errors.map((error) => (
            <div
              key={error.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-red-500"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded bg-red-100 dark:bg-red-900/20 text-red-600">
                      {error.method}
                    </span>
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {error.status_code}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(error.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm font-mono text-gray-900 dark:text-gray-100 mb-2">
                    {error.endpoint}
                  </p>

                  {error.error_message && (
                    <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                      {error.error_message}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {error.user_id && (
                      <span>User ID: {error.user_id}</span>
                    )}
                  </div>

                  {error.error_stack && (
                    <div className="mt-3">
                      <button
                        onClick={() => setExpandedError(expandedError === error.id ? null : error.id)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {expandedError === error.id ? 'Hide' : 'Show'} Stack Trace
                      </button>

                      {expandedError === error.id && (
                        <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                          {error.error_stack}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {errors.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <AlertTriangle size={48} className="mx-auto mb-3 opacity-30 text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400">No errors found</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Your system is running smoothly!
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
