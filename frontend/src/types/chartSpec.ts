// Chart Specification Types for Dynamic Performance Visualizations

export type ChartType = 'pace_progression' | 'split_comparison' | 'hr_zone_stacked' | 'execution_score_trend';

export interface ChartDataQuery {
  endpoint: string;
  params: Record<string, any>;
}

export interface LineConfig {
  dataKey: string;
  color: string;
  label: string;
  strokeWidth?: number;
  strokeDasharray?: string;
}

export interface BarConfig {
  dataKey: string;
  color: string;
  label: string;
}

export interface ChartConfig {
  chartType?: 'line' | 'bar' | 'area' | 'stacked_bar';
  xAxis?: string;
  yAxis?: string;
  lines?: LineConfig[];
  bars?: BarConfig[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
}

export interface ChartSpec {
  id: string;
  type: ChartType;
  title: string;
  dataQuery: ChartDataQuery;
  chartConfig: ChartConfig;
  insights?: string[];
}

// Chart Data Response Types (matching backend types)

export interface ChartDataPoint {
  x: number | string;
  y: number;
  label?: string;
  activityId?: number;
  name?: string;
  distance?: number;
  duration?: number;
  date?: string;
}

export interface PaceComparisonData {
  current: ChartDataPoint[];
  average: ChartDataPoint[];
  best: ChartDataPoint[];
  metadata: {
    activityId: number;
    distance: number;
    date: string;
    comparisonCount: number;
    fallbackMode?: 'average_pace_trend';
    averagePace?: number;
    bestPace?: number;
    currentPace?: number;
  };
}

export interface SplitComparisonData {
  splits: {
    km: number;
    current: number;
    average: number;
    best?: number;
  }[];
  metadata: {
    activityId: number;
    distance: number;
    date: string;
    comparisonCount: number;
  };
}

export interface HRZoneDistributionData {
  zones: {
    zone: number;
    name: string;
    percentage: number;
    duration: number;
    color: string;
  }[];
  metadata: {
    activityId: number;
    date: string;
    totalDuration: number;
  };
}

export interface ExecutionScoreTrendData {
  trend: {
    date: string;
    score: number;
    activityId: number;
    distance: number;
  }[];
  metadata: {
    workoutType?: string;
    averageScore: number;
    count: number;
  };
}

export interface SimilarWorkoutsData {
  workouts: {
    activityId: number;
    date: string;
    distance: number;
    pace: number;
    executionScore?: number;
    isCurrent: boolean;
  }[];
  metadata: {
    currentActivityId: number;
    distanceRange: [number, number];
    workoutType?: string;
  };
}

export interface PBProgressionData {
  progression: {
    date: string;
    time: number;
    distance: number;
    activityId: number;
    isPB: boolean;
  }[];
  metadata: {
    distance: number;
    currentPB: number;
    improvements: number;
  };
}

export type ChartData =
  | PaceComparisonData
  | SplitComparisonData
  | HRZoneDistributionData
  | ExecutionScoreTrendData
  | SimilarWorkoutsData
  | PBProgressionData;
