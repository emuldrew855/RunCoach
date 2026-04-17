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
  // Actual activity values for context
  actualDistanceMeters?: number;
  actualPaceSecondsPerKm?: number;
}

// Format pace from seconds to M:SS string
const formatPace = (secondsPerKm: number): string => {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const ComplianceCard: React.FC<ComplianceProps> = ({
  completedAsPlanned,
  distanceDeviation,
  paceDeviation,
  modifications,
  plannedWorkout,
  actualDistanceMeters,
  actualPaceSecondsPerKm,
}) => {
  // Get planned and actual values for display (must be defined first for status config)
  const getDistanceValues = () => {
    const planned = plannedWorkout?.target_distance_meters
      ? (plannedWorkout.target_distance_meters / 1000).toFixed(1)
      : null;
    const actual = actualDistanceMeters
      ? (actualDistanceMeters / 1000).toFixed(1)
      : null;
    return { planned, actual, unit: 'km' };
  };

  const getPaceValues = () => {
    // Show target pace range if available
    const targetMin = plannedWorkout?.target_pace_min; // min/km (faster pace = lower number)
    const targetMax = plannedWorkout?.target_pace_max; // min/km (slower pace = higher number)
    let planned: string | null = null;

    if (targetMin && targetMax && targetMin !== targetMax) {
      planned = `${formatPace(targetMin * 60)} - ${formatPace(targetMax * 60)}`;
    } else if (targetMin) {
      planned = formatPace(targetMin * 60);
    } else if (targetMax) {
      planned = formatPace(targetMax * 60);
    }

    const actual = actualPaceSecondsPerKm
      ? formatPace(actualPaceSecondsPerKm)
      : null;

    // Determine if pace is within target range
    let paceStatus: 'on_target' | 'too_fast' | 'too_slow' | 'unknown' = 'unknown';
    if (actualPaceSecondsPerKm && (targetMin || targetMax)) {
      const actualPaceMinKm = actualPaceSecondsPerKm / 60; // Convert to min/km
      const effectiveMin = targetMin || (targetMax! - 0.5);
      const effectiveMax = targetMax || (targetMin! + 0.5);

      if (actualPaceMinKm >= effectiveMin - 0.05 && actualPaceMinKm <= effectiveMax + 0.05) {
        paceStatus = 'on_target'; // Within range (with 3 sec tolerance)
      } else if (actualPaceMinKm < effectiveMin - 0.05) {
        paceStatus = 'too_fast'; // Faster than target (lower pace number)
      } else {
        paceStatus = 'too_slow'; // Slower than target (higher pace number)
      }
    }

    return { planned, actual, unit: '/km', paceStatus };
  };

  const distanceValues = getDistanceValues();
  const paceValues = getPaceValues();

  // Status configuration - use actual pace comparison, not just percentage
  const getStatusConfig = () => {
    const paceStatus = paceValues.paceStatus;
    const distanceOnTarget = Math.abs(distanceDeviation) <= 10;

    // Both distance and pace on target
    if (distanceOnTarget && paceStatus === 'on_target') {
      return {
        label: 'Met',
        icon: CheckCircle,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        borderColor: 'border-green-500',
      };
    }

    // Close - either distance or pace slightly off
    if ((distanceOnTarget || Math.abs(distanceDeviation) <= 15) &&
        (paceStatus === 'on_target' || paceStatus === 'too_fast' || paceStatus === 'unknown')) {
      return {
        label: 'Close',
        icon: AlertTriangle,
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        borderColor: 'border-amber-500',
      };
    }

    // Missed - pace too slow or significant distance deviation
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

  // Deviation indicator with actual vs planned context
  const DeviationIndicator: React.FC<{
    value: number;
    label: string;
    actual?: string | null;
    planned?: string | null;
    unit?: string;
    // For pace, use explicit status instead of percentage
    explicitStatus?: 'on_target' | 'too_fast' | 'too_slow' | 'unknown';
  }> = ({ value, label, actual, planned, unit = '', explicitStatus }) => {
    const isOver = value > 0;
    const absValue = Math.abs(value);

    let color = 'text-green-600 dark:text-green-400';
    let Icon = CheckCircle;
    let statusText = 'On target';

    // Use explicit status for pace comparisons (more accurate than %)
    if (explicitStatus) {
      if (explicitStatus === 'on_target') {
        color = 'text-green-600 dark:text-green-400';
        Icon = CheckCircle;
        statusText = 'On target';
      } else if (explicitStatus === 'too_fast') {
        color = 'text-amber-600 dark:text-amber-400';
        Icon = ArrowUp;
        statusText = 'Too fast';
      } else if (explicitStatus === 'too_slow') {
        color = 'text-red-600 dark:text-red-400';
        Icon = ArrowDown;
        statusText = 'Too slow';
      } else {
        color = 'text-neutral-500';
        Icon = Minus;
        statusText = 'No target';
      }
    } else {
      // Use percentage-based status for distance
      if (absValue > 20) {
        color = 'text-red-600 dark:text-red-400';
        Icon = isOver ? ArrowUp : ArrowDown;
        statusText = isOver ? 'Well over' : 'Well under';
      } else if (absValue > 10) {
        color = 'text-amber-600 dark:text-amber-400';
        Icon = isOver ? ArrowUp : ArrowDown;
        statusText = isOver ? 'Over target' : 'Under target';
      } else {
        color = 'text-green-600 dark:text-green-400';
        Icon = CheckCircle;
        statusText = 'On target';
      }
    }

    return (
      <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-secondary uppercase tracking-wide">{label}</span>
          <div className="flex items-center gap-1">
            <Icon className={`w-3.5 h-3.5 ${color}`} />
            <span className={`text-xs font-medium ${color}`}>{statusText}</span>
          </div>
        </div>
        {actual && planned ? (
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {actual}
              </span>
              <span className="text-xs text-secondary ml-1">{unit}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-secondary">vs </span>
              <span className="text-sm text-secondary">{planned}{unit}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className={`text-lg font-semibold ${color}`}>
              {isOver ? '+' : ''}{value.toFixed(1)}%
            </span>
          </div>
        )}
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

      {/* Deviations - now with actual vs planned context */}
      <div className="space-y-3">
        <DeviationIndicator
          value={distanceDeviation}
          label="Distance"
          actual={distanceValues.actual}
          planned={distanceValues.planned}
          unit={distanceValues.unit}
        />
        <DeviationIndicator
          value={paceDeviation}
          label="Pace"
          actual={paceValues.actual}
          planned={paceValues.planned}
          unit={paceValues.unit}
          explicitStatus={paceValues.paceStatus}
        />
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

      {/* Success Message - only show if actually on target */}
      {statusConfig.label === 'Met' && (
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
