/**
 * HR Analysis Card
 *
 * Displays heart rate metrics including zone distribution, drift, and effort calibration.
 */

import React from 'react';
import { Heart, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { Tooltip, METRIC_TOOLTIPS } from '../common/Tooltip';

interface HRAnalysisProps {
  avgZone: number;
  zoneDrift: number;
  effortMismatch: boolean;
  driftRate: number;
  avgHR: number;
  maxHR: number;
}

export const HRAnalysisCard: React.FC<HRAnalysisProps> = ({
  avgZone,
  zoneDrift,
  effortMismatch,
  driftRate,
  avgHR,
  maxHR,
}) => {
  // Zone configuration
  const getZoneConfig = (zone: number) => {
    if (zone < 1.5) return { label: 'Zone 1', color: 'bg-blue-500', desc: 'Recovery' };
    if (zone < 2.5) return { label: 'Zone 2', color: 'bg-green-500', desc: 'Easy/Aerobic' };
    if (zone < 3.5) return { label: 'Zone 3', color: 'bg-yellow-500', desc: 'Moderate' };
    if (zone < 4.5) return { label: 'Zone 4', color: 'bg-orange-500', desc: 'Hard/Threshold' };
    return { label: 'Zone 5', color: 'bg-red-500', desc: 'Maximum' };
  };

  const zoneConfig = getZoneConfig(Number(avgZone));

  // Drift assessment
  const getDriftStatus = (rate: number) => {
    if (rate < 2) return { label: 'Minimal', color: 'text-green-600 dark:text-green-400', status: 'good' };
    if (rate < 5) return { label: 'Moderate', color: 'text-amber-600 dark:text-amber-400', status: 'caution' };
    return { label: 'High', color: 'text-red-600 dark:text-red-400', status: 'warning' };
  };

  const driftStatus = getDriftStatus(Number(driftRate));

  // Zone stability (inverse of drift)
  const zoneStability = Math.max(0, 100 - Number(zoneDrift));

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          Heart Rate Analysis
        </h3>
      </div>

      {/* Average Zone Display */}
      <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg mb-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-sm text-secondary">Average Zone</p>
            <Tooltip content={METRIC_TOOLTIPS.avgZone} position="right" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {Number(avgZone).toFixed(1)}
            </span>
            <span className="text-sm text-secondary">({zoneConfig.desc})</span>
          </div>
        </div>
        <div className={`w-12 h-12 rounded-full ${zoneConfig.color} flex items-center justify-center text-white font-bold`}>
          Z{Math.round(Number(avgZone))}
        </div>
      </div>

      {/* Effort Mismatch Warning */}
      {effortMismatch && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Effort Mismatch Detected
              </p>
              <Tooltip content={METRIC_TOOLTIPS.effortMismatch} position="right" />
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              HR was too high for an easy-paced run. Consider slowing down.
            </p>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3">
          <p className="text-xs text-secondary uppercase tracking-wide mb-1">Avg HR</p>
          <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
            {Number(avgHR) > 0 ? Number(avgHR).toFixed(0) : '--'} <span className="text-sm font-normal text-secondary">bpm</span>
          </p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3">
          <p className="text-xs text-secondary uppercase tracking-wide mb-1">Max HR</p>
          <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
            {Number(maxHR) > 0 ? Number(maxHR).toFixed(0) : '--'} <span className="text-sm font-normal text-secondary">bpm</span>
          </p>
        </div>
      </div>

      {/* HR Drift */}
      <div className="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-neutral-500" />
            <span className="text-sm text-secondary">HR Drift</span>
            <Tooltip content={METRIC_TOOLTIPS.hrDrift} position="right" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${driftStatus.color}`}>
              {Number(driftRate).toFixed(1)} bpm/km
            </span>
            {driftStatus.status === 'good' && (
              <CheckCircle className="w-4 h-4 text-green-500" />
            )}
            {driftStatus.status === 'warning' && (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            )}
          </div>
        </div>

        {/* Zone Stability */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-secondary">Zone Stability</span>
          <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  zoneStability >= 70 ? 'bg-green-500' :
                  zoneStability >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${zoneStability}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {zoneStability.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Drift Explanation */}
      {Number(driftRate) >= 5 && (
        <p className="text-xs text-secondary mt-3 italic">
          High HR drift suggests fatigue or pacing issues. Consider starting easier.
        </p>
      )}
    </div>
  );
};

export default HRAnalysisCard;
