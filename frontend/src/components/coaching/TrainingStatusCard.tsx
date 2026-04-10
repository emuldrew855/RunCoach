/**
 * Training Status Card
 *
 * Answers the key question: "Am I on track?"
 * Shows training progress, volume, execution score, and status indicator.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle, AlertTriangle, XCircle, TrendingUp } from 'lucide-react';
import { coachingAPI } from '../../services/api';
import { usePreferences } from '../../context/PreferencesContext';

type TrainingStatus = 'on_track' | 'caution' | 'at_risk';

interface TrainingStatusData {
  status: TrainingStatus;
  weekNumber: number | null;
  totalWeeks: number | null;
  trainingPhase: 'base' | 'build' | 'peak' | 'taper' | null;
  weeksUntilRace: number | null;
  volumeProgress: {
    completed: number;
    planned: number;
    percentage: number;
  };
  executionScore: number | null;
  keyInsight: string;
  statusReasons: string[];
}

export const TrainingStatusCard: React.FC = () => {
  const { distanceUnit, convertDistance } = usePreferences();

  const { data, isLoading, error } = useQuery({
    queryKey: ['trainingStatus'],
    queryFn: async () => {
      const response = await coachingAPI.getTrainingStatus();
      return response.data.status as TrainingStatusData;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-neutral-400 animate-pulse" />
            <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-32 animate-pulse" />
          </div>
          <div className="h-6 bg-neutral-200 dark:bg-neutral-700 rounded w-24 animate-pulse" />
        </div>
        <div className="h-3 bg-neutral-100 dark:bg-neutral-800 rounded w-full animate-pulse mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
          <div className="h-16 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null; // Silently fail - don't show error for optional feature
  }

  // Status configuration
  const statusConfig = {
    on_track: {
      label: 'ON TRACK',
      icon: CheckCircle,
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-700 dark:text-green-400',
      borderColor: 'border-green-500',
      progressColor: 'bg-green-500',
    },
    caution: {
      label: 'CAUTION',
      icon: AlertTriangle,
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      textColor: 'text-amber-700 dark:text-amber-400',
      borderColor: 'border-amber-500',
      progressColor: 'bg-amber-500',
    },
    at_risk: {
      label: 'AT RISK',
      icon: XCircle,
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-700 dark:text-red-400',
      borderColor: 'border-red-500',
      progressColor: 'bg-red-500',
    },
  };

  const config = statusConfig[data.status];
  const StatusIcon = config.icon;

  // Format phase display
  const formatPhase = (phase: string | null) => {
    if (!phase) return null;
    return phase.charAt(0).toUpperCase() + phase.slice(1);
  };

  // Build context line
  const contextParts: string[] = [];
  if (data.weekNumber && data.totalWeeks) {
    contextParts.push(`Week ${data.weekNumber} of ${data.totalWeeks}`);
  }
  if (data.trainingPhase) {
    contextParts.push(`${formatPhase(data.trainingPhase)} Phase`);
  }
  if (data.weeksUntilRace) {
    contextParts.push(`${data.weeksUntilRace} weeks to race`);
  }

  const volumeCompleted = distanceUnit === 'mi'
    ? convertDistance(data.volumeProgress.completed * 1000, 1)
    : data.volumeProgress.completed.toFixed(1);

  const volumePlanned = distanceUnit === 'mi'
    ? convertDistance(data.volumeProgress.planned * 1000, 1)
    : data.volumeProgress.planned.toFixed(1);

  const unitLabel = distanceUnit === 'mi' ? 'mi' : 'km';

  return (
    <div className={`card border-l-4 ${config.borderColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          <span className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Training Status
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${config.bgColor}`}>
          <StatusIcon className={`w-4 h-4 ${config.textColor}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${config.textColor}`}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Context Line */}
      {contextParts.length > 0 && (
        <p className="text-sm text-secondary mb-4">
          {contextParts.join(' \u2022 ')}
        </p>
      )}

      {/* Progress Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Volume Progress */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-medium text-secondary uppercase tracking-wide">Volume</span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {volumeCompleted}/{volumePlanned} {unitLabel}
            </span>
          </div>
          <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${config.progressColor} rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(data.volumeProgress.percentage, 100)}%` }}
            />
          </div>
          <p className="text-xs text-secondary mt-1">{data.volumeProgress.percentage}% complete</p>
        </div>

        {/* Execution Score */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-medium text-secondary uppercase tracking-wide">Execution</span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {data.executionScore !== null ? `${data.executionScore}%` : '--'}
            </span>
          </div>
          <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            {data.executionScore !== null ? (
              <div
                className={`h-full ${
                  data.executionScore >= 85 ? 'bg-green-500' :
                  data.executionScore >= 70 ? 'bg-amber-500' :
                  'bg-red-500'
                } rounded-full transition-all duration-500`}
                style={{ width: `${data.executionScore}%` }}
              />
            ) : (
              <div className="h-full bg-neutral-300 dark:bg-neutral-600 rounded-full w-0" />
            )}
          </div>
          <p className="text-xs text-secondary mt-1">
            {data.executionScore !== null
              ? data.executionScore >= 85 ? 'Excellent' : data.executionScore >= 70 ? 'Good' : 'Needs work'
              : 'No data yet'}
          </p>
        </div>
      </div>

      {/* Key Insight */}
      <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          <span className="font-medium">Key Insight:</span> {data.keyInsight}
        </p>
      </div>
    </div>
  );
};

export default TrainingStatusCard;
