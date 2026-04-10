import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ExecutionScoreTrendData, ChartConfig } from '../../types/chartSpec';
import { format } from 'date-fns';

interface ExecutionScoreTrendChartProps {
  data: ExecutionScoreTrendData;
  config: ChartConfig;
}

export function ExecutionScoreTrendChart({ data, config }: ExecutionScoreTrendChartProps) {
  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d');
    } catch {
      return dateString;
    }
  };

  // Transform data for chart
  const chartData = data.trend.map((item) => ({
    date: formatDate(item.date),
    score: item.score,
    activityId: item.activityId,
  }));

  const height = config.height || 300;
  const showGrid = config.showGrid !== false;
  const showLegend = config.showLegend !== false;
  const showTooltip = config.showTooltip !== false;

  // Color scale for execution score
  const getScoreColor = (score: number) => {
    if (score >= 90) return '#10b981'; // Green - Excellent
    if (score >= 75) return '#3b82f6'; // Blue - Good
    if (score >= 60) return '#f59e0b'; // Amber - Fair
    return '#ef4444'; // Red - Poor
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          )}
          <XAxis
            dataKey="date"
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            label={{ value: 'Date', position: 'insideBottom', offset: -5, fill: '#9ca3af' }}
          />
          <YAxis
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            label={{ value: 'Execution Score', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
            domain={[0, 100]}
          />
          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px',
                color: '#f3f4f6',
              }}
              formatter={(value: number) => [value.toFixed(1), 'Score']}
            />
          )}
          {showLegend && (
            <Legend
              wrapperStyle={{ color: '#9ca3af' }}
              iconType="line"
            />
          )}

          {/* Average reference line */}
          <ReferenceLine
            y={data.metadata.averageScore}
            stroke="#f59e0b"
            strokeDasharray="3 3"
            label={{
              value: `Avg: ${data.metadata.averageScore.toFixed(1)}`,
              fill: '#f59e0b',
              fontSize: 12,
            }}
          />

          {/* Execution score line */}
          <Line
            type="monotone"
            dataKey="score"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={getScoreColor(payload.score)}
                  stroke="#1f2937"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{ r: 6 }}
            name="Execution Score"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Metadata summary */}
      <div className="mt-2 text-xs text-gray-400 text-center">
        {data.metadata.count} workouts
        {data.metadata.workoutType && ` (${data.metadata.workoutType})`}
        {' • '}
        Average: {data.metadata.averageScore.toFixed(1)}
      </div>

      {/* Score legend */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-400">90+ Excellent</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-gray-400">75-89 Good</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-gray-400">60-74 Fair</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-gray-400">&lt;60 Poor</span>
        </div>
      </div>
    </div>
  );
}
