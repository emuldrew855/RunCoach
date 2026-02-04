import { z } from 'zod';

/**
 * Tool: create_workout
 * Purpose: Add new workout to fill gaps, add recovery runs, or adjust weekly structure
 * Execution: Returns pending action requiring user approval
 */

export const createWorkoutSchema = z.object({
  scheduled_date: z.string().describe('Date for new workout in YYYY-MM-DD format'),
  workout_type: z.enum(['easy', 'long_run', 'tempo', 'intervals', 'recovery', 'hills', 'race']).describe('Type of workout'),
  name: z.string().describe('Workout name'),
  description: z.string().optional().describe('Detailed workout description'),
  target_distance_meters: z.number().optional().describe('Target distance in meters'),
  target_duration_seconds: z.number().optional().describe('Target duration in seconds'),
  target_hr_zone: z.number().min(1).max(5).optional().describe('Target heart rate zone (1-5)'),
  target_pace_min: z.number().optional().describe('Minimum target pace in decimal min/km'),
  target_pace_max: z.number().optional().describe('Maximum target pace in decimal min/km'),
  target_pace_avg: z.number().optional().describe('Average target pace in decimal min/km'),
  coach_notes: z.string().optional().describe('Coach notes for this workout'),
  reason: z.string().describe('Why this workout is being added'),
});

export type CreateWorkoutParams = z.infer<typeof createWorkoutSchema>;

export const createWorkoutTool = {
  name: 'create_workout',
  description: 'Add a new workout to the training plan. This is useful when weekly mileage is too low, the athlete needs additional recovery runs, or there are gaps in the training schedule that need to be filled. This action requires user approval before execution.',
  parameters: createWorkoutSchema,
};
