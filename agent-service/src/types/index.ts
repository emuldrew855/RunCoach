/**
 * Type definitions for Agent Service
 */

// User Context (from backend)
export interface UserContextData {
  firstName: string;
  profile: any;
  activeGoal: any;
  recentStats: any;
  recentActivities: any[];
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
