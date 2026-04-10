import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { SplitComparisonData, ChartConfig } from '../../types/chartSpec';

interface SplitComparisonChartProps {
  data: SplitComparisonData;
  config: ChartConfig;
}

export function SplitComparisonChart({ data, config }: SplitComparisonChartProps) {
  // Format pace in min:sec format
  const formatPace = (value: number) => {
    const minutes = Math.floor(value);
    const seconds = Math.round((value - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const height = config.height || 300;
  const showGrid = config.showGrid !== false;
  const showLegend = config.showLegend !== false;
  const showTooltip = config.showTooltip !== false;

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data.splits}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          )}
          <XAxis
            dataKey="km"
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            label={{ value: 'Kilometer', position: 'insideBottom', offset: -5, fill: '#9ca3af' }}
          />
          <YAxis
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            label={{ value: 'Pace (min/km)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
            tickFormatter={formatPace}
            domain={['auto', 'auto']}
            reversed
          />
          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px',
                color: '#f3f4f6',
              }}
              formatter={(value: number) => [formatPace(value), '']}
              labelFormatter={(label) => `KM ${label}`}
            />
          )}
          {showLegend && (
            <Legend
              wrapperStyle={{ color: '#9ca3af' }}
            />
          )}

          {/* Current run - highlighted */}
          <Bar
            dataKey="current"
            fill="#3b82f6"
            name="Today"
            radius={[4, 4, 0, 0]}
          />

          {/* Average of similar runs */}
          {data.splits.some(s => s.average > 0) && (
            <Bar
              dataKey="average"
              fill="#10b981"
              name="Average"
              radius={[4, 4, 0, 0]}
            />
          )}

          {/* Best run */}
          {data.splits.some(s => s.best && s.best > 0) && (
            <Bar
              dataKey="best"
              fill="#f59e0b"
              name="Best"
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>

      {/* Metadata summary */}
      <div className="mt-2 text-xs text-gray-400 text-center">
        Comparing to {data.metadata.comparisonCount} similar runs
      </div>
    </div>
  );
}
