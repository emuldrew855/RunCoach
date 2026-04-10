/**
 * Weekly Execution Card
 *
 * Shows execution accuracy per workout this week.
 * Displays progress bars for each workout with color-coded status.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { CheckCircle, AlertTriangle, XCircle, Clock, Target } from 'lucide-react';
import { coachingAPI } from '../../services/api';
import { usePreferences } from '../../context/PreferencesContext';

interface WorkoutExecution {
  workoutId: number;
  workoutName: string;
  workoutType: string;
  scheduledDate: string;
  activityId: number | null;
  completionStatus: 'completed' | 'pending' | 'skipped';
  executionScore: number | null;
  executionStatus: 'excellent' | 'good' | 'fair' | 'needs_work' | null;
  issue: string | null;
}

interface WeeklyExecutionSummary {
  weekStart: string;
  weekEnd: string;
  avgScore: number;
  workouts: WorkoutExecution[];
  completedCount: number;
  plannedCount: number;
  excellentCount: number;
  issueCount: number;
}

export const WeeklyExecutionCard: React.FC = () => {
  const { convertDistance, distanceUnit } = usePreferences();

  const { data, isLoading, error } = useQuery({
    queryKey: ['weeklyExecution'],
    queryFn: async () => {
      const response = await coachingAPI.getWeeklyExecution();
      return response.data.summary as WeeklyExecutionSummary;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-neutral-400 animate-pulse" />
            <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-40 animate-pulse" />
          </div>
          <div className="h-6 bg-neutral-200 dark:bg-neutral-700 rounded w-20 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null; // Silently fail
  }

  // If no workouts this week, don't show the card
  if (data.workouts.length === 0) {
    return null;
  }

  // Status icon component
  const StatusIcon: React.FC<{ status: WorkoutExecution['executionStatus'] | 'pending' | 'skipped' }> = ({ status }) => {
    switch (status) {
      case 'excellent':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'good':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'fair':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'needs_work':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped':
        return <XCircle className="w-4 h-4 text-neutral-400" />;
      default:
        return <Clock className="w-4 h-4 text-neutral-400" />;
    }
  };

  // Get progress bar color
  const getProgressColor = (score: number | null, status: string) => {
    if (status === 'pending') return 'bg-neutral-200 dark:bg-neutral-700';
    if (status === 'skipped') return 'bg-neutral-300 dark:bg-neutral-600';
    if (!score) return 'bg-neutral-300 dark:bg-neutral-600';
    if (score >= 85) return 'bg-green-500';
    if (score >= 70) return 'bg-blue-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Format day name short
  const formatDay = (dateStr: string) => {
    return format(parseISO(dateStr), 'EEE');
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          <span className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            This Week's Execution
          </span>
        </div>
        {data.completedCount > 0 && (
          <div className={`px-3 py-1 rounded-full ${
            data.avgScore >= 85 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
            data.avgScore >= 70 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
            data.avgScore >= 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
            'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          }`}>
            <span className="text-sm font-semibold">Avg: {data.avgScore}%</span>
          </div>
        )}
      </div>

      {/* Workout List */}
      <div className="space-y-3">
        {data.workouts.map((workout) => {
          const isPending = workout.completionStatus === 'pending';
          const isSkipped = workout.completionStatus === 'skipped';
          const isUpcoming = new Date(workout.scheduledDate) > new Date();

          return (
            <div
              key={workout.workoutId}
              className={`flex items-center gap-3 p-2 rounded-lg ${
                isPending && !isUpcoming ? 'bg-amber-50 dark:bg-amber-900/10' :
                isSkipped ? 'bg-neutral-50 dark:bg-neutral-800/50 opacity-60' :
                'bg-neutral-50 dark:bg-neutral-800/50'
              }`}
            >
              {/* Day */}
              <div className="w-10 text-xs font-medium text-secondary uppercase">
                {formatDay(workout.scheduledDate)}
              </div>

              {/* Workout Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                    {workout.workoutName}
                  </p>
                </div>
                {workout.issue && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 truncate">
                    {workout.issue}
                  </p>
                )}
              </div>

              {/* Progress/Score */}
              <div className="flex items-center gap-2 w-24">
                {isPending && isUpcoming ? (
                  <span className="text-xs text-secondary">(upcoming)</span>
                ) : isSkipped ? (
                  <span className="text-xs text-neutral-400">skipped</span>
                ) : (
                  <>
                    <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getProgressColor(workout.executionScore, workout.completionStatus)}`}
                        style={{ width: `${workout.executionScore || 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-8 text-right text-neutral-900 dark:text-neutral-100">
                      {workout.executionScore !== null ? `${workout.executionScore}%` : '--'}
                    </span>
                  </>
                )}
              </div>

              {/* Status Icon */}
              <StatusIcon status={isPending ? 'pending' : isSkipped ? 'skipped' : workout.executionStatus} />
            </div>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-xs text-secondary">
        <span>{data.completedCount} of {data.plannedCount} workouts completed</span>
        {data.excellentCount > 0 && (
          <span className="text-green-600 dark:text-green-400">
            {data.excellentCount} excellent
          </span>
        )}
      </div>
    </div>
  );
};

export default WeeklyExecutionCard;
