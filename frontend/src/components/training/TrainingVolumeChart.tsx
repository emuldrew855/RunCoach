import React, { useState } from 'react';
import {
  BarChart,
  Bar,
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
import { Settings } from 'lucide-react';
import { ChartPreferences } from '../../types';

export interface WeeklyVolumeData {
  weekStart: string;
  weekLabel: string;
  actualDistance: number;
  plannedDistance: number | null;
  activityCount: number;
  workoutCount?: number;
  isHistorical: boolean;
  isCurrent: boolean;
}

interface TrainingVolumeChartProps {
  data: WeeklyVolumeData[];
  distanceUnit?: string;
  chartPreferences: ChartPreferences;
  onPreferencesChange: (prefs: Partial<ChartPreferences>) => void;
}

export const TrainingVolumeChart: React.FC<TrainingVolumeChartProps> = ({
  data,
  distanceUnit = 'km',
  chartPreferences,
  onPreferencesChange,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [localHistoricalWeeks, setLocalHistoricalWeeks] = useState(chartPreferences.historicalWeeks);
  const [localFutureWeeks, setLocalFutureWeeks] = useState(chartPreferences.futureWeeks);

  // Update local state when props change
  React.useEffect(() => {
    setLocalHistoricalWeeks(chartPreferences.historicalWeeks);
    setLocalFutureWeeks(chartPreferences.futureWeeks);
  }, [chartPreferences.historicalWeeks, chartPreferences.futureWeeks]);

  const handleApplyWeeksConfig = () => {
    onPreferencesChange({
      historicalWeeks: localHistoricalWeeks,
      futureWeeks: localFutureWeeks,
    });
  };

  const handleChartTypeChange = (newType: 'bar' | 'line') => {
    onPreferencesChange({ chartType: newType });
  };

  const handleDataViewChange = (newView: 'both' | 'actual' | 'planned') => {
    onPreferencesChange({ dataView: newView });
  };

  const handleShowAverageChange = (newValue: boolean) => {
    onPreferencesChange({ showAverage: newValue });
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <p className="text-slate-500 dark:text-slate-400">
          No training volume data available yet
        </p>
      </div>
    );
  }

  // Calculate average of actual distances
  const avgActualDistance = data.length > 0
    ? data.reduce((sum, week) => sum + week.actualDistance, 0) / data.filter(w => w.actualDistance > 0).length
    : 0;

  // Calculate peak week
  const peakWeekDistance = data.length > 0 ? Math.max(...data.map(w => w.actualDistance)) : 0;

  // Calculate peak planned week
  const peakPlannedWeekDistance = data.length > 0
    ? Math.max(...data.map(w => w.plannedDistance || 0))
    : 0;

  // Calculate weeks with actual activities (exclude future weeks with 0 distance)
  const weeksWithActivities = data.filter(w => w.actualDistance > 0).length;

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const week = payload[0].payload;
      const actualDist = week.actualDistance || 0;
      const plannedDist = week.plannedDistance || 0;
      const totalDistance = actualDist + plannedDist;

      return (
        <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
          <p className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Week of {new Date(week.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>

          {/* Total Weekly Distance */}
          <p className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700">
            Total: {totalDistance.toFixed(1)} {distanceUnit}
          </p>

          {week.actualDistance > 0 && (
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Actual: {week.actualDistance.toFixed(1)} {distanceUnit} ({week.activityCount} runs)
            </p>
          )}
          {week.plannedDistance !== null && week.plannedDistance > 0 && (
            <p className="text-sm text-orange-600 dark:text-orange-400">
              Planned: {week.plannedDistance.toFixed(1)} {distanceUnit}
              {week.workoutCount && ` (${week.workoutCount} workouts)`}
            </p>
          )}
          {week.isCurrent && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 font-semibold">
              ✓ Current Week
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Filter data based on view setting (use chartPreferences.chartPreferences.dataView)
  const chartData = data.map(week => {
    const item: any = {
      ...week, // Preserve all original data for tooltip
      weekLabel: week.weekLabel,
      weekStart: week.weekStart,
      isCurrent: week.isCurrent,
    };

    if (chartPreferences.dataView === 'both' || chartPreferences.dataView === 'actual') {
      item.actual = week.actualDistance;
    }
    if (chartPreferences.dataView === 'both' || chartPreferences.dataView === 'planned') {
      item.planned = week.plannedDistance;
    }

    return item;
  });

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 10, right: 80, left: 0, bottom: 20 },
    };

    const xAxisProps = {
      dataKey: 'weekLabel',
      tick: { fontSize: 12, fill: '#64748b' },
      angle: -45,
      textAnchor: 'end',
      height: 80,
    };

    const yAxisProps = {
      tick: { fontSize: 12, fill: '#64748b' },
      label: {
        value: `Distance (${distanceUnit})`,
        angle: -90,
        position: 'insideLeft',
        style: { fontSize: 12, fill: '#64748b' },
      },
    };

    if (chartPreferences.chartType === 'bar') {
      return (
        <BarChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '14px', paddingTop: '10px' }}
            iconType="square"
          />
          {chartPreferences.showAverage && avgActualDistance > 0 && (
            <ReferenceLine
              y={avgActualDistance}
              stroke="#6366f1"
              strokeDasharray="5 5"
              label={{
                value: `Avg: ${avgActualDistance.toFixed(1)} ${distanceUnit}`,
                position: 'right',
                fill: '#6366f1',
                fontSize: 12,
              }}
            />
          )}
          {(chartPreferences.dataView === 'both' || chartPreferences.dataView === 'actual') && (
            <Bar
              dataKey="actual"
              name="Actual Distance"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
            />
          )}
          {(chartPreferences.dataView === 'both' || chartPreferences.dataView === 'planned') && (
            <Bar
              dataKey="planned"
              name="Planned Distance"
              fill="#f97316"
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      );
    } else {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '14px', paddingTop: '10px' }}
            iconType="line"
          />
          {chartPreferences.showAverage && avgActualDistance > 0 && (
            <ReferenceLine
              y={avgActualDistance}
              stroke="#6366f1"
              strokeDasharray="5 5"
              label={{
                value: `Avg: ${avgActualDistance.toFixed(1)} ${distanceUnit}`,
                position: 'right',
                fill: '#6366f1',
                fontSize: 12,
              }}
            />
          )}
          {(chartPreferences.dataView === 'both' || chartPreferences.dataView === 'actual') && (
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual Distance"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
          {(chartPreferences.dataView === 'both' || chartPreferences.dataView === 'planned') && (
            <Line
              type="monotone"
              dataKey="planned"
              name="Planned Distance"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: '#f97316', r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
        </LineChart>
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Settings Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Settings size={16} />
          Chart Options
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Chart Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleChartTypeChange('bar')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartPreferences.chartType === 'bar'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                Bar Chart
              </button>
              <button
                onClick={() => handleChartTypeChange('line')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartPreferences.chartType === 'line'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                Line Chart
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Data Display
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleDataViewChange('both')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartPreferences.dataView === 'both'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                Both
              </button>
              <button
                onClick={() => handleDataViewChange('actual')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartPreferences.dataView === 'actual'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                Actual Only
              </button>
              <button
                onClick={() => handleDataViewChange('planned')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartPreferences.dataView === 'planned'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                Planned Only
              </button>
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="showAverage"
              checked={chartPreferences.showAverage}
              onChange={(e) => handleShowAverageChange(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="showAverage" className="ml-2 text-sm text-slate-700 dark:text-slate-300">
              Show average line
            </label>
          </div>

          {/* Week Range Configuration */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Week Range
            </label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Historical Weeks (Past)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="4"
                    value={localHistoricalWeeks}
                    onChange={(e) => setLocalHistoricalWeeks(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-12 text-right">
                    {localHistoricalWeeks}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Planned Weeks (Future)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="1"
                    value={localFutureWeeks}
                    onChange={(e) => setLocalFutureWeeks(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-12 text-right">
                    {localFutureWeeks}
                  </span>
                </div>
              </div>
              <button
                onClick={handleApplyWeeksConfig}
                className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        {renderChart()}
      </ResponsiveContainer>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">Weeks Trained</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {weeksWithActivities}
          </p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">Average Volume</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {avgActualDistance.toFixed(1)} {distanceUnit}
          </p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">Peak Week</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {peakWeekDistance.toFixed(1)} {distanceUnit}
          </p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">Peak Planned</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {peakPlannedWeekDistance.toFixed(1)} {distanceUnit}
          </p>
        </div>
      </div>
    </div>
  );
};
