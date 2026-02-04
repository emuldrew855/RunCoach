export interface User {
  id: number;
  strava_id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_picture_url?: string;
  profile?: UserProfile;
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
