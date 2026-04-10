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
import { CollapsibleCard } from '../components/CollapsibleCard';
import { DashboardSettings, useDashboardVisibility } from '../components/DashboardSettings';
import ErrorDisplay, { InlineError, LoadingDisplay } from '../components/ErrorDisplay';
import { useIsMobile } from '../hooks/useIsMobile';
import { FloatingActionButton } from '../components/mobile/FloatingActionButton';
import { CoachInsightCard } from '../components/coaching/CoachInsightCard';
import { TrainingStatusCard } from '../components/coaching/TrainingStatusCard';
import { WeeklyExecutionCard } from '../components/coaching/WeeklyExecutionCard';

export default function DashboardPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { visibility, updateVisibility } = useDashboardVisibility();
  const { preferences, chartPreferences, updateChartPreferences, convertDistance, distanceUnit, convertPace, paceUnit } = usePreferences();

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
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2 md:gap-3">
          <DashboardSettings visibility={visibility} onChange={updateVisibility} />
          {!isMobile && (
            <button onClick={handleSync} className="btn btn-primary flex items-center gap-2 group">
              <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
              Sync Strava
            </button>
          )}
        </div>
      </div>

      {/* Coach's Note - AI-generated daily insight (TOP PRIORITY) */}
      <CoachInsightCard />

      {/* Training Status Card - "Am I on track?" (PRIMARY) */}
      <TrainingStatusCard />

      {/* Training Alerts */}
      {visibility.alerts && (
        <CollapsibleCard id="alerts" title="Training Alerts">
          <AlertDashboard />
        </CollapsibleCard>
      )}

      {/* Weekly Execution Card - How well am I executing? */}
      <WeeklyExecutionCard />

      {/* Upcoming Workouts (PRIMARY - This Week's Focus) */}
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
              {upcomingWorkouts.slice(0, 5).map((workout: any, index: number) => (
                <div
                  key={workout.id}
                  className="card-subtle relative overflow-hidden group hover:shadow-md transition-all duration-300 border-l-2 border-signal-info/30"
                >
                  <div className="absolute inset-0 bg-signal-info/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded border border-signal-info/30 flex items-center justify-center text-signal-info font-mono text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {workout.name || workout.workout_type}
                        </h3>
                        <p className="text-label text-tertiary">
                          {format(new Date(workout.scheduled_date), 'EEEE, MMM dd')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 rounded border border-neutral-200 dark:border-neutral-700">
                      {workout.target_distance_meters && (
                        <p className="text-data text-neutral-900 dark:text-neutral-100">
                          {convertDistance(workout.target_distance_meters)} {distanceUnit}
                        </p>
                      )}
                      {workout.target_hr_zone && (
                        <p className="text-label-xs text-tertiary uppercase tracking-wide">
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
              className="w-full mt-4 btn btn-secondary group relative overflow-hidden"
            >
              <span className="relative z-10">View Full Calendar</span>
              <div className="absolute inset-0 bg-gradient-to-r from-strava to-orange-600 opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
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
            <div className="card-stat group relative overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer border-l-2 border-signal-success/30">
              <div className="absolute inset-0 bg-signal-success/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-label uppercase tracking-wider text-tertiary">This Month</p>
                  <TrendingUp className="text-signal-success" size={20} strokeWidth={1.5} />
                </div>
                <p className="text-data-xl text-neutral-900 dark:text-neutral-100 mb-2">
                  {monthlyStats.distance}
                </p>
                <p className="text-label-sm text-tertiary uppercase tracking-wide">
                  {distanceUnit} • {monthlyStats.runs} {monthlyStats.runs === 1 ? 'run' : 'runs'}
                </p>
              </div>
            </div>

            {/* Total Distance (30d) */}
            <div className="card-stat group relative overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer border-l-2 border-signal-info/30">
              <div className="absolute inset-0 bg-signal-info/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-label uppercase tracking-wider text-tertiary">Total Distance (30d)</p>
                  <MapPin className="text-signal-info" size={20} strokeWidth={1.5} />
                </div>
                <p className="text-data-xl text-neutral-900 dark:text-neutral-100 mb-2">
                  {statsData ? convertDistance(parseFloat(statsData.total_distance)) : '0'}
                </p>
                <p className="text-label-sm text-tertiary uppercase tracking-wide">{distanceUnit}</p>
              </div>
            </div>

            {/* Total Runs (30d) */}
            <div className="card-stat group relative overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer border-l-2 border-brand-orange/30">
              <div className="absolute inset-0 bg-brand-orange/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-label uppercase tracking-wider text-tertiary">Total Runs (30d)</p>
                  <ActivityIcon className="text-brand-orange" size={20} strokeWidth={1.5} />
                </div>
                <p className="text-data-xl text-neutral-900 dark:text-neutral-100 mb-2">
                  {statsData?.total_runs || 0}
                </p>
                <p className="text-label-sm text-tertiary uppercase tracking-wide">activities</p>
              </div>
            </div>

            {/* Avg Pace (30d) */}
            <div className="card-stat group relative overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer border-l-2 border-signal-caution/30">
              <div className="absolute inset-0 bg-signal-caution/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-label uppercase tracking-wider text-tertiary">Avg Pace (30d)</p>
                  <Zap className="text-signal-caution" size={20} strokeWidth={1.5} />
                </div>
                <p className="text-data-lg text-neutral-900 dark:text-neutral-100 mb-2">
                  {statsData?.avg_speed ? formatPace(parseFloat(statsData.avg_speed)) : 'N/A'}
                </p>
                <p className="text-label-sm text-tertiary uppercase tracking-wide">per {distanceUnit}</p>
              </div>
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

      {/* Race Goal - Compact Card (TERTIARY - lower in hierarchy) */}
      {visibility.marathonGoal && activeGoal && countdown && (
        <div className="card border-l-4 border-strava">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-strava to-orange-600 flex items-center justify-center">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-neutral-900 dark:text-neutral-100">
                  {formatGoalTime(activeGoal.target_time_seconds)}
                </p>
                <p className="text-sm text-secondary">
                  {activeGoal.race_name || 'Marathon'} • {format(new Date(activeGoal.target_date!), 'MMM dd, yyyy')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-strava">{countdown.totalDays}</p>
              <p className="text-xs text-secondary uppercase tracking-wide">days to go</p>
            </div>
          </div>

          {/* Training Block Progress (compact) */}
          {profileData?.training_block_start && profileData?.training_block_end && (() => {
            const start = new Date(profileData.training_block_start).getTime();
            const end = new Date(profileData.training_block_end).getTime();
            const now = Date.now();
            const total = end - start;
            const elapsed = now - start;
            const percentage = Math.min(Math.max((elapsed / total) * 100, 0), 100);

            return (
              <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between text-xs text-secondary mb-1">
                  <span>Training Block</span>
                  <span>{percentage.toFixed(0)}% complete</span>
                </div>
                <div className="bg-neutral-200 dark:bg-neutral-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-strava h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
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
                className="w-full card-stat group p-4 text-left relative overflow-hidden border-l-2 border-brand-orange/30 hover:border-brand-orange transition-all duration-300 hover:shadow-md"
              >
                <div className="absolute inset-0 bg-brand-orange/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded border border-brand-orange/30 flex items-center justify-center text-xl">
                        🏃
                      </div>
                      <h3 className="text-heading-xs text-neutral-900 dark:text-neutral-100 font-semibold">
                        {activity.name || 'Run'}
                      </h3>
                    </div>
                    <div className="flex gap-3 text-label text-tertiary">
                      <span className="flex items-center gap-1.5">
                        <Calendar size={14} strokeWidth={1.5} />
                        {format(new Date(activity.start_date), 'MMM dd, yyyy')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={14} strokeWidth={1.5} />
                        {formatDuration(activity.moving_time_seconds)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-6 bg-neutral-50 dark:bg-neutral-800/50 px-4 py-2 rounded-lg group-hover:shadow-md transition-shadow border border-neutral-200 dark:border-neutral-700">
                    <p className="text-data-lg text-neutral-900 dark:text-neutral-100">
                      {activity.distance_meters ? convertDistance(activity.distance_meters, 2) : '0'}
                    </p>
                    <p className="text-label-sm text-tertiary uppercase tracking-wide">
                      {distanceUnit} • {formatPace(activity.average_speed)}
                    </p>
                  </div>
                  <ChevronRight
                    size={20}
                    className="ml-4 text-neutral-400 group-hover:text-brand-orange group-hover:translate-x-1 transition-all"
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

      {/* Mobile FAB for Sync */}
      {isMobile && (
        <FloatingActionButton
          icon={<RefreshCw size={24} />}
          onClick={handleSync}
          position="bottom-right"
          label="Sync Strava"
        />
      )}
    </div>
  );
}
