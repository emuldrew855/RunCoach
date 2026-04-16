/**
 * User Detail Page
 *
 * Detailed view of a specific user with impersonation capability.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LogIn, Activity, MessageSquare, Target, CalendarCheck } from 'lucide-react';
import { adminAPI } from '../../services/adminApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminErrorState from '../../components/admin/AdminErrorState';

interface UserDetails {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  strava_id: number;
  profile_picture_url: string;
  created_at: string;
  last_login_at: string;
  is_admin: boolean;
  total_sessions: number;
  avg_session_duration_seconds: number;
  total_page_views: number;
  total_api_calls: number;
  total_activities: number;
  total_chat_messages: number;
  total_training_plans: number;
  total_planned_workouts: number;
  last_activity_date: string | null;
}

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [impersonationReason, setImpersonationReason] = useState('');

  useEffect(() => {
    loadUserDetails();

    // Auto-open impersonation dialog if query param set
    if (searchParams.get('impersonate') === 'true') {
      setShowReasonDialog(true);
    }
  }, [userId, searchParams]);

  async function loadUserDetails() {
    try {
      setLoading(true);
      setError(null);
      const response = await adminAPI.getUserDetails(parseInt(userId!));
      // Backend returns { data: { analytics: {...} } }
      setUser(response.data.data.analytics);
    } catch (err) {
      console.error('Failed to load user details:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleImpersonate() {
    if (impersonationReason.length < 10) {
      alert('Reason must be at least 10 characters');
      return;
    }

    try {
      setImpersonating(true);
      const response = await adminAPI.impersonateUser(parseInt(userId!), impersonationReason);
      const jwt = response.data.data.jwt;

      // Store the new JWT
      localStorage.setItem('jwt', jwt);

      // Redirect to main dashboard as impersonated user
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Failed to impersonate user:', error);
      alert('Failed to impersonate user');
      setImpersonating(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading user details...</div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !user) {
    return (
      <AdminLayout>
        <AdminErrorState
          title="Failed to load user details"
          message={error || 'User not found'}
          onRetry={loadUserDetails}
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
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/users')}
              className="btn btn-secondary flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Users
            </button>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {user.first_name} {user.last_name}
            </h2>
          </div>
          <button
            onClick={() => setShowReasonDialog(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            Impersonate User
          </button>
        </div>

        {/* User Info Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-start gap-6">
            {user.profile_picture_url && (
              <img
                src={user.profile_picture_url}
                alt={`${user.first_name} ${user.last_name}`}
                className="w-24 h-24 rounded-full object-cover"
              />
            )}
            <div className="flex-1 space-y-3">
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">Email</label>
                <p className="text-gray-900 dark:text-gray-100">{user.email}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">Strava ID</label>
                <p className="text-gray-900 dark:text-gray-100">{user.strava_id}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Created</label>
                  <p className="text-gray-900 dark:text-gray-100">
                    {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Last Login</label>
                  <p className="text-gray-900 dark:text-gray-100">
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleDateString()
                      : 'Never'}
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">Admin Status</label>
                <p className="text-gray-900 dark:text-gray-100">
                  {user.is_admin ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                      Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400">
                      User
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="Total Activities"
            value={(user.total_activities || 0).toString()}
          />
          <StatCard
            icon={<MessageSquare className="w-5 h-5" />}
            label="Chat Messages"
            value={(user.total_chat_messages || 0).toString()}
          />
          <StatCard
            icon={<Target className="w-5 h-5" />}
            label="Training Plans"
            value={(user.total_training_plans || 0).toString()}
          />
          <StatCard
            icon={<CalendarCheck className="w-5 h-5" />}
            label="Planned Workouts"
            value={(user.total_planned_workouts || 0).toString()}
          />
        </div>

        {/* Engagement */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Engagement
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">API Calls</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {user.total_api_calls || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Last Activity</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {user.last_activity_date
                  ? new Date(user.last_activity_date).toLocaleDateString()
                  : 'No activities'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Account Age</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24))} days
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Impersonation Reason Dialog */}
      {showReasonDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Impersonate User
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You are about to impersonate <strong>{user.first_name} {user.last_name}</strong>.
              This action will be logged in the audit trail.
            </p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Reason (minimum 10 characters)
            </label>
            <textarea
              value={impersonationReason}
              onChange={(e) => setImpersonationReason(e.target.value)}
              placeholder="e.g., Debugging reported issue with workout sync..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowReasonDialog(false);
                  setImpersonationReason('');
                }}
                disabled={impersonating}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleImpersonate}
                disabled={impersonating || impersonationReason.length < 10}
                className="btn btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {impersonating ? (
                  <>Processing...</>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Impersonate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
