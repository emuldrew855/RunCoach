import { z } from 'zod';

/**
 * Tool: modify_workout
 * Purpose: Adjust workout intensity, distance, pace, or HR zone based on athlete's readiness
 * Execution: Returns pending action requiring user approval
 */

export const modifyWorkoutSchema = z.object({
  workout_id: z.number().describe('ID of the planned workout to modify'),
  updates: z.object({
    target_distance_meters: z.number().optional().describe('New target distance in meters'),
    target_duration_seconds: z.number().optional().describe('New target duration in seconds'),
    target_hr_zone: z.number().min(1).max(5).optional().describe('New target heart rate zone (1-5)'),
    target_pace_min: z.number().optional().describe('New minimum target pace in decimal min/km (e.g., 5.5 = 5:30/km)'),
    target_pace_max: z.number().optional().describe('New maximum target pace in decimal min/km'),
    target_pace_avg: z.number().optional().describe('New average target pace in decimal min/km'),
    description: z.string().optional().describe('Updated workout description'),
    coach_notes: z.string().optional().describe('New coach notes for this modification'),
  }),
  reason: z.string().describe('Explanation for this modification'),
});

export type ModifyWorkoutParams = z.infer<typeof modifyWorkoutSchema>;

export const modifyWorkoutTool = {
  name: 'modify_workout',
  description: 'Modify an existing planned workout by adjusting its intensity, distance, duration, pace, or heart rate zone. This is useful when the athlete shows signs of fatigue, is overtraining, or needs adjustments based on recent performance. This action requires user approval before execution.',
  parameters: modifyWorkoutSchema,
};
