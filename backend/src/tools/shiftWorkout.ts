import { z } from 'zod';

/**
 * Tool: shift_workout
 * Purpose: Move a planned workout to a different date for better recovery or schedule conflicts
 * Execution: Returns pending action requiring user approval
 */

export const shiftWorkoutSchema = z.object({
  workout_id: z.number().describe('ID of the planned workout to shift'),
  new_date: z.string().describe('New scheduled date in YYYY-MM-DD format'),
  reason: z.string().describe('Explanation for why this shift is recommended'),
});

export type ShiftWorkoutParams = z.infer<typeof shiftWorkoutSchema>;

export const shiftWorkoutTool = {
  name: 'shift_workout',
  description: 'Move a planned workout to a different date. This is useful when the athlete needs extra recovery time, has a schedule conflict, or when the current workout timing is not optimal. This action requires user approval before execution.',
  parameters: shiftWorkoutSchema,
};
