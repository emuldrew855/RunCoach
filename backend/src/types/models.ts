// User types
export interface User {
  id: number;
  strava_id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_picture_url?: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  last_activity_sync_at?: Date;
  onboarding_completed?: boolean;
}

export interface ChartPreferences {
  historicalWeeks: number;
  futureWeeks: number;
  chartType: 'bar' | 'line';
  dataView: 'both' | 'actual' | 'planned';
  showAverage: boolean;
}

export interface PersonalBests {
  '5k'?: number;
  '10k'?: number;
  '15k'?: number;
  '30k'?: number;
  'half_marathon'?: number;
  'marathon'?: number;
}

export interface UserProfile {
  id: number;
  user_id: number;
  age?: number;
  weight_kg?: number;
  height_cm?: number;
  gender?: string;
  running_experience_years?: number;
  typical_weekly_mileage?: number;
  injury_history?: string;
  preferred_units: 'metric' | 'imperial';
  week_starts_on: 'sunday' | 'monday';
  timezone: string;
  training_block_start?: Date;
  training_block_end?: Date;
  coach_style?: 'strict' | 'supportive' | 'analytical' | 'motivational';
  coach_strictness_level?: number; // 1-5 scale
  coach_communication_style?: 'casual' | 'balanced' | 'professional';
  chart_preferences?: ChartPreferences;
  personal_bests?: PersonalBests;
  hr_zone_1_max?: number; // Zone 1 upper bound (bpm)
  hr_zone_2_max?: number; // Zone 2 upper bound (bpm)
  hr_zone_3_max?: number; // Zone 3 upper bound (bpm)
  hr_zone_4_max?: number; // Zone 4 upper bound (bpm)
  hr_zone_5_max?: number; // Zone 5 upper bound (bpm)
  created_at: Date;
  updated_at: Date;
}

// Race history
export interface RaceHistory {
  id: number;
  user_id: number;
  race_name: string;
  race_date: Date;
  race_type: '5k' | '10k' | '15k' | 'half_marathon' | 'marathon' | 'ultra' | 'other';
  finish_time_seconds: number;
  race_location?: string;
  race_notes?: string;
  is_personal_best: boolean;
  placement?: number;
  age_group_placement?: number;
  weather_conditions?: string;
  elevation_gain_meters?: number;
  created_at: Date;
  updated_at: Date;
}

// Activity types
export interface Activity {
  id: number;
  user_id: number;
  strava_activity_id: number;
  name?: string;
  distance_meters?: number;
  moving_time_seconds?: number;
  elapsed_time_seconds?: number;
  total_elevation_gain_meters?: number;
  sport_type?: string;
  start_date: Date;
  start_date_local?: Date;
  timezone?: string;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  calories?: number;
  description?: string;
  suffer_score?: number;
  perceived_exertion?: number;
  workout_type?: number;
  gear_id?: string;
  map_polyline?: string;
  splits_metric?: any;
  splits_standard?: any;
  laps?: any;
  execution_score?: number;
  created_at: Date;
  updated_at: Date;
  synced_at: Date;
}

