/**
 * Compliance Card
 *
 * Displays plan compliance metrics for a workout.
 * Shows distance and pace deviation from the planned workout.
 */

import React from 'react';
import { ClipboardCheck, CheckCircle, AlertTriangle, XCircle, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface ComplianceProps {
  completedAsPlanned: boolean;
  distanceDeviation: number;
  paceDeviation: number;
  modifications: string[];
  plannedWorkout?: {
    name?: string;
    target_distance_meters?: number;
    target_hr_zone?: number;
    target_pace_min?: number;
    target_pace_max?: number;
  } | null;
}

export const ComplianceCard: React.FC<ComplianceProps> = ({
  completedAsPlanned,
  distanceDeviation,
  paceDeviation,
  modifications,
  plannedWorkout,
}) => {
  // Status configuration
  const getStatusConfig = () => {
    if (completedAsPlanned) {
      return {
        label: 'Met',
        icon: CheckCircle,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        borderColor: 'border-green-500',
      };
    }
    if (Math.abs(distanceDeviation) < 15 && Math.abs(paceDeviation) < 15) {
      return {
        label: 'Close',
        icon: AlertTriangle,
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        borderColor: 'border-amber-500',
      };
    }
    return {
      label: 'Missed',
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      borderColor: 'border-red-500',
    };
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  // Deviation indicator
  const DeviationIndicator: React.FC<{ value: number; label: string }> = ({ value, label }) => {
    const isOver = value > 0;
    const isUnder = value < 0;
    const absValue = Math.abs(value);

    let color = 'text-green-600 dark:text-green-400';
    let Icon = Minus;

    if (absValue > 10) {
      color = 'text-amber-600 dark:text-amber-400';
      Icon = isOver ? ArrowUp : ArrowDown;
    }
    if (absValue > 20) {
      color = 'text-red-600 dark:text-red-400';
    }
    if (absValue <= 5) {
      color = 'text-green-600 dark:text-green-400';
      Icon = CheckCircle;
    }

    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-secondary">{label}</span>
        <div className="flex items-center gap-1">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className={`text-sm font-semibold ${color}`}>
            {isOver ? '+' : ''}{value.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  // If no planned workout, show "unplanned run" message
  if (!plannedWorkout) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Plan Compliance
          </h3>
        </div>

        <div className="flex items-center justify-center py-6 text-center">
          <div>
            <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3">
              <ClipboardCheck className="w-6 h-6 text-neutral-400" />
            </div>
            <p className="text-sm text-secondary">Unplanned Run</p>
            <p className="text-xs text-tertiary mt-1">No workout was scheduled for this activity</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Plan Compliance
          </h3>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${statusConfig.bgColor}`}>
          <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Planned Workout Info */}
      {plannedWorkout.name && (
        <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg mb-4">
          <p className="text-xs text-secondary uppercase tracking-wide mb-1">Planned Workout</p>
          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
            {plannedWorkout.name}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-secondary">
            {plannedWorkout.target_distance_meters && (
              <span>{(plannedWorkout.target_distance_meters / 1000).toFixed(1)} km</span>
            )}
            {plannedWorkout.target_hr_zone && (
              <span>Zone {plannedWorkout.target_hr_zone}</span>
            )}
          </div>
        </div>
      )}

      {/* Deviations */}
      <div className="space-y-3">
        <DeviationIndicator value={distanceDeviation} label="Distance" />
        <DeviationIndicator value={paceDeviation} label="Pace" />
      </div>

      {/* Modifications */}
      {modifications.length > 0 && (
        <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <p className="text-xs text-secondary uppercase tracking-wide mb-2">Modifications</p>
          <div className="flex flex-wrap gap-2">
            {modifications.map((mod, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-1 rounded text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
              >
                {mod}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Success Message */}
      {completedAsPlanned && (
        <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Workout executed as planned</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplianceCard;
