// Chart Data Types for Performance Visualizations

export interface ChartDataPoint {
  x: number | string;
  y: number;
  label?: string;
}

export interface PaceComparisonData {
  current: ChartDataPoint[];
  average: ChartDataPoint[];
  best: ChartDataPoint[];
  metadata: {
    activityId: number;
    distance: number | undefined;
    date: string | Date;
    comparisonCount: number;
    fallbackMode?: string;
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
    distance: number | undefined;
    date: string | Date;
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
    date: string | Date;
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
    date: string | Date;
    distance: number | undefined;
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

export interface ChartDataQueryParams {
  activityId?: number;
  userId?: number;
  distanceRange?: [number, number];
  workoutType?: string;
  limit?: number;
  days?: number;
  distance?: number;
}
