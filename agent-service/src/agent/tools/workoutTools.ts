/**
 * Workout Management Tools
 *
 * All 6 tools for managing training plan workouts:
 * - shiftWorkoutTool: Move a workout to a different date
 * - modifyWorkoutTool: Change workout parameters (distance, pace, HR, etc.)
 * - createWorkoutTool: Add a new workout to the plan
 * - deleteWorkoutTool: Remove a workout from the plan
 * - bulkModifyWorkoutsTool: Modify multiple workouts matching criteria
 * - swapTrainingWeeksTool: Swap all workouts between two weeks
 *
 * All tools suggest changes via pending actions - user must approve before execution.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Shift Workout Tool
 * Suggests moving a workout to a different date
 */
// Define schemas separately to avoid type instantiation issues
const shiftWorkoutSchema = z.object({
  workoutId: z.number().describe('The ID of the workout to shift'),
  newDate: z.string().describe('The new date in YYYY-MM-DD format'),
  reason: z.string().optional().describe('Explanation of why this shift is recommended'),
});

export const shiftWorkoutTool = (tool as any)(
  async ({ workoutId, newDate, reason }: { workoutId: number; newDate: string; reason?: string }) => {
    try {
      // Create pending action instead of executing directly
      const pendingAction = {
        action_type: 'shift_workout',
        action_payload: {
          workout_id: workoutId,
          new_date: newDate,
        },
        agent_reasoning: reason || `Shifting workout to ${newDate}`,
      };

      return JSON.stringify({
        success: true,
        pending: true,
        message: `Workout shift to ${newDate} suggested. Please review and approve the change.`,
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'shift_workout',
    description:
      'Suggest shifting a workout to a different date. IMPORTANT: This SUGGESTS changes - user must approve before execution. Use the workout ID from the schedule.',
    schema: shiftWorkoutSchema,
  } as any
);

/**
 * Modify Workout Tool
 * Suggests modifications to an existing workout's parameters
 */
const modifyWorkoutSchema = z.object({
  workoutId: z.number().describe('The ID of the workout to modify'),
  updates: z
    .object({
      target_distance_meters: z.number().nullable().optional().describe('Distance in meters'),
      target_duration_seconds: z.number().nullable().optional().describe('Duration in seconds'),
      target_pace_min: z.number().nullable().optional().describe('Fastest pace in min/km (e.g., 4.5 = 4:30/km)'),
      target_pace_max: z.number().nullable().optional().describe('Slowest pace in min/km'),
      target_pace_avg: z.number().nullable().optional().describe('Target average pace in min/km'),
      target_hr_zone: z.number().min(1).max(5).nullable().optional().describe('Heart rate zone (1-5)'),
      target_hr_min: z.number().nullable().optional().describe('Minimum heart rate (bpm)'),
      target_hr_max: z.number().nullable().optional().describe('Maximum heart rate (bpm)'),
      workout_type: z.string().nullable().optional().describe('Workout type (easy, long_run, tempo, intervals, etc.)'),
      name: z.string().nullable().optional().describe('Workout name'),
      description: z.string().nullable().optional().describe('Workout description'),
      coach_notes: z.string().nullable().optional().describe('Coach instructions for the athlete'),
      intervals: z.any().nullable().optional().describe('Structured interval workout definition (JSONB)'),
    })
    .describe('The fields to update'),
  reason: z.string().optional().describe('Explanation of why this modification is recommended'),
});

export const modifyWorkoutTool = (tool as any)(
  async ({
    workoutId,
    updates,
    reason,
  }: {
    workoutId: number;
    updates: {
      target_distance_meters?: number;
      target_duration_seconds?: number;
      target_pace_min?: number;
      target_pace_max?: number;
      target_pace_avg?: number;
      target_hr_zone?: number;
      target_hr_min?: number;
      target_hr_max?: number;
      workout_type?: string;
      name?: string;
      description?: string;
      coach_notes?: string;
      intervals?: any;
    };
    reason?: string;
  }) => {
    try {
      // Create pending action instead of executing directly
      const pendingAction = {
        action_type: 'modify_workout',
        action_payload: {
          workout_id: workoutId,
          updates,
        },
        agent_reasoning: reason || 'Modifying workout parameters',
      };

      return JSON.stringify({
        success: true,
        pending: true,
        message: 'Workout modification suggested. Please review and approve the change.',
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'modify_workout',
    description:
      'Suggest modifications to a planned workout. IMPORTANT: This SUGGESTS changes - user must approve before execution. Can modify distance, duration, pace (min/max/avg), HR zones, workout type, notes, and structured intervals.',
    schema: modifyWorkoutSchema,
  } as any
);

/**
 * Create Workout Tool
 * Suggests creating a new workout in the training plan
 */
const createWorkoutSchema = z.object({
  scheduledDate: z.string().describe('Date in YYYY-MM-DD format'),
  workoutType: z.string().describe('Type: easy, long_run, tempo, intervals, recovery, race, rest'),
  name: z.string().nullable().optional().describe('Workout name'),
  targetDistanceMeters: z.number().nullable().optional().describe('Distance in meters'),
  targetDurationSeconds: z.number().nullable().optional().describe('Duration in seconds'),
  targetPaceMin: z.number().nullable().optional().describe('Fastest pace in min/km'),
  targetPaceMax: z.number().nullable().optional().describe('Slowest pace in min/km'),
  targetPaceAvg: z.number().nullable().optional().describe('Target average pace in min/km'),
  targetHrZone: z.number().min(1).max(5).nullable().optional().describe('Heart rate zone (1-5)'),
  targetHrMin: z.number().nullable().optional().describe('Minimum heart rate (bpm)'),
  targetHrMax: z.number().nullable().optional().describe('Maximum heart rate (bpm)'),
  coachNotes: z.string().nullable().optional().describe('Coach instructions'),
  intervals: z.any().nullable().optional().describe('Structured interval workout: {warmup, mainSet, cooldown}'),
  reason: z.string().optional().describe('Explanation of why this workout is recommended'),
});

export const createWorkoutTool = (tool as any)(
  async ({
    scheduledDate,
    workoutType,
    name,
    targetDistanceMeters,
    targetDurationSeconds,
    targetPaceMin,
    targetPaceMax,
    targetPaceAvg,
    targetHrZone,
    targetHrMin,
    targetHrMax,
    coachNotes,
    intervals,
    reason,
  }: {
    scheduledDate: string;
    workoutType: string;
    name?: string;
    targetDistanceMeters?: number;
    targetDurationSeconds?: number;
    targetPaceMin?: number;
    targetPaceMax?: number;
    targetPaceAvg?: number;
    targetHrZone?: number;
    targetHrMin?: number;
    targetHrMax?: number;
    coachNotes?: string;
    intervals?: any;
    reason?: string;
  }) => {
    try {
      // Create pending action instead of executing directly
      const pendingAction = {
        action_type: 'create_workout',
        action_payload: {
          scheduled_date: scheduledDate,
          workout_type: workoutType,
          name,
          target_distance_meters: targetDistanceMeters,
          target_duration_seconds: targetDurationSeconds,
          target_pace_min: targetPaceMin,
          target_pace_max: targetPaceMax,
          target_pace_avg: targetPaceAvg,
          target_hr_zone: targetHrZone,
          target_hr_min: targetHrMin,
          target_hr_max: targetHrMax,
          coach_notes: coachNotes,
          intervals,
        },
        agent_reasoning: reason || `Creating new ${workoutType} workout for ${scheduledDate}`,
      };

      return JSON.stringify({
        success: true,
        pending: true,
        message: `New ${workoutType} workout for ${scheduledDate} suggested. Please review and approve.`,
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'create_workout',
    description:
      'Suggest creating a new workout in the training plan. IMPORTANT: This SUGGESTS changes - user must approve before execution. Supports full interval workouts with structured format.',
    schema: createWorkoutSchema,
  } as any
);

/**
 * Delete Workout Tool
 * Suggests deleting a workout from the training plan
 */
const deleteWorkoutSchema = z.object({
  workoutId: z.number().describe('The ID of the workout to delete'),
  reason: z.string().optional().describe('Explanation of why this workout should be deleted'),
});

export const deleteWorkoutTool = (tool as any)(
  async ({ workoutId, reason }: { workoutId: number; reason?: string }) => {
    try {
      // Create pending action instead of executing directly
      const pendingAction = {
        action_type: 'delete_workout',
        action_payload: {
          workout_id: workoutId,
        },
        agent_reasoning: reason || `Deleting workout ${workoutId}`,
      };

      return JSON.stringify({
        success: true,
        pending: true,
        message: 'Workout deletion suggested. Please review and approve the change.',
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'delete_workout',
    description: 'Suggest deleting a workout from the training plan. IMPORTANT: This SUGGESTS changes - user must approve before execution.',
    schema: deleteWorkoutSchema,
  } as any
);

/**
 * Bulk Modify Workouts Tool
 * Suggests modifying multiple workouts matching specific criteria
 */
const bulkModifyWorkoutsSchema = z.object({
  criteria: z.object({
    workout_types: z.array(z.string()).optional().describe('Filter by workout types (easy, long_run, tempo, intervals, recovery, race, rest)'),
    date_range: z.object({
      start_date: z.string().describe('YYYY-MM-DD format'),
      end_date: z.string().describe('YYYY-MM-DD format'),
    }).optional().describe('Absolute date range'),
    days_from_now: z.object({
      min: z.number().optional().describe('Minimum days from today'),
      max: z.number().optional().describe('Maximum days from today'),
    }).optional().describe('Relative date range from today'),
    exclude_completed: z.boolean().default(true).describe('Never modify completed workouts (always true for safety)'),
    limit: z.number().default(50).describe('Max workouts to modify (safety limit, max 100)'),
  }).describe('Criteria to match workouts'),
  updates: z.object({
    target_distance_meters: z.number().nullable().optional(),
    target_duration_seconds: z.number().nullable().optional(),
    target_pace_min: z.number().nullable().optional(),
    target_pace_max: z.number().nullable().optional(),
    target_pace_avg: z.number().nullable().optional(),
    target_hr_zone: z.number().min(1).max(5).nullable().optional(),
    target_hr_min: z.number().nullable().optional(),
    target_hr_max: z.number().nullable().optional(),
    workout_type: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    coach_notes: z.string().nullable().optional(),
    intervals: z.any().nullable().optional(),
  }).describe('Updates to apply to matched workouts'),
  reason: z.string().describe('Explain why this bulk modification is recommended'),
});

export const bulkModifyWorkoutsTool = (tool as any)(
  async ({ criteria, updates, reason }: {
    criteria: {
      workout_types?: string[];
      date_range?: { start_date: string; end_date: string };
      days_from_now?: { min?: number; max?: number };
      exclude_completed?: boolean;
      limit?: number;
    };
    updates: {
      target_distance_meters?: number;
      target_duration_seconds?: number;
      target_pace_min?: number;
      target_pace_max?: number;
      target_pace_avg?: number;
      target_hr_zone?: number;
      target_hr_min?: number;
      target_hr_max?: number;
      workout_type?: string;
      name?: string;
      description?: string;
      coach_notes?: string;
      intervals?: any;
    };
    reason: string;
  }) => {
    try {
      // Create pending action with criteria - preview will be fetched during approval
      const pendingAction = {
        action_type: 'bulk_modify_workouts',
        action_payload: {
          criteria,
          updates,
        },
        agent_reasoning: reason,
      };

      // Build a descriptive message based on criteria
      let description = 'Bulk modification suggested: ';
      if (criteria.workout_types && criteria.workout_types.length > 0) {
        description += `all ${criteria.workout_types.join(', ')} workouts`;
      } else {
        description += 'all matching workouts';
      }

      if (criteria.date_range) {
        description += ` from ${criteria.date_range.start_date} to ${criteria.date_range.end_date}`;
      } else if (criteria.days_from_now) {
        if (criteria.days_from_now.min !== undefined && criteria.days_from_now.max !== undefined) {
          description += ` in the next ${criteria.days_from_now.min}-${criteria.days_from_now.max} days`;
        } else if (criteria.days_from_now.max !== undefined) {
          description += ` in the next ${criteria.days_from_now.max} days`;
        }
      }

      description += '. Please review and approve the bulk modification.';

      return JSON.stringify({
        success: true,
        pending: true,
        message: description,
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'bulk_modify_workouts',
    description: `Suggest modifications to multiple workouts matching specific criteria. Use when user wants to change "all X workouts" or "all workouts in Y period".

IMPORTANT: This SUGGESTS bulk changes - user must approve before execution. Only affects FUTURE/INCOMPLETE workouts.

Examples:
- "All my long runs need to be at Zone 2" → criteria: { workout_types: ['long_run'], exclude_completed: true }
- "Reduce all tempo runs in next 4 weeks" → criteria: { workout_types: ['tempo'], days_from_now: { min: 0, max: 28 } }
- "Change all easy runs to 5:30 pace" → criteria: { workout_types: ['easy'] }, updates: { target_pace_avg: 5.5 }`,
    schema: bulkModifyWorkoutsSchema,
  } as any
);

/**
 * Swap Training Weeks Tool
 * Suggests swapping all workouts between two training weeks
 */
const swapTrainingWeeksSchema = z.object({
  week1StartDate: z.string().describe('First day of week 1 in YYYY-MM-DD format (Sunday or Monday depending on user preference)'),
  week2StartDate: z.string().describe('First day of week 2 in YYYY-MM-DD format (Sunday or Monday depending on user preference)'),
  reason: z.string().describe('Detailed explanation of why swapping these weeks is beneficial (e.g., "Swapping peak week with recovery week due to illness" or "Moving hard week to avoid travel conflict")'),
});

export const swapTrainingWeeksTool = (tool as any)(
  async ({ week1StartDate, week2StartDate, reason }: {
    week1StartDate: string;
    week2StartDate: string;
    reason: string;
  }) => {
    try {
      // Create pending action for swapping entire weeks
      const pendingAction = {
        action_type: 'swap_training_weeks',
        action_payload: {
          week1_start_date: week1StartDate,
          week2_start_date: week2StartDate,
        },
        agent_reasoning: reason,
      };

      return JSON.stringify({
        success: true,
        pending: true,
        message: `Week swap suggested: Week of ${week1StartDate} ↔ Week of ${week2StartDate}. Please review and approve.`,
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'swap_training_weeks',
    description: `Suggest swapping two entire training weeks. All workouts in week 1 will move to week 2 and vice versa, preserving the day of week (e.g., Monday → Monday).

IMPORTANT: This SUGGESTS the swap - user must approve before execution.

Use Cases:
- Injury/recovery: Swap hard week with easier week
- Schedule conflicts: Swap peak week when traveling
- Life events: Rearrange training blocks
- Strategic adjustments: Move recovery weeks around

Example: "Swap week of Feb 10 with week of Feb 17" → swaps all workouts between these two weeks

Note: Weeks start on Sunday or Monday based on user's week_starts_on preference. Provide the first day of each week.`,
    schema: swapTrainingWeeksSchema,
  } as any
);

/**
 * Approve Plan Tool
 * Used when the plan is sound and no modifications are needed
 * This allows the model to always call a tool (either modification or approval)
 */
const approvePlanSchema = z.object({
  verdict: z.enum(['sound', 'needs_minor_adjustment', 'well_structured']).describe('Your assessment of the plan'),
  reasoning: z.string().describe('Detailed explanation of why the plan is sound and no changes are needed'),
});

export const approvePlanTool = (tool as any)(
  async ({ verdict, reasoning }: { verdict: 'sound' | 'needs_minor_adjustment' | 'well_structured'; reasoning: string }) => {
    try {
      return JSON.stringify({
        success: true,
        verdict,
        message: `Plan assessment complete: ${verdict.toUpperCase()}. ${reasoning}`,
        noChangesNeeded: true,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'approve_plan',
    description: `Call this tool when the training plan is SOUND and does NOT need modifications.

IMPORTANT: You MUST call either this tool OR a modification tool. You cannot just write text.

Use this when:
- The plan structure is appropriate for the training phase
- Volume progression is acceptable
- Intensity distribution is balanced
- No changes are needed

Do NOT call this if you have ANY recommendations for changes - call the modification tools instead.`,
    schema: approvePlanSchema,
  } as any
);

/**
 * Export all tools as an array for easy consumption
 */
export const workoutTools: any[] = [
  shiftWorkoutTool,
  modifyWorkoutTool,
  createWorkoutTool,
  deleteWorkoutTool,
  bulkModifyWorkoutsTool,
  swapTrainingWeeksTool,
  approvePlanTool,
];
