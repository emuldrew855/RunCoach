import React from 'react';
import { useChartData } from '../../hooks/useChartData';
import {
  ChartSpec,
  PaceComparisonData,
  SplitComparisonData,
  HRZoneDistributionData,
  ExecutionScoreTrendData,
} from '../../types/chartSpec';
import { PaceProgressionChart } from './PaceProgressionChart';
import { SplitComparisonChart } from './SplitComparisonChart';
import { HRZoneStackedChart } from './HRZoneStackedChart';
import { ExecutionScoreTrendChart } from './ExecutionScoreTrendChart';

interface ChartSpecRendererProps {
  chartSpec: ChartSpec;
}

/**
 * Main chart renderer component that:
 * 1. Parses chart specs from markdown
 * 2. Fetches data using React Query
 * 3. Delegates to appropriate chart component
 * 4. Shows skeleton during loading
 */
export function ChartSpecRenderer({ chartSpec }: ChartSpecRendererProps) {
  const { data, isLoading, isError, error } = useChartData(chartSpec.dataQuery);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="my-6 p-6 bg-gray-900/50 rounded-lg border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-64 bg-gray-800 rounded animate-pulse" />
          <div className="h-4 w-24 bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="h-64 bg-gray-800/50 rounded animate-pulse" />
        <div className="mt-4 flex gap-2 justify-center">
          <div className="h-3 w-20 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-20 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-20 bg-gray-800 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred loading chart data';
    const isNoDataError = errorMessage.includes('no split data') || errorMessage.includes('No HR zone data');

    return (
      <div className={`my-6 p-4 rounded-lg border ${isNoDataError ? 'bg-yellow-950/10 border-yellow-900/30' : 'bg-red-950/20 border-red-900/30'}`}>
        <div className={`flex items-center gap-2 mb-2 ${isNoDataError ? 'text-yellow-400' : 'text-red-400'}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-semibold text-sm">
            {isNoDataError ? 'Chart data unavailable' : 'Failed to load chart'}
          </span>
        </div>
        <p className="text-xs text-gray-400">
          {isNoDataError
            ? 'This activity does not have the required data for this visualization. Try a different run or chart type.'
            : errorMessage}
        </p>
      </div>
    );
  }

  // No data
  if (!data) {
    return null;
  }

  // Render appropriate chart component based on type
  return (
    <div className="my-6 p-6 bg-gray-900/50 rounded-lg border border-cyan-500/20 shadow-lg">
      {/* Chart title */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-cyan-400 font-mono tracking-wide">
          {chartSpec.title}
        </h3>
        <div className="text-xs text-gray-500 font-mono">
          VISUALIZATION
        </div>
      </div>

      {/* Chart component */}
      <div className="bg-gray-950/50 p-4 rounded border border-gray-800">
        {renderChart(chartSpec.type, data, chartSpec.chartConfig)}
      </div>

      {/* Insights */}
      {chartSpec.insights && chartSpec.insights.length > 0 && (
        <div className="mt-4 space-y-2">
          {chartSpec.insights.map((insight, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 text-sm text-gray-300 bg-gray-950/30 p-3 rounded border border-gray-800/50"
            >
              <svg className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span>{insight}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Helper function to render the appropriate chart component
 */
function renderChart(type: string, data: any, config: any) {
  switch (type) {
    case 'pace_progression':
      return <PaceProgressionChart data={data as PaceComparisonData} config={config} />;

    case 'split_comparison':
      return <SplitComparisonChart data={data as SplitComparisonData} config={config} />;

    case 'hr_zone_stacked':
      return <HRZoneStackedChart data={data as HRZoneDistributionData} config={config} />;

    case 'execution_score_trend':
      return <ExecutionScoreTrendChart data={data as ExecutionScoreTrendData} config={config} />;

    default:
      return (
        <div className="text-center text-gray-400 py-8">
          Unsupported chart type: {type}
        </div>
      );
  }
}

/**
 * Extract chart specs from markdown content
 * Looks for ```chart-spec code blocks and parses JSON
 */
export function extractChartSpecs(content: string): ChartSpec[] {
  const chartSpecs: ChartSpec[] = [];
  const chartSpecRegex = /```chart-spec\n([\s\S]*?)```/g;

  let match;
  while ((match = chartSpecRegex.exec(content)) !== null) {
    try {
      const spec = JSON.parse(match[1].trim());
      chartSpecs.push(spec);
    } catch (error) {
      console.error('Failed to parse chart spec:', error);
    }
  }

  return chartSpecs;
}

/**
 * Remove chart spec blocks from markdown content
 */
export function removeChartSpecs(content: string): string {
  return content.replace(/```chart-spec\n[\s\S]*?```\n*/g, '');
}
