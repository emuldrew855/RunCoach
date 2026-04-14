/**
 * Audit Logs Page
 *
 * View admin action audit trail for security and compliance.
 */

import { useEffect, useState } from 'react';
import { adminAPI } from '../../services/adminApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminErrorState from '../../components/admin/AdminErrorState';
import { FileText, Shield, Eye, UserCheck, LogIn } from 'lucide-react';

interface AuditLogEntry {
  id: number;
  admin_user_id: number;
  admin_name: string;
  action_type: string;
  target_user_id: number | null;
  target_name: string | null;
  action_details: any;
  ip_address: string;
  created_at: string;
}

export default function AuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAuditLogs();
  }, []);

  async function loadAuditLogs() {
    try {
      setLoading(true);
      setError(null);
      const response = await adminAPI.getAuditLogs({ limit: 100 });
      const logsData = response.data.data.logs;
      setAuditLogs(Array.isArray(logsData) ? logsData : []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setAuditLogs([]);
    } finally {
      setLoading(false);
    }
  }

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'view_analytics':
      case 'view_users':
        return <Eye className="w-4 h-4" />;
      case 'impersonate':
        return <LogIn className="w-4 h-4" />;
      case 'modify_user':
        return <UserCheck className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'impersonate':
        return 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400';
      case 'modify_user':
        return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400';
      default:
        return 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400';
    }
  };

  const formatActionType = (actionType: string) => {
    return actionType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading audit logs...</div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <AdminErrorState
          title="Failed to load audit logs"
          message={error}
          onRetry={loadAuditLogs}
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
              <FileText className="w-7 h-7 text-blue-600" />
              Audit Logs
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Complete trail of all admin actions for security and compliance
            </p>
          </div>
          <button
            onClick={loadAuditLogs}
            className="btn btn-secondary"
          >
            Refresh
          </button>
        </div>

        {/* Audit Logs Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Admin User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Target User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {log.admin_name}
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ID: {log.admin_user_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded ${getActionColor(log.action_type)}`}>
                        {getActionIcon(log.action_type)}
                        {formatActionType(log.action_type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {log.target_name ? (
                        <>
                          {log.target_name}
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            ID: {log.target_user_id}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {log.ip_address}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {log.action_details && typeof log.action_details === 'object' ? (
                        <details className="cursor-pointer">
                          <summary className="text-blue-600 dark:text-blue-400 hover:underline">
                            View
                          </summary>
                          <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.action_details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {auditLogs.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <FileText size={48} className="mx-auto mb-3 opacity-30" />
              <p>No audit logs found</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
