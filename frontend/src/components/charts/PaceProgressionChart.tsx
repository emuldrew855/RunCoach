import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PaceComparisonData, ChartConfig } from '../../types/chartSpec';

interface PaceProgressionChartProps {
  data: PaceComparisonData;
  config: ChartConfig;
}

export function PaceProgressionChart({ data, config }: PaceProgressionChartProps) {
  const navigate = useNavigate();
  const isFallbackMode = data.metadata.fallbackMode === 'average_pace_trend';

  // Transform data for Recharts format
  let chartData;
  if (isFallbackMode) {
    // Fallback mode: show pace trend over time
    chartData = [
      ...data.average.map(point => ({
        x: point.x,
        label: point.label,
        trend: point.y,
        current: null,
        activityId: point.activityId,
        name: point.name,
        distance: point.distance,
        duration: point.duration,
        date: point.date,
      })),
      {
        x: data.current[0].x,
        label: data.current[0].label,
        trend: null,
        current: data.current[0].y,
        activityId: data.current[0].activityId,
        name: data.current[0].name,
        distance: data.current[0].distance,
        duration: data.current[0].duration,
        date: data.current[0].date,
      },
    ];
  } else {
    // Standard mode: per-km pace comparison
    chartData = data.current.map((point, idx) => ({
      x: point.x,
      label: point.label,
      current: point.y,
      average: data.average[idx]?.y || null,
      best: data.best[idx]?.y || null,
    }));
  }

  // Format pace in min:sec format
  const formatPace = (value: number) => {
    const minutes = Math.floor(value);
    const seconds = Math.round((value - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format distance in km
  const formatDistance = (meters: number) => {
    return `${(meters / 1000).toFixed(2)} km`;
  };

  // Format duration in min:sec
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format date nicely
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Handle click on data point
  const handlePointClick = (data: any) => {
    if (data && data.activityId) {
      navigate(`/activity/${data.activityId}`);
    }
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload[0]) return null;

    const data = payload[0].payload;
    const pace = data.current || data.trend;

    if (!isFallbackMode || !data.activityId) {
      // Standard tooltip for per-km view
      return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-lg">
          <p className="text-gray-300 text-sm font-semibold mb-1">{data.label}</p>
          <p className="text-cyan-400 text-sm">Pace: {formatPace(pace)}</p>
        </div>
      );
    }

    // Enhanced tooltip for fallback mode with metadata
    return (
      <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-3 shadow-xl max-w-xs">
        <p className="text-cyan-400 font-semibold text-sm mb-2">{data.name}</p>
        <div className="space-y-1 text-xs">
          <p className="text-gray-300">
            <span className="text-gray-500">Date:</span> {formatDate(data.date)}
          </p>
          <p className="text-gray-300">
            <span className="text-gray-500">Distance:</span> {formatDistance(data.distance)}
          </p>
          <p className="text-gray-300">
            <span className="text-gray-500">Duration:</span> {formatDuration(data.duration)}
          </p>
          <p className="text-cyan-400 font-semibold mt-2">
            <span className="text-gray-500">Pace:</span> {formatPace(pace)} /km
          </p>
        </div>
        <p className="text-gray-500 text-xs mt-2 italic">Click to view details</p>
      </div>
    );
  };

  const height = config.height || 300;
  const showGrid = config.showGrid !== false;
  const showLegend = config.showLegend !== false;
  const showTooltip = config.showTooltip !== false;

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
            dataKey="x"
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            label={{
              value: isFallbackMode ? 'Timeline' : 'Kilometer',
              position: 'insideBottom',
              offset: -5,
              fill: '#9ca3af'
            }}
            tickFormatter={(value, index) => {
              if (isFallbackMode && chartData[index]) {
                return chartData[index].label;
              }
              return value.toString();
            }}
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
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#06b6d4', strokeWidth: 1 }} />
          )}
          {showLegend && (
            <Legend
              wrapperStyle={{ color: '#9ca3af' }}
              iconType="line"
            />
          )}

          {isFallbackMode ? (
            <>
              {/* Fallback mode: pace trend over time */}
              <Line
                type="monotone"
                dataKey="trend"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4, cursor: 'pointer' }}
                name="Similar Runs"
                connectNulls
                onClick={handlePointClick}
              />
              <Line
                type="monotone"
                dataKey="current"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: '#3b82f6', r: 7, cursor: 'pointer' }}
                name="Today"
                connectNulls={false}
                onClick={handlePointClick}
              />
            </>
          ) : (
            <>
              {/* Standard mode: per-km pace comparison */}
              <Line
                type="monotone"
                dataKey="current"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: '#3b82f6', r: 4 }}
                name="Today"
                activeDot={{ r: 6 }}
              />

              {/* Average of similar runs */}
              {data.average.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="average"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Average"
                />
              )}

              {/* Best run */}
              {data.best.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="best"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  dot={false}
                  name="Best"
                />
              )}
            </>
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Metadata summary */}
      <div className="mt-3 text-xs text-gray-400 text-center space-y-1">
        {isFallbackMode ? (
          <>
            <p>
              Pace trend from {data.metadata.comparisonCount} runs within ±5% distance over past 8 weeks
              {data.metadata.averagePace && (
                <span className="ml-2 text-gray-300">
                  • Avg: {formatPace(data.metadata.averagePace)}
                </span>
              )}
            </p>
            <p className="text-gray-500 italic">Click any point to view that run's details</p>
          </>
        ) : (
          `Comparing to ${data.metadata.comparisonCount} similar runs`
        )}
      </div>
    </div>
  );
}
