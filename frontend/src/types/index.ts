export interface User {
  id: number;
  strava_id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_picture_url?: string;
  profile?: UserProfile;
  onboarding_completed?: boolean;
  created_at: string;
  updated_at: string;
}

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
  start_date: string;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  calories?: number;
  suffer_score?: number;
  splits_metric?: SplitData[];
  splits_standard?: SplitData[];
  map_polyline?: string;
  laps?: any;
}

export interface SplitData {
  distance: number;
  elapsed_time: number;
  moving_time: number;
  split: number;
  average_speed: number;
  average_heartrate?: number;
  elevation_difference?: number;
  pace_zone?: number;
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

// Runner type classification for intent-based coaching
export type RunnerType = 'architect' | 'builder' | 'maintainer';

// Rolling baseline for trend-based coaching (plan-less users)
export interface RollingBaseline {
  avgDistanceKm: number;
  avgRunsPerWeek: number;
  avgLongestRunKm: number;
  avgPaceMinKm: number;
  thisWeekDistanceKm: number;
  thisWeekRuns: number;
  percentOfBaseline: number;
  distanceTrend: 'increasing' | 'stable' | 'decreasing';
  paceTrend: 'improving' | 'stable' | 'declining';
  weeksOfData: number;
}

export interface UserProfile {
  id?: number;
  user_id?: number;
  age?: number;
  weight_kg?: number;
  height_cm?: number;
  gender?: string;
  running_experience_years?: number;
  typical_weekly_mileage?: number;
  injury_history?: string;
  preferred_units?: 'metric' | 'imperial';
  week_starts_on?: 'sunday' | 'monday';
  timezone?: string;
  training_block_start?: string;
  training_block_end?: string;
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
  // Runner intent fields
  runner_type?: RunnerType;
  current_focus?: string;
  runner_type_inferred?: boolean;
  runner_type_set_at?: string;
}

export interface Goal {
  id?: number;
  user_id?: number;
  goal_type: string;
  target_time_seconds?: number;
  target_date?: string;
  race_name?: string;
  race_location?: string;
  is_active: boolean;
  notes?: string;
}

export interface RaceHistory {
  id?: number;
  user_id?: number;
  race_name: string;
  race_date: string;
  race_type: '5k' | '10k' | '15k' | 'half_marathon' | 'marathon' | 'ultra' | 'other';
  finish_time_seconds: number;
  race_location?: string;
  race_notes?: string;
  is_personal_best?: boolean;
  placement?: number;
  age_group_placement?: number;
  weather_conditions?: string;
  elevation_gain_meters?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Conversation {
  id: string;
  user_id: number;
  title?: string;
  is_archived: boolean;
  last_message_at?: string;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  user_id: number;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Phase 3: RAG + Vector Search - Memory Types

export interface UserInsights {
  patterns: string[];
  preferences: string[];
  concerns: string[];
  successes: string[];
}

export interface ActivityPattern {
  pattern_text: string;
  pattern_category: 'pacing' | 'hr_behavior' | 'recovery' | 'performance';
  occurrence_count: number;
  last_seen: string;
  metadata?: any;
}

export interface ConversationSummary {
  summary_text: string;
  key_insights: string[];
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'concerned';
  created_at: string;
}

export interface MemoryStats {
  insights: number;
  patterns: number;
  summaries: number;
  conversation_memories: number;
}
