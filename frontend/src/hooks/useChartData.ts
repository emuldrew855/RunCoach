import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { chartDataAPI } from '../services/api';
import {
  ChartData,
  ChartDataQuery,
  PaceComparisonData,
  SplitComparisonData,
  HRZoneDistributionData,
  ExecutionScoreTrendData,
  SimilarWorkoutsData,
  PBProgressionData,
} from '../types/chartSpec';

const CHART_DATA_STALE_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to fetch chart data based on chart specification
 */
export function useChartData(
  dataQuery: ChartDataQuery
): UseQueryResult<ChartData, Error> {
  const { endpoint, params } = dataQuery;

  // Determine which API function to call based on endpoint
  const queryFn = async () => {
    switch (endpoint) {
      case '/chart-data/pace-comparison':
        const paceResponse = await chartDataAPI.getPaceComparison(params as { activityId: number; distanceMin?: number; distanceMax?: number; limit?: number });
        return paceResponse.data as PaceComparisonData;

      case '/chart-data/split-comparison':
        const splitResponse = await chartDataAPI.getSplitComparison(params as { activityId: number; distanceMin?: number; distanceMax?: number; limit?: number });
        return splitResponse.data as SplitComparisonData;

      case '/chart-data/hr-zone-distribution':
        const hrResponse = await chartDataAPI.getHRZoneDistribution(params as { activityId: number });
        return hrResponse.data as HRZoneDistributionData;

      case '/chart-data/execution-score-trend':
        const executionResponse = await chartDataAPI.getExecutionScoreTrend(params as { workoutType?: string; limit?: number; days?: number });
        return executionResponse.data as ExecutionScoreTrendData;

      case '/chart-data/similar-workouts':
        const similarResponse = await chartDataAPI.getSimilarWorkouts(params as { activityId: number; distanceMin?: number; distanceMax?: number; workoutType?: string; limit?: number });
        return similarResponse.data as SimilarWorkoutsData;

      case '/chart-data/pb-progression':
        const pbResponse = await chartDataAPI.getPBProgression(params as { distance: number; days?: number });
        return pbResponse.data as PBProgressionData;

      default:
        throw new Error(`Unknown chart data endpoint: ${endpoint}`);
    }
  };

  return useQuery({
    queryKey: ['chartData', endpoint, params],
    queryFn,
    staleTime: CHART_DATA_STALE_TIME,
    retry: 2,
  });
}

/**
 * Hook specifically for pace comparison data
 */
export function usePaceComparisonData(
  activityId: number,
  options?: { distanceMin?: number; distanceMax?: number; limit?: number }
): UseQueryResult<PaceComparisonData, Error> {
  return useQuery({
    queryKey: ['chartData', 'pace-comparison', activityId, options],
    queryFn: async () => {
      const response = await chartDataAPI.getPaceComparison({
        activityId,
        ...options,
      });
      return response.data;
    },
    staleTime: CHART_DATA_STALE_TIME,
    enabled: !!activityId,
  });
}

/**
 * Hook specifically for split comparison data
 */
export function useSplitComparisonData(
  activityId: number,
  options?: { distanceMin?: number; distanceMax?: number; limit?: number }
): UseQueryResult<SplitComparisonData, Error> {
  return useQuery({
    queryKey: ['chartData', 'split-comparison', activityId, options],
    queryFn: async () => {
      const response = await chartDataAPI.getSplitComparison({
        activityId,
        ...options,
      });
      return response.data;
    },
    staleTime: CHART_DATA_STALE_TIME,
    enabled: !!activityId,
  });
}

/**
 * Hook specifically for HR zone distribution data
 */
export function useHRZoneDistributionData(
  activityId: number
): UseQueryResult<HRZoneDistributionData, Error> {
  return useQuery({
    queryKey: ['chartData', 'hr-zone-distribution', activityId],
    queryFn: async () => {
      const response = await chartDataAPI.getHRZoneDistribution({ activityId });
      return response.data;
    },
    staleTime: CHART_DATA_STALE_TIME,
    enabled: !!activityId,
  });
}

/**
 * Hook specifically for execution score trend data
 */
export function useExecutionScoreTrendData(
  options?: { workoutType?: string; limit?: number; days?: number }
): UseQueryResult<ExecutionScoreTrendData, Error> {
  return useQuery({
    queryKey: ['chartData', 'execution-score-trend', options],
    queryFn: async () => {
      const response = await chartDataAPI.getExecutionScoreTrend(options || {});
      return response.data;
    },
    staleTime: CHART_DATA_STALE_TIME,
  });
}

/**
 * Hook specifically for similar workouts data
 */
export function useSimilarWorkoutsData(
  activityId: number,
  options?: { distanceMin?: number; distanceMax?: number; workoutType?: string; limit?: number }
): UseQueryResult<SimilarWorkoutsData, Error> {
  return useQuery({
    queryKey: ['chartData', 'similar-workouts', activityId, options],
    queryFn: async () => {
      const response = await chartDataAPI.getSimilarWorkouts({
        activityId,
        ...options,
      });
      return response.data;
    },
    staleTime: CHART_DATA_STALE_TIME,
    enabled: !!activityId,
  });
}

/**
 * Hook specifically for PB progression data
 */
export function usePBProgressionData(
  distance: number,
  days?: number
): UseQueryResult<PBProgressionData, Error> {
  return useQuery({
    queryKey: ['chartData', 'pb-progression', distance, days],
    queryFn: async () => {
      const response = await chartDataAPI.getPBProgression({ distance, days });
      return response.data;
    },
    staleTime: CHART_DATA_STALE_TIME,
    enabled: !!distance,
  });
}
