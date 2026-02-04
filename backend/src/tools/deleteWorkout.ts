import { z } from 'zod';

/**
 * Tool: delete_workout
 * Purpose: Remove planned workout when athlete needs extra recovery or to reduce load
 * Execution: Returns pending action requiring user approval
 */

export const deleteWorkoutSchema = z.object({
  workout_id: z.number().describe('ID of the planned workout to remove'),
  reason: z.string().describe('Explanation for removing this workout'),
});

export type DeleteWorkoutParams = z.infer<typeof deleteWorkoutSchema>;

export const deleteWorkoutTool = {
  name: 'delete_workout',
  description: 'Remove a planned workout from the training plan. This is useful when the athlete shows signs of overtraining, needs extra recovery time, or when the weekly volume is too high. This action requires user approval before execution.',
  parameters: deleteWorkoutSchema,
};
