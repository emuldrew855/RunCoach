/**
 * Pacing Analysis Card
 *
 * Displays pacing metrics including consistency, splits, and fade analysis.
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { Tooltip, METRIC_TOOLTIPS } from '../common/Tooltip';

interface PacingAnalysisProps {
  paceDelta: number;
  consistency: number;
  splitAnalysis: {
    fastestKm: { km: number; pace: number };
    slowestKm: { km: number; pace: number };
    fadePoint?: number;
  };
}

export const PacingAnalysisCard: React.FC<PacingAnalysisProps> = ({
  paceDelta,
  consistency,
  splitAnalysis,
}) => {
  // Format pace (decimal min/km to MM:SS)
  const formatPace = (pace: number): string => {
    if (!pace || pace === 0) return '--:--';
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Determine split type
  const getSplitConfig = (delta: number) => {
    if (delta > 2) {
      return {
        label: 'Negative Split',
        description: 'Second half faster',
        icon: TrendingUp,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
      };
    }
    if (delta < -2) {
      return {
        label: 'Positive Split',
        description: 'Second half slower',
        icon: TrendingDown,
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      };
    }
    return {
      label: 'Even Split',
      description: 'Consistent pacing',
      icon: Minus,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    };
  };

  const splitConfig = getSplitConfig(paceDelta);
  const SplitIcon = splitConfig.icon;

  // Consistency assessment
  const getConsistencyLabel = (score: number) => {
    if (score >= 0.9) return { label: 'Excellent', color: 'text-green-600 dark:text-green-400' };
    if (score >= 0.75) return { label: 'Good', color: 'text-blue-600 dark:text-blue-400' };
    if (score >= 0.6) return { label: 'Fair', color: 'text-amber-600 dark:text-amber-400' };
    return { label: 'Variable', color: 'text-red-600 dark:text-red-400' };
  };

  const consistencyConfig = getConsistencyLabel(consistency);

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          Pacing Analysis
        </h3>
      </div>

      {/* Split Type Indicator */}
      <div className={`flex items-center gap-3 p-4 rounded-lg mb-4 ${splitConfig.bgColor}`}>
        <div className={`w-10 h-10 rounded-full bg-white dark:bg-neutral-800 flex items-center justify-center`}>
          <SplitIcon className={`w-5 h-5 ${splitConfig.color}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <p className={`font-semibold ${splitConfig.color}`}>{splitConfig.label}</p>
            <Tooltip content={METRIC_TOOLTIPS.paceDelta} position="right" />
          </div>
          <p className="text-sm text-secondary">
            {Math.abs(paceDelta).toFixed(1)}% {splitConfig.description.toLowerCase()}
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="space-y-3">
        {/* Consistency */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-secondary">Pace Consistency</span>
            <Tooltip content={METRIC_TOOLTIPS.paceConsistency} position="right" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  consistency >= 0.9 ? 'bg-green-500' :
                  consistency >= 0.75 ? 'bg-blue-500' :
                  consistency >= 0.6 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${consistency * 100}%` }}
              />
            </div>
            <span className={`text-sm font-semibold ${consistencyConfig.color}`}>
              {(consistency * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Fastest/Slowest KM */}
        {splitAnalysis.fastestKm.pace > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">
                Fastest KM
              </p>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                KM {splitAnalysis.fastestKm.km}
              </p>
              <p className="text-sm text-secondary">
                {formatPace(splitAnalysis.fastestKm.pace)} /km
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              <p className="text-xs text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">
                Slowest KM
              </p>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                KM {splitAnalysis.slowestKm.km}
              </p>
              <p className="text-sm text-secondary">
                {formatPace(splitAnalysis.slowestKm.pace)} /km
              </p>
            </div>
          </div>
        )}

        {/* Fade Point Warning */}
        {splitAnalysis.fadePoint && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              Pace began fading at KM {splitAnalysis.fadePoint}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PacingAnalysisCard;
