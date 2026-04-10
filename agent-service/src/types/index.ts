/**
 * Type definitions for Agent Service
 */

// User Context (from backend)
export interface UserContextData {
  firstName: string;
  profile: any;
  activeGoal: any;
  recentStats: any;
  // recentActivities removed - redundant with dailyInsights
  activePlan?: {
    name: string;
    startDate: Date;
    endDate: Date;
    totalWeeks?: number;
  } | null;
  upcomingWorkouts?: Array<{
    id: number;
    date: Date;
    type: string;
    name?: string;
    description?: string;
    targetDistance?: number;
    targetPace?: string;
    hrZone?: number;
    weekLabel?: string;
  }>;
  thisWeekPlan?: {
    workouts: any[];
    totalPlannedDistance: number;
    completedDistance: number;
  };
  nextFourWeeksPlan?: {
    week1Distance: number;
    week2Distance: number;
    week3Distance: number;
    week4Distance: number;
  };
  lastWeekAdherence?: {
    planned: number;
    completed: number;
    skipped: number;
  };
  lastFourWeeksAdherence?: {
    plannedDistance: number;
    actualDistance: number;
    adherenceRate: number;
  };
  goalProgress?: {
    weeksRemaining: number;
    avgWeeklyMileageNeeded: number;
    currentAvgWeeklyMileage: number;
    onTrack: boolean;
  };
  hrZoneDistribution?: {
    zone1Hours: number;
    zone2Hours: number;
    zone3Hours: number;
    zone4Hours: number;
    zone5Hours: number;
    totalHours: number;
  } | null;
  hrZones?: {
    zone1Max: number;
    zone2Max: number;
    zone3Max: number;
    zone4Max: number;
    zone5Max: number;
  };
  sessionSummary?: {
    trainingCycleWeek: number;
    recentTrend: {
      mileageDirection: string;
      adherenceStatus: string;
      intensityLevel: string;
    };
    keyContext: {
      raceDateProximity: number;
      trainingPhase: string;
      recentConcerns: string | null;
    };
  };
  longTermMemory?: {
    relevantConversations: Array<{
      type: string;
      content: string;
      relevance: number;
      metadata: any;
      timestamp: Date;
    }>;
    relevantInsights: Array<{
      type: string;
      content: string;
      relevance: number;
      metadata: any;
      timestamp: Date;
    }>;
    recentSummaries: Array<{
      type: string;
      content: string;
      relevance: number;
      metadata: any;
      timestamp: Date;
    }>;
    tokenCount: number;
  };
  // Phase 1: Pre-computed insights
  dailyInsights?: any[];
  weeklyInsight?: any;
  thisWeekCompleted?: any;
  // Phase 2: Behavioral patterns
  runnerTendencies?: any[];
  // Race history and personal bests
  raceHistory?: any[];
  personalBests?: any[];
  // Marathon Performance Metrics (pre-computed high-signal context)
  marathonMetrics?: MarathonMetrics;
}

/**
 * Marathon Performance Metrics
 * RAW DATA ONLY - No pre-labeled judgments.
 * Let the LLM reason and make judgment calls.
 * Backend = Calculator, LLM = Analyst
 */
export interface MarathonMetrics {
  // Goal Information (factual)
  goal: {
    targetTimeSeconds: number;    // 10740 (raw seconds)
    goalPaceMinKm: number;        // 4.26 (decimal min/km)
    goalPaceFormatted: string;    // "4:15/km"
    raceDate: string;             // "May 30, 2026"
    daysUntilRace: number;        // 88
    raceDistanceKm: number;       // 42.195
  } | null;

  // Derived Pace Targets (computed from goal pace - reference points, not judgments)
  paceTargets: {
    easy: { min: string; max: string };
    tempo: { min: string; max: string };
    interval: { min: string; max: string };
    longRun: { min: string; max: string };
  } | null;

  // Weekly Load - RAW NUMBERS ONLY
  weeklyLoad: {
    plannedDistanceKm: number;
    typicalWeeklyKm: number;
    volumeChangePercent: number;  // Raw % - LLM decides if acceptable
    completedDistanceKm: number;
    remainingDistanceKm: number;
  };

  // Stress Distribution - QUALITY KM BREAKDOWN (let LLM infer density)
  stressDistribution: {
    tempoKm: number;              // km at tempo/threshold pace
    intervalKm: number;           // km at interval pace (faster than tempo)
    longRunKm: number;            // km in long run
    easyKm: number;               // km at easy/recovery pace
    qualityKmPercent: number;     // % of weekly volume at moderate/high intensity
    workoutBreakdown: Array<{     // Per-workout stress detail
      workoutId: number | null;   // ID for tool calls
      day: string;                // "Mon", "Tue", etc.
      type: string;               // workout type
      distanceKm: number;
      isQuality: boolean;         // tempo, intervals, or long run
    }>;
  };

  // Long Run Data - RAW NUMBERS, NO PROGRESSION LABELS
  longRunData: {
    thisWeekLongRunKm: number | null;
    longRunAsPercentOfRace: number | null;
    longestRunLast4Weeks: number;
    weeklyLongRuns4Weeks: number[];   // [18, 20, 22, 25.6] - LLM sees pattern
  };

  // Training Context - FACTUAL ONLY
  trainingContext: {
    weeksUntilRace: number;
    trainingPhase: 'base' | 'build' | 'peak' | 'taper';  // Factual based on time
  };

  // Aerobic Data - RAW PERCENTAGES, NO JUDGMENT
  aerobicData: {
    zone1_2Percent: number;       // 50 - LLM decides if appropriate
    zone4_5Percent: number;       // 25
    totalTrainingHours: number;
  };

  // Recent Performance - RAW INDICATORS
  recentPerformance: {
    avgEasyPaceMinKm: number | null;    // 5.27 (decimal)
    avgEasyPaceFormatted: string | null; // "5:16/km"
    avgEasyHR: number | null;
    avgWeeklyVolume4Weeks: number;
  };
}

export interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: Date;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// API Request types
export interface ChatRequest {
  userId: number;
  conversationId: string;
  message: string;
  streamResponse?: boolean;
}
