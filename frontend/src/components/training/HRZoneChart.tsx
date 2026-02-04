import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface HRZoneData {
  zone1Hours: number;
  zone2Hours: number;
  zone3Hours: number;
  zone4Hours: number;
  zone5Hours: number;
  totalHours: number;
}

interface HRZoneChartProps {
  data: HRZoneData | null;
  showTarget?: boolean;
}

const ZONE_COLORS = {
  1: '#3b82f6', // blue
  2: '#10b981', // green
  3: '#fbbf24', // yellow
  4: '#f97316', // orange
  5: '#ef4444', // red
};

export const HRZoneChart: React.FC<HRZoneChartProps> = ({ data, showTarget = true }) => {
  if (!data || data.totalHours === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <p className="text-slate-500 dark:text-slate-400">
          No heart rate data available yet
        </p>
      </div>
    );
  }

  const chartData = [
    {
      name: 'Zone 1',
      hours: data.zone1Hours,
      percentage: (data.zone1Hours / data.totalHours) * 100,
      zone: 1,
    },
    {
      name: 'Zone 2',
      hours: data.zone2Hours,
      percentage: (data.zone2Hours / data.totalHours) * 100,
      zone: 2,
    },
    {
      name: 'Zone 3',
      hours: data.zone3Hours,
      percentage: (data.zone3Hours / data.totalHours) * 100,
      zone: 3,
    },
    {
      name: 'Zone 4',
      hours: data.zone4Hours,
      percentage: (data.zone4Hours / data.totalHours) * 100,
      zone: 4,
    },
    {
      name: 'Zone 5',
      hours: data.zone5Hours,
      percentage: (data.zone5Hours / data.totalHours) * 100,
      zone: 5,
    },
  ];

  const zone1_2_percent = ((data.zone1Hours + data.zone2Hours) / data.totalHours) * 100;
  const isHealthy = zone1_2_percent >= 75;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Heart Rate Zone Distribution (Last 30 Days)
        </h3>
        <span className="text-sm text-slate-600 dark:text-slate-400">
          Total: {data.totalHours.toFixed(1)}h
        </span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical">
          <XAxis type="number" unit="%" />
          <YAxis dataKey="name" type="category" width={100} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {data.name}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {data.hours.toFixed(1)}h ({data.percentage.toFixed(0)}%)
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={ZONE_COLORS[entry.zone as keyof typeof ZONE_COLORS]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {showTarget && (
        <div className={`p-4 rounded-lg ${isHealthy ? 'bg-green-50 dark:bg-green-900/20' : 'bg-yellow-50 dark:bg-yellow-900/20'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Zone 1-2 Training
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Target: ~80% for marathon training
              </p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${isHealthy ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                {zone1_2_percent.toFixed(0)}%
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {isHealthy ? 'Good' : 'Too intense'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-2">
        {chartData.map((zone) => (
          <div
            key={zone.zone}
            className="flex flex-col items-center p-2 bg-slate-50 dark:bg-slate-800 rounded"
          >
            <div
              className="w-4 h-4 rounded-full mb-1"
              style={{ backgroundColor: ZONE_COLORS[zone.zone as keyof typeof ZONE_COLORS] }}
            />
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {zone.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
