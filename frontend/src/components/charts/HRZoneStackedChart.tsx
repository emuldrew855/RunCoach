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
  Cell,
} from 'recharts';
import { HRZoneDistributionData, ChartConfig } from '../../types/chartSpec';

interface HRZoneStackedChartProps {
  data: HRZoneDistributionData;
  config: ChartConfig;
}

export function HRZoneStackedChart({ data, config }: HRZoneStackedChartProps) {
  // Format duration in HH:MM:SS
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const height = config.height || 300;
  const showGrid = config.showGrid !== false;
  const showLegend = config.showLegend !== false;
  const showTooltip = config.showTooltip !== false;

  // Transform data for horizontal stacked bar
  const chartData = [
    {
      name: 'HR Distribution',
      ...data.zones.reduce((acc, zone) => {
        acc[`Zone ${zone.zone}`] = zone.percentage;
        return acc;
      }, {} as Record<string, number>),
    },
  ];

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          )}
          <XAxis
            type="number"
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            label={{ value: 'Percentage (%)', position: 'insideBottom', offset: -5, fill: '#9ca3af' }}
            domain={[0, 100]}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            width={120}
          />
          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px',
                color: '#f3f4f6',
              }}
              formatter={(value: number, name: string) => {
                const zone = data.zones.find(z => `Zone ${z.zone}` === name);
                return [
                  `${value.toFixed(1)}% (${formatDuration(zone?.duration || 0)})`,
                  name,
                ];
              }}
            />
          )}
          {showLegend && (
            <Legend
              wrapperStyle={{ color: '#9ca3af', paddingTop: '10px' }}
            />
          )}

          {/* Stacked bars for each zone */}
          {data.zones.map((zone) => (
            <Bar
              key={zone.zone}
              dataKey={`Zone ${zone.zone}`}
              stackId="hr"
              fill={zone.color}
              name={zone.name}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Zone breakdown */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        {data.zones.map((zone) => (
          <div key={zone.zone} className="text-center">
            <div
              className="w-3 h-3 rounded-full mx-auto mb-1"
              style={{ backgroundColor: zone.color }}
            />
            <div className="text-xs text-gray-400">Zone {zone.zone}</div>
            <div className="text-sm font-mono text-gray-200">
              {zone.percentage.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">
              {formatDuration(zone.duration)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