// Goal types
export interface Goal {
  id: number;
  user_id: number;
  goal_type: string;
  target_time_seconds?: number;
  target_date?: Date;
  race_name?: string;
  race_location?: string;
  is_active: boolean;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

// Training Plan types
export interface TrainingPlan {
  id: number;
  user_id: number;
  goal_id?: number;
  name: string;
  description?: string;
  start_date: Date;
  end_date: Date;
  total_weeks?: number;
  source: 'manual' | 'csv_upload' | 'pdf_upload';
  file_metadata?: any;
  is_active: boolean;
  identify_peaks?: boolean;
  peak_weeks_count?: number;
  peak_week_numbers?: number[];
  taper_weeks?: number;
  taper_start_date?: Date;
  enable_carb_loading?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PlannedWorkout {
  id: number;
  training_plan_id: number;
  user_id: number;
  scheduled_date: Date | string;
  workout_type: string;
  name?: string;
  description?: string;
  target_distance_meters?: number;
  target_duration_seconds?: number;
  target_pace_min?: number;
  target_pace_max?: number;
  target_pace_avg?: number;
  target_hr_zone?: number;
  target_hr_min?: number;
  target_hr_max?: number;
  intervals?: any;
  completed_activity_id?: number;
  completion_status: string;
  completed_at?: Date;
  coach_notes?: string;
  athlete_notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ActivityHRZone {
  id: number;
  activity_id: number;
  user_id: number;
  zone_1_seconds: number;
  zone_2_seconds: number;
  zone_3_seconds: number;
  zone_4_seconds: number;
  zone_5_seconds: number;
  zone_1_max: number;
  zone_2_max: number;
  zone_3_max: number;
  zone_4_max: number;
  zone_5_max: number;
  calculated_at: Date;
}

// Chat types
export interface Conversation {
  id: string;
  user_id: number;
  title?: string;
  is_archived: boolean;
  last_message_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMessage {
  id: number;
  user_id: number;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  context_snapshot?: any;
  token_count?: number;
  model_used?: string;
  tool_calls?: any;
  tool_results?: any;
  pending_actions?: string[];
  is_agent_initiated?: boolean;
  created_at: Date;
}

// Strava API types
export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    profile: string;
    email?: string;
  };
}

export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  calories?: number;
  suffer_score?: number;
  workout_type?: number;
  gear_id?: string;
  map?: {
    summary_polyline?: string;
  };
  splits_metric?: any[];
  splits_standard?: any[];
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

  // Derived Pace Targets (computed from goal pace - these are reference points, not judgments)
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
      workoutId: number | null;   // ID for tool calls (null if completed)
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

/**
 * Training Context - Temporal context about training blocks
 * Helps LLM distinguish between pre-plan history and structured training
 */
export interface TrainingContext {
  // Race Goal Info
  raceGoal: string;              // "Stockholm Marathon"
  goalTime: string;              // "2:59"
  goalPace: string;              // "4:15/km"
  raceDate: string;              // "2026-05-30"

  // Training Block Boundaries
  trainingBlockStart: string;    // "2026-02-09" (plan start_date)
  trainingBlockEnd: string;      // "2026-05-30" (race date)
  trainingBlockLengthWeeks: number; // 16

  // Current Position in Block
  weeksIntoBlock: number;        // 5
  weeksRemaining: number;        // 11
  blockProgressPercent: number;  // 31

  // Training Phase
  currentPhase: 'pre_plan' | 'base' | 'build' | 'peak' | 'taper';
  phaseWeeksRemaining: number;   // Weeks until next phase

  // Phase Focus (what matters now)
  keyFocus: string;              // "Increase weekly mileage gradually and extend long run distance"
}

/**
 * Long Run Progression - Explicit tracking of long run development
 */
export interface LongRunProgression {
  sincePlanStart: number[];      // [12, 16, 18, 20] km
  prePlanLongest: number | null; // Baseline longest run before plan
  currentLongest: number;        // Longest run so far in plan
  upcomingTarget: number | null; // Next long run target from plan
  goalPeak: number;              // Target peak long run (e.g., 32km for marathon)
  progressionRate: 'appropriate' | 'slow' | 'aggressive' | 'insufficient_data';
}

/**
 * Weekly Stats for training history breakdown
 */
export interface WeeklyStats {
  weekNumber: number;
  weekStart: string;
  distance: number;
  duration: number;
  runCount: number;
  averagePace?: number;
  averageHR?: number;
  longestRun: number;
}

/**
 * Weekly Summary for aggregated stats
 */
export interface WeeklySummary {
  avgWeeklyDistance: number;
  avgRunsPerWeek: number;
  longestRun: number;
  volumeTrend?: number;
}

/**
 * Segmented Training History
 * Separates pre-plan baseline from structured training
 */
export interface SegmentedTrainingHistory {
  prePlanHistory: {
    weeks: number;
    purpose: string;
    weeklyBreakdown: WeeklyStats[];
    summary: WeeklySummary;
  } | null;

  planHistory: {
    weeks: number;
    purpose: string;
    weeklyBreakdown: WeeklyStats[];
    summary: WeeklySummary;
  };
}

/**
 * Plan Adherence - Scoped to plan period only
 */
export interface PlanAdherence {
  sincePlanStart: {
    totalPlanned: number;
    completed: number;
    skipped: number;
    adherenceRate: number;
  };
  periodStart: string;
  periodEnd: string;
  weeksInPlan: number;
}
