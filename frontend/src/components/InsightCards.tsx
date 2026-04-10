/**
 * InsightCards Component
 *
 * Mini data visualizations with REAL data from useInsightMetrics hook
 * Sparklines, progress bars, and compact charts for inline context
 */

import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

export interface InsightMetric {
  type: 'pace' | 'volume' | 'hr' | 'zone2';
  title: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  sparklineData: number[];
  color: string;
}

interface InsightCardsProps {
  metrics: InsightMetric[];
}

export function InsightCards({ metrics }: InsightCardsProps) {
  // Don't render if no metrics
  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
      {metrics.slice(0, 2).map((metric, index) => (
        <InsightCard key={index} card={metric} />
      ))}
    </div>
  );
}

interface InsightCardComponentProps {
  card: InsightMetric;
}

function InsightCard({ card }: InsightCardComponentProps) {
  const trendIcon = card.trend === 'up' ? (
    <TrendingUp size={12} strokeWidth={2} />
  ) : card.trend === 'down' ? (
    <TrendingDown size={12} strokeWidth={2} />
  ) : (
    <Activity size={12} strokeWidth={2} />
  );

  // For pace, 'down' is good (faster), for others 'up' is good
  const isPaceMetric = card.type === 'pace';
  let trendColor: string;

  if (card.trend === 'stable') {
    trendColor = 'text-neutral-400';
  } else if (isPaceMetric) {
    // For pace: down (faster) = green, up (slower) = red
    trendColor = card.trend === 'down' ? 'text-green-400' : 'text-red-400';
  } else {
    // For volume/hr/zone2: up = green, down = red
    trendColor = card.trend === 'up' ? 'text-green-400' : 'text-red-400';
  }

  return (
    <div className="bg-neutral-900/40 dark:bg-black/40 border border-neutral-700/30 rounded p-3 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">
          {card.title}
        </div>
        <div className={`${trendColor}`}>
          {trendIcon}
        </div>
      </div>

      {/* Value */}
      <div className="text-lg font-semibold text-neutral-100 mb-2 font-mono">
        {card.value}
      </div>

      {/* Sparkline */}
      {card.sparklineData && card.sparklineData.length > 1 && (
        <Sparkline data={card.sparklineData} color={card.color} />
      )}
    </div>
  );
}

interface SparklineProps {
  data: number[];
  color: string;
}

function Sparkline({ data, color }: SparklineProps) {
  if (data.length < 2) return null;

  const width = 100;
  const height = 24;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  // Create area path
  const areaPoints = `${padding},${height} ${points} ${width - padding},${height}`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
    >
      {/* Area fill */}
      <polygon
        points={areaPoints}
        fill={color}
        fillOpacity="0.2"
      />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End point dot */}
      <circle
        cx={width - padding}
        cy={height - padding - ((data[data.length - 1] - min) / range) * (height - padding * 2)}
        r="2"
        fill={color}
      />
    </svg>
  );
}
