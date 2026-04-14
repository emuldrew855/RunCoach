/**
 * Smart Analysis Component
 *
 * The "Intelligence Layer" dashboard module that displays
 * AI-powered performance diagnostics in a premium, technical style.
 *
 * Features:
 * - Status Badge (color-coded by sentiment)
 * - Coach Pulse (2-line analysis with monospace for metrics)
 * - Highlighted Metric (the key data point)
 */

import { useQuery } from '@tanstack/react-query';
import { coachingAPI, SmartAnalysis as SmartAnalysisType } from '../services/api';
import { Activity, TrendingUp, AlertTriangle, CheckCircle, Zap, Target, Pause, BarChart3 } from 'lucide-react';

// Status icon mapping
const STATUS_ICONS: Record<SmartAnalysisType['status'], typeof Activity> = {
  OPTIMIZING: Zap,
  ON_TRACK: CheckCircle,
  OVERREACHING: AlertTriangle,
  RECOVERING: Pause,
  BUILDING: TrendingUp,
  STABLE: BarChart3,
  INCONSISTENT: AlertTriangle,
  RESTING: Pause,
};

// Sentiment-based styling
const SENTIMENT_STYLES = {
  positive: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: 'text-emerald-400',
    glow: 'shadow-emerald-500/10',
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: 'text-amber-400',
    glow: 'shadow-amber-500/10',
  },
  neutral: {
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-500/5',
    badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    icon: 'text-cyan-400',
    glow: 'shadow-cyan-500/10',
  },
};

// Runner type labels
const RUNNER_TYPE_LABELS: Record<SmartAnalysisType['runnerType'], string> = {
  ghost: 'Inactive',
  architect: 'Plan-Based',
  builder: 'Building Base',
  maintainer: 'Maintenance',
};

interface SmartAnalysisProps {
  className?: string;
}

export function SmartAnalysis({ className = '' }: SmartAnalysisProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['smart-analysis'],
    queryFn: async () => {
      const response = await coachingAPI.getSmartAnalysis();
      return response.data.data.analysis;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Don't render if ghost state or not visible
  if (!data?.isVisible) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="bg-neutral-800/50 rounded-lg border border-neutral-700/50 p-4">
          <div className="h-4 bg-neutral-700 rounded w-1/3 mb-3"></div>
          <div className="h-3 bg-neutral-700 rounded w-full mb-2"></div>
          <div className="h-3 bg-neutral-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  // Error state - silently fail
  if (error || !data) {
    return null;
  }

  const styles = SENTIMENT_STYLES[data.sentiment];
  const StatusIcon = STATUS_ICONS[data.status];

  // Parse the analysis to highlight metrics (numbers with units)
  const highlightMetrics = (text: string) => {
    // Match patterns like "12%", "142 bpm", "45.2 km", "5:30/km"
    const metricPattern = /(\d+(?:\.\d+)?(?::\d+)?)\s*(km|bpm|%|min\/km|\/km)?/g;

    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = metricPattern.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.slice(lastIndex, match.index)}
          </span>
        );
      }

      // Add the highlighted metric
      parts.push(
        <span
          key={`metric-${match.index}`}
          className="font-mono font-semibold text-neutral-100 bg-neutral-700/50 px-1.5 py-0.5 rounded"
        >
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.slice(lastIndex)}
        </span>
      );
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div className={`${className}`}>
      <div
        className={`
          relative overflow-hidden rounded-lg border ${styles.border} ${styles.bg}
          shadow-lg ${styles.glow}
          transition-all duration-300 hover:shadow-xl
        `}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon size={16} className={styles.icon} strokeWidth={2} />
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
              Status Pulse
            </span>
          </div>

          {/* Status Badge */}
          <div
            className={`
              px-2.5 py-1 rounded border text-[10px] font-mono font-semibold
              uppercase tracking-wider ${styles.badge}
            `}
          >
            {data.status.replace('_', ' ')}
          </div>
        </div>

        {/* Coach Pulse - Main Analysis */}
        <div className="px-4 pb-3">
          <p className="text-sm text-neutral-300 leading-relaxed">
            {highlightMetrics(data.analysis)}
          </p>
        </div>

        {/* Highlighted Metric */}
        {data.highlightedMetric && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
              <Target size={14} className={styles.icon} strokeWidth={2} />
              <div className="flex-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                  {data.highlightedMetric.label}
                </div>
                <div className="text-lg font-mono font-bold text-neutral-100">
                  {data.highlightedMetric.value}
                  <span className="text-sm font-normal text-neutral-400 ml-1">
                    {data.highlightedMetric.unit}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer - Runner Type */}
        <div className="px-4 py-2 bg-neutral-900/50 border-t border-neutral-700/30">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">
              Mode: {RUNNER_TYPE_LABELS[data.runnerType]}
            </span>
            <span className="text-[9px] font-mono text-neutral-600">
              Updated {new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SmartAnalysis;
