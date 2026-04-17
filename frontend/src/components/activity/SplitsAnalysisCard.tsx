/**
 * Splits Analysis Card
 *
 * Displays detailed per-kilometer analysis with HR correlation,
 * pace breakdown, elevation, and trend analysis.
 */

import React, { useState } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Heart, Mountain, Footprints, RefreshCw, Info } from 'lucide-react';
import { usePreferences } from '../../context/PreferencesContext';

// Tooltip component for explaining technical terms to beginners
// Uses a modal-style centered tooltip for reliable positioning
const InfoTooltip: React.FC<{ text: string; title?: string }> = ({ text, title }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShow(!show);
        }}
        className="ml-1 p-1.5 -m-1 text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 min-w-[32px] min-h-[32px] flex items-center justify-center"
        aria-label="More info"
      >
        <Info className="w-4 h-4" />
      </button>
      {show && (
        <>
          {/* Backdrop - click anywhere to close */}
          <div
            className="fixed inset-0 z-[100] bg-black/30"
            onClick={() => setShow(false)}
          />
          {/* Large centered modal - mobile-friendly with safe area padding */}
          <div className="fixed z-[101] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
            px-5 py-5 sm:px-8 sm:py-6 text-base sm:text-lg text-white bg-neutral-800 dark:bg-neutral-900
            rounded-2xl shadow-2xl w-[calc(100vw-2rem)] sm:w-[500px] max-w-[500px] text-left font-normal
            leading-relaxed border border-neutral-600">
            <div className="flex justify-between items-start gap-3 sm:gap-4">
              <div className="flex-1">
                {title && (
                  <h4 className="font-semibold text-base sm:text-lg mb-2 text-blue-400">{title}</h4>
                )}
                <p className="text-neutral-200 text-sm sm:text-base">{text}</p>
              </div>
              <button
                onClick={() => setShow(false)}
                className="text-neutral-400 hover:text-white flex-shrink-0 p-2 -mr-2 -mt-2 rounded-lg hover:bg-neutral-700 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Types matching backend ProcessedSplitsResult
interface ProcessedSplit {
  km: number;
  distance_start: number;
  distance_end: number;
  duration_seconds: number;
  pace: string;
  pace_seconds_per_km: number;
  avg_hr: number | null;
  min_hr: number | null;
  max_hr: number | null;
  elevation_start: number | null;
  elevation_end: number | null;
  elevation_gain: number;
  elevation_loss: number;
  avg_cadence: number | null;
  intensity_zone: number | null;
  avg_grade: number | null;
  gap_seconds_per_km: number | null; // Grade Adjusted Pace
}

interface SplitsAnalysis {
  fastest_km: { km: number; pace: string; pace_seconds: number } | null;
  slowest_km: { km: number; pace: string; pace_seconds: number } | null;
  avg_pace: string;
  avg_pace_seconds: number;
  positive_split: boolean;
  negative_split: boolean;
  pace_consistency: number;
  hr_drift_percent: number | null;
  hr_drift_context: 'expected' | 'normal' | 'concerning' | null;
  pace_change_percent: number | null;
  aerobic_decoupling: number | null; // GAP-adjusted cardiac drift
  fade_point_km: number | null;
}

interface SplitsAnalysisCardProps {
  splits: ProcessedSplit[];
  analysis: SplitsAnalysis;
  isLoading?: boolean;
  onRecompute?: () => void;
}

const zoneColors: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', label: 'Recovery' },
  2: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', label: 'Easy' },
  3: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400', label: 'Aerobic' },
  4: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', label: 'Threshold' },
  5: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', label: 'VO2 Max' },
};

export const SplitsAnalysisCard: React.FC<SplitsAnalysisCardProps> = ({
  splits,
  analysis,
  isLoading,
  onRecompute,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const { distanceUnit } = usePreferences();
  const isMetric = distanceUnit === 'km';

  // Limit display when not expanded
  const displaySplits = expanded ? splits : splits.slice(0, 5);
  const hasMore = splits.length > 5;

  // Find max pace for relative bar visualization
  const maxPaceSeconds = Math.max(...splits.map(s => s.pace_seconds_per_km));
  const minPaceSeconds = Math.min(...splits.map(s => s.pace_seconds_per_km));
  const avgPaceSeconds = analysis.avg_pace_seconds;

  // Determine split type config
  const getSplitTypeConfig = () => {
    if (analysis.negative_split) {
      return {
        label: 'Negative Split',
        description: 'Second half faster - excellent pacing!',
        icon: TrendingUp,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
      };
    }
    if (analysis.positive_split) {
      return {
        label: 'Positive Split',
        description: 'Second half slower - watch pacing',
        icon: TrendingDown,
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      };
    }
    return {
      label: 'Even Split',
      description: 'Consistent pacing throughout',
      icon: Minus,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    };
  };

  const splitTypeConfig = getSplitTypeConfig();
  const SplitIcon = splitTypeConfig.icon;

  // Calculate pace bar width relative to range
  const getPaceBarWidth = (paceSeconds: number) => {
    // Invert: faster pace = longer bar
    const range = maxPaceSeconds - minPaceSeconds;
    if (range === 0) return 100;
    return Math.round(((maxPaceSeconds - paceSeconds) / range) * 60 + 40); // 40-100% range
  };

  // Get pace bar color based on comparison to average
  const getPaceBarColor = (paceSeconds: number) => {
    const diff = ((paceSeconds - avgPaceSeconds) / avgPaceSeconds) * 100;
    if (diff < -3) return 'bg-green-500'; // Faster than avg
    if (diff > 5) return 'bg-red-400'; // Slower than avg
    return 'bg-blue-500'; // Around avg
  };

  // Convert pace for imperial display
  const formatPaceForUnit = (paceString: string, paceSeconds: number) => {
    if (isMetric) return `${paceString}/km`;
    // Convert to min/mile
    const paceMinPerMile = paceSeconds / 60 * 1.60934;
    const minutes = Math.floor(paceMinPerMile);
    const seconds = Math.round((paceMinPerMile - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
  };

  // Format split label
  const formatSplitLabel = (split: ProcessedSplit) => {
    const isPartial = split.distance_end - split.distance_start < 900;
    if (isMetric) {
      if (isPartial) {
        const meters = Math.round(split.distance_end - split.distance_start);
        return `${split.km} (${meters}m)`;
      }
      return `${split.km}`;
    } else {
      // Show as mile approximation
      const startMile = (split.distance_start / 1609.34).toFixed(1);
      const endMile = (split.distance_end / 1609.34).toFixed(1);
      return `${startMile}-${endMile}`;
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Per-KM Splits
          </h3>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-3 animate-spin" />
            <p className="text-sm text-secondary">Processing split data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Per-KM Splits Analysis
          </h3>
        </div>
        {onRecompute && (
          <button
            onClick={onRecompute}
            className="text-xs text-secondary hover:text-primary transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        )}
      </div>

      {/* Split Type Summary */}
      <div className={`flex items-center gap-3 p-4 rounded-lg mb-4 ${splitTypeConfig.bgColor}`}>
        <div className="w-10 h-10 rounded-full bg-white dark:bg-neutral-800 flex items-center justify-center">
          <SplitIcon className={`w-5 h-5 ${splitTypeConfig.color}`} />
        </div>
        <div className="flex-1">
          <p className={`font-semibold ${splitTypeConfig.color}`}>{splitTypeConfig.label}</p>
          <p className="text-sm text-secondary">{splitTypeConfig.description}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {analysis.avg_pace}
          </p>
          <p className="text-xs text-secondary">avg pace</p>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Fastest KM */}
        {analysis.fastest_km && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">
              Fastest
            </p>
            <p className="font-semibold text-neutral-900 dark:text-neutral-100">
              KM {analysis.fastest_km.km}
            </p>
            <p className="text-sm text-secondary">{analysis.fastest_km.pace}/km</p>
          </div>
        )}

        {/* Slowest KM */}
        {analysis.slowest_km && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            <p className="text-xs text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">
              Slowest
            </p>
            <p className="font-semibold text-neutral-900 dark:text-neutral-100">
              KM {analysis.slowest_km.km}
            </p>
            <p className="text-sm text-secondary">{analysis.slowest_km.pace}/km</p>
          </div>
        )}

        {/* Pace Consistency */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
            Consistency
          </p>
          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
            {Math.round(analysis.pace_consistency * 100)}%
          </p>
          <p className="text-sm text-secondary">
            {analysis.pace_consistency >= 0.9 ? 'Excellent' :
             analysis.pace_consistency >= 0.75 ? 'Good' :
             analysis.pace_consistency >= 0.6 ? 'Fair' : 'Variable'}
          </p>
        </div>

        {/* Aerobic Decoupling (GAP-adjusted) - preferred metric */}
        {analysis.aerobic_decoupling !== null ? (
          <div className={`rounded-lg p-3 ${
            analysis.aerobic_decoupling > 5 ? 'bg-amber-50 dark:bg-amber-900/20' :
            analysis.aerobic_decoupling > 3 ? 'bg-yellow-50 dark:bg-yellow-900/20' :
            'bg-green-50 dark:bg-green-900/20'
          }`}>
            <p className={`text-xs uppercase tracking-wide mb-1 flex items-center ${
              analysis.aerobic_decoupling > 5 ? 'text-amber-600 dark:text-amber-400' :
              analysis.aerobic_decoupling > 3 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-green-600 dark:text-green-400'
            }`}>
              Decoupling
              <InfoTooltip text="Shows if your heart rate stayed consistent with your effort. Low values (under 5%) mean good aerobic fitness. Higher values suggest your body worked harder late in the run." />
            </p>
            <p className="font-semibold text-neutral-900 dark:text-neutral-100">
              {analysis.aerobic_decoupling > 0 ? '+' : ''}{analysis.aerobic_decoupling}%
            </p>
            <p className="text-sm text-secondary">
              {analysis.aerobic_decoupling <= 3 ? 'Well-trained' :
               analysis.aerobic_decoupling <= 5 ? 'Moderate drift' : 'High drift'}
            </p>
          </div>
        ) : analysis.hr_drift_percent !== null && (
          <div className={`rounded-lg p-3 ${
            analysis.hr_drift_context === 'expected' ? 'bg-green-50 dark:bg-green-900/20' :
            analysis.hr_drift_context === 'concerning' ? 'bg-amber-50 dark:bg-amber-900/20' :
            analysis.hr_drift_percent > 10 ? 'bg-yellow-50 dark:bg-yellow-900/20' :
            'bg-gray-50 dark:bg-gray-800'
          }`}>
            <p className={`text-xs uppercase tracking-wide mb-1 flex items-center ${
              analysis.hr_drift_context === 'expected' ? 'text-green-600 dark:text-green-400' :
              analysis.hr_drift_context === 'concerning' ? 'text-amber-600 dark:text-amber-400' :
              analysis.hr_drift_percent > 10 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-gray-600 dark:text-gray-400'
            }`}>
              HR Drift
              <InfoTooltip text="How much your heart rate increased over the run at similar effort. Some drift is normal, especially on hot days or longer runs. If you ran faster at the end, increased HR is expected!" />
            </p>
            <p className="font-semibold text-neutral-900 dark:text-neutral-100">
              {analysis.hr_drift_percent > 0 ? '+' : ''}{analysis.hr_drift_percent}%
            </p>
            <p className="text-sm text-secondary">
              {analysis.hr_drift_context === 'expected' ? 'Expected (faster pace)' :
               analysis.hr_drift_context === 'concerning' ? 'Cardiac drift' :
               analysis.hr_drift_percent <= 5 ? 'Normal' :
               analysis.hr_drift_percent <= 10 ? 'Elevated' : 'High'}
            </p>
          </div>
        )}
      </div>

      {/* Fade Point Warning */}
      {analysis.fade_point_km && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            Pace began fading at KM {analysis.fade_point_km} — consider fueling or pacing adjustments for similar distances
          </span>
        </div>
      )}

      {/* Mobile Details Toggle */}
      <div className="flex justify-end mb-2 md:hidden">
        <button
          onClick={() => setShowMobileDetails(!showMobileDetails)}
          className="text-xs text-secondary hover:text-primary transition-colors flex items-center gap-1 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800"
        >
          {showMobileDetails ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show Details
            </>
          )}
        </button>
      </div>

      {/* Splits Table */}
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700">
                <th className="text-left px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-400">
                  KM
                </th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-400">
                  Pace
                </th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3" /> HR
                  </span>
                </th>
                <th className={`text-left px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-400 ${showMobileDetails ? 'table-cell' : 'hidden'} md:table-cell`}>
                  <span className="flex items-center gap-1">
                    <Mountain className="w-3 h-3" /> Elev
                    <InfoTooltip text="Net elevation change for this kilometer. Positive means uphill, negative means downhill." />
                  </span>
                </th>
                <th className={`text-left px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-400 ${showMobileDetails ? 'table-cell' : 'hidden'} lg:table-cell`}>
                  <span className="flex items-center gap-1">
                    <Footprints className="w-3 h-3" /> Cadence
                    <InfoTooltip text="Steps per minute (total for both feet). Typical running cadence is 160-180 spm. Higher cadence often means shorter, quicker steps." />
                  </span>
                </th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-400">
                  Zone
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {displaySplits.map((split) => {
                const isFastest = analysis.fastest_km?.km === split.km;
                const isSlowest = analysis.slowest_km?.km === split.km;
                const zone = split.intensity_zone || 2;
                const zoneConfig = zoneColors[zone] || zoneColors[2];
                const isPartial = split.distance_end - split.distance_start < 900;

                return (
                  <tr
                    key={split.km}
                    className={`${
                      isFastest ? 'bg-green-50/50 dark:bg-green-900/10' :
                      isSlowest ? 'bg-red-50/50 dark:bg-red-900/10' :
                      ''
                    } hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${
                          isFastest ? 'text-green-600 dark:text-green-400' :
                          isSlowest ? 'text-red-600 dark:text-red-400' :
                          'text-neutral-900 dark:text-neutral-100'
                        }`}>
                          {formatSplitLabel(split)}
                        </span>
                        {isFastest && (
                          <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded uppercase font-medium">
                            Fast
                          </span>
                        )}
                        {isSlowest && (
                          <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded uppercase font-medium">
                            Slow
                          </span>
                        )}
                        {isPartial && (
                          <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded uppercase font-medium">
                            Partial
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${getPaceBarColor(split.pace_seconds_per_km)}`}
                            style={{ width: `${getPaceBarWidth(split.pace_seconds_per_km)}%` }}
                          />
                        </div>
                        <span className="font-mono text-neutral-900 dark:text-neutral-100 min-w-[70px]">
                          {formatPaceForUnit(split.pace, split.pace_seconds_per_km)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      {split.avg_hr ? (
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {split.avg_hr}
                          </span>
                          <span className="text-neutral-500 ml-1">bpm</span>
                          {split.min_hr && split.max_hr && (
                            <span className="text-xs text-secondary ml-1">
                              ({split.min_hr}-{split.max_hr})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400">--</span>
                      )}
                    </td>
                    <td className={`px-3 py-2.5 ${showMobileDetails ? 'table-cell' : 'hidden'} md:table-cell`}>
                      {split.elevation_start !== null && split.elevation_end !== null ? (
                        (() => {
                          const netChange = split.elevation_end - split.elevation_start;
                          if (Math.abs(netChange) < 1) {
                            return <span className="text-neutral-400 text-xs">0m</span>;
                          }
                          return netChange > 0 ? (
                            <span className="text-green-600 dark:text-green-400 text-xs font-medium flex items-center">
                              <TrendingUp className="w-3 h-3 mr-0.5" />
                              +{Math.round(netChange)}m
                            </span>
                          ) : (
                            <span className="text-red-500 dark:text-red-400 text-xs font-medium flex items-center">
                              <TrendingDown className="w-3 h-3 mr-0.5" />
                              {Math.round(netChange)}m
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-neutral-400">--</span>
                      )}
                    </td>
                    <td className={`px-3 py-2.5 ${showMobileDetails ? 'table-cell' : 'hidden'} lg:table-cell`}>
                      {split.avg_cadence ? (
                        <span className="text-neutral-900 dark:text-neutral-100">
                          {/* Double the value since Strava reports single-foot cadence */}
                          {split.avg_cadence * 2} <span className="text-xs text-secondary">spm</span>
                        </span>
                      ) : (
                        <span className="text-neutral-400">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {split.intensity_zone ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${zoneConfig.bg} ${zoneConfig.text}`}>
                          Z{split.intensity_zone}
                        </span>
                      ) : (
                        <span className="text-neutral-400">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Expand/Collapse Button */}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-2.5 flex items-center justify-center gap-2 text-sm text-secondary hover:text-primary hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors border-t border-neutral-200 dark:border-neutral-700"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show All {splits.length} Splits
              </>
            )}
          </button>
        )}
      </div>

      {/* HR Zone Legend (mobile) */}
      <div className="mt-4 sm:hidden">
        <p className="text-xs text-secondary mb-2">HR Zones:</p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((zone) => {
            const config = zoneColors[zone];
            return (
              <span key={zone} className={`text-xs px-2 py-1 rounded ${config.bg} ${config.text}`}>
                Z{zone}: {config.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SplitsAnalysisCard;
