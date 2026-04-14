/**
 * Admin Feedback Page
 *
 * View and manage user feedback submissions.
 */

import { useState, useEffect } from 'react';
import { MessageSquare, Bug, Lightbulb, HelpCircle, Mail, Clock, Check, Eye, CheckCircle } from 'lucide-react';
import { adminAPI } from '../../services/adminApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminErrorState from '../../components/admin/AdminErrorState';

interface Feedback {
  id: number;
  user_id: number | null;
  user_first_name?: string;
  user_last_name?: string;
  name: string | null;
  email: string | null;
  category: string;
  subject: string | null;
  message: string;
  status: 'new' | 'read' | 'responded' | 'resolved';
  admin_notes: string | null;
  responded_at: string | null;
  created_at: string;
}

interface FeedbackCounts {
  status: string;
  count: number;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  general: <MessageSquare className="w-4 h-4" />,
  bug: <Bug className="w-4 h-4" />,
  feature: <Lightbulb className="w-4 h-4" />,
  question: <HelpCircle className="w-4 h-4" />,
  other: <MessageSquare className="w-4 h-4" />,
};

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
  read: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  responded: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
};

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [counts, setCounts] = useState<FeedbackCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadFeedback();
  }, [statusFilter]);

  async function loadFeedback() {
    try {
      setLoading(true);
      setError(null);
      const response = await adminAPI.getAllFeedback({
        status: statusFilter || undefined,
        limit: 100,
      });
      setFeedback(response.data.data.feedback);
      setCounts(response.data.data.counts);
    } catch (err) {
      console.error('Failed to load feedback:', err);
      setError('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate(feedbackId: number, newStatus: string) {
    try {
      setUpdating(true);
      await adminAPI.updateFeedback(feedbackId, {
        status: newStatus,
        adminNotes: adminNotes || undefined,
      });
      await loadFeedback();
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback({ ...selectedFeedback, status: newStatus as any, admin_notes: adminNotes || selectedFeedback.admin_notes });
      }
      setAdminNotes('');
    } catch (err) {
      console.error('Failed to update feedback:', err);
    } finally {
      setUpdating(false);
    }
  }

  function getCountByStatus(status: string): number {
    return counts.find(c => c.status === status)?.count || 0;
  }

  if (loading && feedback.length === 0) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading feedback...</div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <AdminErrorState
          title="Failed to load feedback"
          message={error}
          onRetry={loadFeedback}
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            User Feedback
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {getCountByStatus('new')} new
            </span>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
          <FilterTab
            label="All"
            count={feedback.length}
            active={statusFilter === ''}
            onClick={() => setStatusFilter('')}
          />
          <FilterTab
            label="New"
            count={getCountByStatus('new')}
            active={statusFilter === 'new'}
            onClick={() => setStatusFilter('new')}
            highlight
          />
          <FilterTab
            label="Read"
            count={getCountByStatus('read')}
            active={statusFilter === 'read'}
            onClick={() => setStatusFilter('read')}
          />
          <FilterTab
            label="Responded"
            count={getCountByStatus('responded')}
            active={statusFilter === 'responded'}
            onClick={() => setStatusFilter('responded')}
          />
          <FilterTab
            label="Resolved"
            count={getCountByStatus('resolved')}
            active={statusFilter === 'resolved'}
            onClick={() => setStatusFilter('resolved')}
          />
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Feedback List */}
          <div className="space-y-3">
            {feedback.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                No feedback found
              </div>
            ) : (
              feedback.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedFeedback(item);
                    setAdminNotes(item.admin_notes || '');
                  }}
                  className={`
                    p-4 rounded-lg border cursor-pointer transition-all
                    ${selectedFeedback?.id === item.id
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/10'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      {CATEGORY_ICONS[item.category]}
                      <span className="text-xs capitalize">{item.category}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mt-2 line-clamp-1">
                    {item.subject || 'No subject'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                    {item.message}
                  </p>
                  <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {item.user_first_name
                        ? `${item.user_first_name} ${item.user_last_name}`
                        : item.name || item.email || 'Anonymous'
                      }
                    </span>
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Detail Panel */}
          {selectedFeedback ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 sticky top-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  {CATEGORY_ICONS[selectedFeedback.category]}
                  <span className="text-sm capitalize text-gray-600 dark:text-gray-400">
                    {selectedFeedback.category}
                  </span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[selectedFeedback.status]}`}>
                  {selectedFeedback.status}
                </span>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {selectedFeedback.subject || 'No subject'}
              </h3>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Mail className="w-4 h-4" />
                  <span>
                    {selectedFeedback.user_first_name
                      ? `${selectedFeedback.user_first_name} ${selectedFeedback.user_last_name}`
                      : selectedFeedback.name || 'Anonymous'
                    }
                    {selectedFeedback.email && ` (${selectedFeedback.email})`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>{new Date(selectedFeedback.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {selectedFeedback.message}
                </p>
              </div>

              {/* Admin Notes */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Admin Notes
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add internal notes..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              {/* Status Actions */}
              <div className="flex flex-wrap gap-2">
                {selectedFeedback.status !== 'read' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedFeedback.id, 'read')}
                    disabled={updating}
                    className="btn btn-secondary text-sm flex items-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    Mark Read
                  </button>
                )}
                {selectedFeedback.status !== 'responded' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedFeedback.id, 'responded')}
                    disabled={updating}
                    className="btn btn-secondary text-sm flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Mark Responded
                  </button>
                )}
                {selectedFeedback.status !== 'resolved' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedFeedback.id, 'resolved')}
                    disabled={updating}
                    className="btn btn-primary text-sm flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-8 flex items-center justify-center">
              <p className="text-gray-500 dark:text-gray-400">
                Select a feedback item to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

interface FilterTabProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  highlight?: boolean;
}

function FilterTab({ label, count, active, onClick, highlight }: FilterTabProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 text-sm rounded-lg transition-colors
        ${active
          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }
      `}
    >
      {label}
      {count > 0 && (
        <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
          highlight && !active
            ? 'bg-orange-500 text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
