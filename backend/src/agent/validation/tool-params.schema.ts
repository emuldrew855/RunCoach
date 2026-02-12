/**
 * Zod Validation Schemas for Tool Parameters
 *
 * Validates tool call parameters before execution.
 * Used for runtime validation of tool payloads from database.
 */

import { z } from 'zod';

/**
 * shift_workout tool parameters
 */
export const shiftWorkoutParamsSchema = z.object({
  workout_id: z.number().int().positive('Workout ID must be a positive integer'),
  new_date: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'Date must be in YYYY-MM-DD format'
  ),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
});

export type ShiftWorkoutParams = z.infer<typeof shiftWorkoutParamsSchema>;

/**
 * modify_workout tool parameters
 */
export const modifyWorkoutParamsSchema = z.object({
  workout_id: z.number().int().positive('Workout ID must be a positive integer'),
  updates: z.object({
    target_distance_meters: z.number().positive().optional(),
    target_duration_seconds: z.number().positive().optional(),
    target_hr_zone: z.number().int().min(1).max(5).optional(),
    target_pace_min: z.number().positive().optional(),
    target_pace_max: z.number().positive().optional(),
    target_pace_avg: z.number().positive().optional(),
    description: z.string().max(1000).optional(),
    coach_notes: z.string().max(1000).optional(),
  }),
  reason: z.string().min(10).max(500),
});

export type ModifyWorkoutParams = z.infer<typeof modifyWorkoutParamsSchema>;

/**
 * create_workout tool parameters
 */
export const createWorkoutParamsSchema = z.object({
  scheduled_date: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'Date must be in YYYY-MM-DD format'
  ),
  workout_type: z.enum([
    'easy',
    'long_run',
    'tempo',
    'intervals',
    'recovery',
    'hills',
    'race',
  ]),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  target_distance_meters: z.number().positive().optional(),
  target_duration_seconds: z.number().positive().optional(),
  target_hr_zone: z.number().int().min(1).max(5).optional(),
  target_pace_min: z.number().positive().optional(),
  target_pace_max: z.number().positive().optional(),
  target_pace_avg: z.number().positive().optional(),
  coach_notes: z.string().max(1000).optional(),
  reason: z.string().min(10).max(500),
});

export type CreateWorkoutParams = z.infer<typeof createWorkoutParamsSchema>;

/**
 * delete_workout tool parameters
 */
export const deleteWorkoutParamsSchema = z.object({
  workout_id: z.number().int().positive('Workout ID must be a positive integer'),
  reason: z.string().min(10).max(500),
});

export type DeleteWorkoutParams = z.infer<typeof deleteWorkoutParamsSchema>;

/**
 * analyze_performance tool parameters
 */
export const analyzePerformanceParamsSchema = z.object({
  activity_ids: z.array(z.number().int().positive()).optional(),
  date_range_days: z.number().int().positive().max(365).optional(),
  focus_area: z.enum(['pacing', 'hr_zones', 'progression', 'recovery', 'overall']),
});

export type AnalyzePerformanceParams = z.infer<typeof analyzePerformanceParamsSchema>;

/**
 * Validate tool parameters based on tool name
 */
export function validateToolParams(toolName: string, params: any): any {
  switch (toolName) {
    case 'shift_workout':
      return shiftWorkoutParamsSchema.parse(params);
    case 'modify_workout':
      return modifyWorkoutParamsSchema.parse(params);
    case 'create_workout':
      return createWorkoutParamsSchema.parse(params);
    case 'delete_workout':
      return deleteWorkoutParamsSchema.parse(params);
    case 'analyze_performance':
      return analyzePerformanceParamsSchema.parse(params);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
