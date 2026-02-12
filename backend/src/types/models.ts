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
  scheduled_date: Date;
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
