import { useQuery } from '@tanstack/react-query';
import { activitiesAPI, goalsAPI } from '../services/api';
import { Activity, Goal } from '../types';
import { format } from 'date-fns';
import { RefreshCw, Calendar, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const { data: activitiesData, isLoading: activitiesLoading, refetch } = useQuery({
    queryKey: ['activities'],
    queryFn: async () => {
      const response = await activitiesAPI.getActivities({ limit: 10 });
      return response.data.activities as Activity[];
    },
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await activitiesAPI.getStats(30);
      return response.data.stats;
    },
  });

  const { data: goalsData, refetch: refetchGoals } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const response = await goalsAPI.getGoals();
      return response.data.goals as Goal[];
    },
  });

  const handleSync = async () => {
    const loadingToast = toast.loading('Syncing activities...');
    try {
      const response = await activitiesAPI.syncActivities();
      await Promise.all([refetch(), refetchStats(), refetchGoals()]);
      toast.dismiss(loadingToast);
      toast.success(`${response.data.count} activities synced successfully`);
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Failed to sync activities');
    }
  };

  const formatPace = (avgSpeed?: number) => {
    if (!avgSpeed) return 'N/A';
    const paceMinPerKm = 1000 / (avgSpeed * 60);
    const mins = Math.floor(paceMinPerKm);
    const secs = Math.round((paceMinPerKm - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')} /km`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const activeGoal = goalsData?.find((g: Goal) => g.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <button onClick={handleSync} className="btn btn-primary flex items-center gap-2">
          <RefreshCw size={16} />
          Sync Strava
        </button>
      </div>

      {activeGoal && (
        <div className="card bg-gradient-to-r from-orange-500 to-red-500 text-white">
          <h2 className="text-xl font-bold mb-2">Current Goal</h2>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-2xl font-bold">{activeGoal.goal_type}</p>
              <p className="opacity-90">
                {activeGoal.target_time_seconds &&
                  `Target: ${Math.floor(activeGoal.target_time_seconds / 3600)}h ${Math.floor((activeGoal.target_time_seconds % 3600) / 60)}m`
                }
              </p>
            </div>
            {activeGoal.target_date && (
              <div className="ml-auto text-right">
                <p className="text-sm opacity-90">Race Date</p>
                <p className="text-lg font-bold">{format(new Date(activeGoal.target_date), 'MMM dd, yyyy')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Total Distance (30d)</p>
          <p className="text-3xl font-bold text-strava">
            {statsData ? (parseFloat(statsData.total_distance) / 1000).toFixed(1) : '0'} km
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Total Runs (30d)</p>
          <p className="text-3xl font-bold text-strava">
            {statsData?.total_runs || 0}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Avg Pace (30d)</p>
          <p className="text-3xl font-bold text-strava">
            {statsData?.avg_speed ? formatPace(parseFloat(statsData.avg_speed)) : 'N/A'}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">Recent Activities</h2>
        {activitiesLoading ? (
          <p>Loading activities...</p>
        ) : activitiesData && activitiesData.length > 0 ? (
          <div className="space-y-3">
            {activitiesData.map((activity) => (
              <div key={activity.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{activity.name || 'Run'}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {format(new Date(activity.start_date), 'MMM dd, yyyy')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {formatDuration(activity.moving_time_seconds)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-strava">
                      {activity.distance_meters ? (activity.distance_meters / 1000).toFixed(2) : '0'} km
                    </p>
                    <p className="text-sm text-gray-600">{formatPace(activity.average_speed)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No activities found. Click "Sync Strava" to load your runs.</p>
        )}
      </div>
    </div>
  );
}
