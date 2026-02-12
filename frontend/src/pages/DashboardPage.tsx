import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { activitiesAPI, goalsAPI, trainingPlanAPI, profileAPI } from '../services/api';
import { Activity, Goal, UserProfile } from '../types';
import { format, differenceInDays, differenceInWeeks } from 'date-fns';
import { RefreshCw, Calendar, Clock, Target, TrendingUp, Activity as ActivityIcon, MapPin, Zap, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { AlertDashboard } from '../components/training/AlertDashboard';
import { HRZoneChart } from '../components/training/HRZoneChart';
import { TrainingVolumeChart, WeeklyVolumeData } from '../components/training/TrainingVolumeChart';
import { usePreferences } from '../context/PreferencesContext';
import { getRunningQuote } from '../utils/runningQuotes';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { DashboardSettings, useDashboardVisibility } from '../components/DashboardSettings';
import ErrorDisplay, { InlineError, LoadingDisplay } from '../components/ErrorDisplay';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { visibility, updateVisibility } = useDashboardVisibility();
  const { preferences, chartPreferences, updateChartPreferences, convertDistance, distanceUnit, convertPace, paceUnit } = usePreferences();
  const [quote, setQuote] = React.useState(() => getRunningQuote());

  // Refresh quote every 3 hours
  React.useEffect(() => {
    const interval = setInterval(() => {
      setQuote(getRunningQuote());
    }, 3 * 60 * 60 * 1000); // 3 hours

    return () => clearInterval(interval);
  }, []);

  const { data: activitiesData, isLoading: activitiesLoading, error: activitiesError, refetch } = useQuery({
    queryKey: ['activities'],
    queryFn: async () => {
      const response = await activitiesAPI.getActivities({ limit: 10 });
      return response.data.activities as Activity[];
    },
    retry: 2,
    retryDelay: 1000,
  });

  const { data: statsData, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await activitiesAPI.getStats(30);
      return response.data.stats;
    },
    retry: 2,
    retryDelay: 1000,
  });

  const { data: goalsData, error: goalsError, refetch: refetchGoals } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const response = await goalsAPI.getGoals();
      return response.data.goals as Goal[];
    },
    retry: 2,
    retryDelay: 1000,
  });

  const { data: hrZonesData, error: hrZonesError, refetch: refetchHRZones } = useQuery({
    queryKey: ['hrZones'],
    queryFn: async () => {
      const response = await activitiesAPI.getHRZones(30);
      return response.data.hrZones;
    },
    retry: 2,
    retryDelay: 1000,
  });

  const { data: upcomingWorkouts, error: workoutsError } = useQuery({
    queryKey: ['upcomingWorkouts'],
    queryFn: async () => {
      const response = await trainingPlanAPI.getWorkouts({ days: 7 });
      return response.data.workouts || [];
    },
    retry: 2,
    retryDelay: 1000,
  });

  const { data: profileData, error: profileError } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await profileAPI.getProfile();
      return response.data.profile as UserProfile | null;
    },
    retry: 2,
    retryDelay: 1000,
  });

  const { data: weeklyVolumeData, error: weeklyVolumeError, refetch: refetchWeeklyVolume } = useQuery({
    queryKey: ['weeklyVolume', chartPreferences.historicalWeeks, chartPreferences.futureWeeks, preferences.weekStartsOn],
    queryFn: async () => {
      const response = await activitiesAPI.getWeeklyVolume({
        weeks: chartPreferences.historicalWeeks,
        includePlanned: true,
        futureWeeks: chartPreferences.futureWeeks,
        weekStartsOn: preferences.weekStartsOn,
      });
      return response.data.weeklyData as WeeklyVolumeData[];
    },
    retry: 2,
    retryDelay: 1000,
  });

  const handleChartPreferencesChange = async (newPrefs: Partial<typeof chartPreferences>) => {
    await updateChartPreferences(newPrefs);
  };

  // Calculate current month stats
  const monthlyStats = React.useMemo(() => {
    if (!activitiesData) return { distance: '0', runs: 0 };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthActivities = activitiesData.filter((activity: Activity) => {
      const activityDate = new Date(activity.start_date);
      return activityDate >= startOfMonth && activityDate <= now;
    });

    const totalDistance = monthActivities.reduce((sum: number, activity: Activity) => {
      const distance = activity.distance_meters ? parseFloat(String(activity.distance_meters)) : 0;
      return sum + (isNaN(distance) ? 0 : distance);
    }, 0);

    return {
      distance: convertDistance(totalDistance),
      runs: monthActivities.length,
    };
  }, [activitiesData, convertDistance]);

  const handleSync = async () => {
    const loadingToast = toast.loading('Syncing activities...');
    try {
      const response = await activitiesAPI.syncActivities();
      await Promise.all([refetch(), refetchStats(), refetchGoals(), refetchHRZones()]);
      toast.dismiss(loadingToast);
      toast.success(`${response.data.count} activities synced successfully`);
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Failed to sync activities');
    }
  };

  const formatPace = (avgSpeed?: number) => {
    if (!avgSpeed) return 'N/A';
    const speed = Number(avgSpeed);
    const paceMinPerKm = 1000 / (speed * 60);
    return `${convertPace(paceMinPerKm)} /${paceUnit.replace('min/', '')}`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const activeGoal = goalsData?.find((g: Goal) => g.is_active);

  // Format goal time for display
  const formatGoalTime = (seconds?: number) => {
    if (!seconds) return 'No Time Goal';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `Sub ${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate countdown
  const getCountdown = () => {
    if (!activeGoal?.target_date) return null;
    const targetDate = new Date(activeGoal.target_date);
    const today = new Date();
    const totalDays = differenceInDays(targetDate, today);
    const weeks = differenceInWeeks(targetDate, today);
    const days = totalDays - (weeks * 7);
    return { weeks, days, totalDays };
  };

  const countdown = getCountdown();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Dashboard</h1>
        <div className="flex items-center gap-3">
          <DashboardSettings visibility={visibility} onChange={updateVisibility} />
          <button onClick={handleSync} className="btn btn-primary flex items-center gap-2">
            <RefreshCw size={16} />
            Sync Strava
          </button>
        </div>
      </div>

      {/* Race Goal & Training Progress Banner */}
      {((visibility.marathonGoal && activeGoal && countdown) || (visibility.trainingBlock && profileData?.training_block_start && profileData?.training_block_end)) && (
        <CollapsibleCard
          id="race-training-banner"
          title="Race Goal & Training Progress"
          className="bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 text-white border-none shadow-xl"
          headerClassName="text-white"
        >
          {/* Marathon Goal Section */}
          {activeGoal && countdown && (
            <div className="flex items-center justify-between mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Target size={24} />
                  <p className="text-2xl font-bold">{formatGoalTime(activeGoal.target_time_seconds)}</p>
                </div>
                <p className="text-lg opacity-90">
                  {activeGoal.race_name || 'Marathon'} • {format(new Date(activeGoal.target_date!), 'MMMM dd, yyyy')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-6xl font-bold">{countdown.weeks}</p>
                <p className="text-xl">weeks</p>
                <p className="text-4xl font-bold mt-2">{countdown.days}</p>
                <p className="text-lg">days</p>
                <p className="text-sm opacity-75 mt-2">{countdown.totalDays} days total</p>
              </div>
            </div>
          )}

          {/* Training Block Progress */}
          {profileData?.training_block_start && profileData?.training_block_end && (() => {
            const start = new Date(profileData.training_block_start).getTime();
            const end = new Date(profileData.training_block_end).getTime();
            const now = Date.now();
            const total = end - start;
            const elapsed = now - start;
            const percentage = Math.min(Math.max((elapsed / total) * 100, 0), 100);
            const totalDays = Math.ceil(total / (1000 * 60 * 60 * 24));
            const daysElapsed = Math.ceil(elapsed / (1000 * 60 * 60 * 24));
            const daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

            return (
              <div className={activeGoal && countdown ? "pt-6 border-t border-white/30" : ""}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold opacity-90">Training Block Progress</p>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-bold">
                      {percentage.toFixed(0)}%
                    </p>
                    <p className="text-sm opacity-75">
                      Day {daysElapsed} of {totalDays}
                    </p>
                  </div>
                </div>
                <div className="bg-white/20 rounded-full h-6 overflow-hidden mb-2">
                  <div
                    className="bg-white h-6 rounded-full transition-all duration-500 flex items-center justify-center"
                    style={{ width: `${percentage}%` }}
                  >
                    {percentage > 10 && (
                      <span className="text-xs font-bold text-orange-600">
                        {percentage.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs opacity-75">
                  <span>{new Date(profileData.training_block_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span className="font-semibold">
                    {daysRemaining > 0 ? `${daysRemaining} days left` : 'Complete! 🎉'}
                  </span>
                  <span>{new Date(profileData.training_block_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
            );
          })()}

          {/* Final Stretch Alert */}
          {countdown && countdown.totalDays < 90 && (
            <div className="mt-4 p-3 bg-white/20 rounded-lg">
              <p className="text-sm">
                🏃 You're in the final stretch! Keep focusing on your training plan.
              </p>
            </div>
          )}

          {/* Inspirational Quote */}
          <div className="mt-4 pt-4 border-t border-white/30">
            <p className="text-sm italic opacity-90">
              "{quote}"
            </p>
          </div>
        </CollapsibleCard>
      )}

      {/* Training Alerts */}
      {visibility.alerts && (
        <CollapsibleCard id="alerts" title="Training Alerts">
          <AlertDashboard />
        </CollapsibleCard>
      )}

      {/* Upcoming Workouts */}
      {visibility.upcomingWorkouts && (
        <CollapsibleCard id="upcoming-workouts" title="Upcoming Workouts (Next 7 Days)">
          {workoutsError ? (
            <InlineError
              message="Failed to load upcoming workouts"
              onRetry={() => window.location.reload()}
            />
          ) : upcomingWorkouts && upcomingWorkouts.length > 0 ? (
          <>
            <div className="space-y-3">
              {upcomingWorkouts.slice(0, 5).map((workout: any) => (
                <div
                  key={workout.id}
                  className="card-subtle"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {workout.name || workout.workout_type}
                      </h3>
                      <p className="text-sm text-secondary">
                        {format(new Date(workout.scheduled_date), 'EEEE, MMM dd')}
                      </p>
                    </div>
                    <div className="text-right">
                      {workout.target_distance_meters && (
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {convertDistance(workout.target_distance_meters)} {distanceUnit}
                        </p>
                      )}
                      {workout.target_hr_zone && (
                        <p className="text-sm text-secondary">
                          Zone {workout.target_hr_zone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/training')}
              className="w-full mt-4 btn btn-secondary"
            >
              View Full Calendar
            </button>
          </>
          ) : (
            <p className="text-secondary text-center py-4">No upcoming workouts in the next 7 days</p>
          )}
        </CollapsibleCard>
      )}

      {/* Stats Cards */}
      {visibility.statsCards && (
        <CollapsibleCard id="stats" title="Statistics">
          {statsError && (
            <div className="mb-4">
              <InlineError
                message="Failed to load statistics"
                onRetry={() => refetchStats()}
              />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* This Month */}
            <div className="card-stat group">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-medium text-secondary">This Month</p>
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUp className="text-green-600 dark:text-green-400" size={20} />
                </div>
              </div>
              <p className="text-stat-lg text-green-600 dark:text-green-400 mb-1">
                {monthlyStats.distance}
              </p>
              <p className="text-body-sm text-secondary">
                {distanceUnit} • {monthlyStats.runs} {monthlyStats.runs === 1 ? 'run' : 'runs'}
              </p>
            </div>

            {/* Total Distance (30d) */}
            <div className="card-stat group">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-medium text-secondary">Total Distance (30d)</p>
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <MapPin className="text-blue-600 dark:text-blue-400" size={20} />
                </div>
              </div>
              <p className="text-stat-lg text-brand-orange dark:text-brand-orange mb-1">
                {statsData ? convertDistance(parseFloat(statsData.total_distance)) : '0'}
              </p>
              <p className="text-body-sm text-secondary">{distanceUnit}</p>
            </div>

            {/* Total Runs (30d) */}
            <div className="card-stat group">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-medium text-secondary">Total Runs (30d)</p>
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <ActivityIcon className="text-brand-orange dark:text-brand-orange" size={20} />
                </div>
              </div>
              <p className="text-stat-lg text-brand-orange dark:text-brand-orange mb-1">
                {statsData?.total_runs || 0}
              </p>
              <p className="text-body-sm text-secondary">activities</p>
            </div>

            {/* Avg Pace (30d) */}
            <div className="card-stat group">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-medium text-secondary">Avg Pace (30d)</p>
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Zap className="text-purple-600 dark:text-purple-400" size={20} />
                </div>
              </div>
              <p className="text-stat text-purple-600 dark:text-purple-400 mb-1">
                {statsData?.avg_speed ? formatPace(parseFloat(statsData.avg_speed)) : 'N/A'}
              </p>
              <p className="text-body-sm text-secondary">per {distanceUnit}</p>
            </div>
          </div>
        </CollapsibleCard>
      )}

      {/* HR Zone Distribution */}
      {visibility.hrZones && (
        <CollapsibleCard id="hr-zones" title="Heart Rate Zones">
          {hrZonesError ? (
            <InlineError
              message="Failed to load heart rate zones"
              onRetry={() => refetchHRZones()}
            />
          ) : (
            <HRZoneChart data={hrZonesData || null} />
          )}
        </CollapsibleCard>
      )}

      {/* Weekly Training Volume */}
      {visibility.trainingVolume && (
        <CollapsibleCard id="training-volume" title="Weekly Training Volume">
          {weeklyVolumeError ? (
            <InlineError
              message="Failed to load training volume data"
              onRetry={() => refetchWeeklyVolume()}
            />
          ) : (
            <TrainingVolumeChart
              data={weeklyVolumeData || []}
              distanceUnit={distanceUnit}
              chartPreferences={chartPreferences}
              onPreferencesChange={handleChartPreferencesChange}
            />
          )}
        </CollapsibleCard>
      )}

      {/* Recent Activities */}
      {visibility.recentActivities && (
        <CollapsibleCard id="recent-activities" title="Recent Activities">
        {activitiesLoading ? (
          <LoadingDisplay message="Loading activities..." />
        ) : activitiesError ? (
          <ErrorDisplay
            error={activitiesError as Error}
            title="Failed to Load Activities"
            message="Unable to load your recent activities. Please try syncing with Strava."
            onRetry={() => refetch()}
            type={(activitiesError as any).message?.includes('Network') || (activitiesError as any).message?.includes('fetch') ? 'network' : 'general'}
          />
        ) : activitiesData && activitiesData.length > 0 ? (
          <div className="space-y-3">
            {activitiesData.map((activity) => (
              <button
                key={activity.id}
                onClick={() => navigate(`/activity/${activity.id}`)}
                className="w-full card-stat group p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-heading-xs mb-2 text-neutral-900 dark:text-neutral-100">
                      {activity.name || 'Run'}
                    </h3>
                    <div className="flex gap-3 text-body-sm text-secondary">
                      <span className="flex items-center gap-1.5">
                        <Calendar size={14} />
                        {format(new Date(activity.start_date), 'MMM dd, yyyy')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={14} />
                        {formatDuration(activity.moving_time_seconds)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-6">
                    <p className="text-stat text-brand-orange dark:text-brand-orange">
                      {activity.distance_meters ? convertDistance(activity.distance_meters, 2) : '0'}
                    </p>
                    <p className="text-body-sm text-secondary">
                      {distanceUnit} • {formatPace(activity.average_speed)}
                    </p>
                  </div>
                  <ChevronRight
                    size={20}
                    className="ml-4 text-neutral-400 group-hover:text-brand-orange transition-colors"
                  />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-secondary mb-4">No activities found. Click "Sync Strava" to load your runs.</p>
            <button onClick={handleSync} className="btn btn-primary">
              Sync Activities
            </button>
          </div>
        )}
        </CollapsibleCard>
      )}
    </div>
  );
}
