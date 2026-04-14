import { Request, Response } from 'express';
import {
  getTrainingPlansByUserId,
  getActivePlan,
  createTrainingPlan,
  updateTrainingPlan,
  deleteTrainingPlan,
} from '../models/TrainingPlan';
import {
  getPlannedWorkoutsByPlan,
  getPlannedWorkoutsByDateRange,
  getUpcomingWorkouts,
  createPlannedWorkout,
  updatePlannedWorkout,
  markWorkoutCompleted,
  deletePlannedWorkout,
} from '../models/PlannedWorkout';
import { createPlanFromFile } from '../services/trainingPlanService';
import { createPlanFromTemplate } from '../services/planTemplateService';
import { generateProactiveAlerts } from '../services/alertService';
import {
  generateSmartPlan,
  previewSmartPlan,
  getGoalTypeOptions,
  SmartPlanInput,
  GoalType,
} from '../services/smartPlanGeneratorService';

/**
 * Convert database/internal errors to user-friendly messages
 */
function getUserFriendlyError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'An unexpected error occurred. Please try again.';
  }

  const message = error.message.toLowerCase();

  // Database constraint errors
  if (message.includes('duplicate key') || message.includes('unique constraint')) {
    return 'This plan could not be saved due to a data conflict. Please try again or contact support if the issue persists.';
  }

  if (message.includes('foreign key') || message.includes('violates foreign key')) {
    return 'This operation references data that no longer exists. Please refresh and try again.';
  }

  if (message.includes('connection') || message.includes('timeout')) {
    return 'Unable to connect to the server. Please check your connection and try again.';
  }

  // File parsing errors - these are already user-friendly
  if (message.includes('no workouts found')) {
    return 'No workouts were found in the uploaded file. Please check the file format and try again.';
  }

  if (message.includes('no valid dates')) {
    return 'The file contains invalid or missing dates. Please ensure all workouts have valid dates in YYYY-MM-DD format.';
  }

  if (message.includes('only csv and pdf')) {
    return 'Only CSV and PDF files are supported. Please upload a valid training plan file.';
  }

  // Generic fallback
  return 'Failed to process your request. Please try again or contact support if the issue persists.';
}

// Training Plan Controllers

export async function getPlans(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const plans = await getTrainingPlansByUserId(userId);
    res.json({ plans });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Failed to get training plans' });
  }
}

export async function getActivePlanController(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const plan = await getActivePlan(userId);
    res.json({ plan });
  } catch (error) {
    console.error('Get active plan error:', error);
    res.status(500).json({ error: 'Failed to get active plan' });
  }
}

export async function uploadPlanFile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const file = req.file;
    const { goalId, planName, identifyPeaks, peakWeeksCount, taperWeeks, enableCarbLoading } = req.body;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    if (!planName) {
      res.status(400).json({ error: 'Plan name is required' });
      return;
    }

    const result = await createPlanFromFile(
      userId,
      goalId ? parseInt(goalId) : null,
      file,
      planName,
      identifyPeaks === 'true',
      peakWeeksCount ? parseInt(peakWeeksCount) : 1,
      taperWeeks ? parseInt(taperWeeks) : 2,
      enableCarbLoading === 'true'
    );
    res.json(result);
  } catch (error) {
    console.error('Upload plan error:', error);
    res.status(500).json({ error: getUserFriendlyError(error) });
  }
}

export async function createManualPlan(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const plan = await createTrainingPlan({ user_id: userId, ...req.body });
    res.json({ plan });
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ error: getUserFriendlyError(error) });
  }
}

export async function createFromTemplate(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { templateId } = req.body;

    if (!templateId) {
      res.status(400).json({ error: 'Template ID is required' });
      return;
    }

    const result = await createPlanFromTemplate(userId, templateId);

    res.json({
      plan: result.plan,
      workoutCount: result.workoutCount,
      message: `Created "${result.plan.name}" with ${result.workoutCount} workouts`,
    });
  } catch (error) {
    console.error('Create from template error:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: getUserFriendlyError(error) });
    }
  }
}

export async function generateSmartPlanController(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const {
      goalType,
      targetWeeklyKm,
      daysPerWeek,
      raceDate,
      targetTimeSeconds,
      longRunDay,
      planName,
    } = req.body;

    // Validate required fields
    if (!goalType) {
      res.status(400).json({ error: 'Goal type is required' });
      return;
    }

    if (!daysPerWeek || ![3, 4, 5, 6].includes(daysPerWeek)) {
      res.status(400).json({ error: 'Days per week must be 3, 4, 5, or 6' });
      return;
    }

    if (targetWeeklyKm !== 'baseline' && (typeof targetWeeklyKm !== 'number' || targetWeeklyKm <= 0)) {
      res.status(400).json({ error: 'Target weekly km must be a positive number or "baseline"' });
      return;
    }

    const input: SmartPlanInput = {
      userId,
      goalType: goalType as GoalType,
      targetWeeklyKm: targetWeeklyKm === 'baseline' ? 'baseline' : Number(targetWeeklyKm),
      daysPerWeek,
      raceDate,
      targetTimeSeconds: targetTimeSeconds ? Number(targetTimeSeconds) : undefined,
      longRunDay: longRunDay || 'sunday',
      planName,
    };

    const result = await generateSmartPlan(input);

    res.json({
      plan: result.plan,
      workoutCount: result.workouts.length,
      summary: result.summary,
      message: `Created "${result.plan.name}" with ${result.workouts.length} workouts`,
    });
  } catch (error) {
    console.error('Generate smart plan error:', error);
    res.status(500).json({ error: getUserFriendlyError(error) });
  }
}

export async function previewSmartPlanController(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const {
      goalType,
      targetWeeklyKm,
      daysPerWeek,
      raceDate,
      targetTimeSeconds,
      longRunDay,
    } = req.body;

    // Validate required fields
    if (!goalType) {
      res.status(400).json({ error: 'Goal type is required' });
      return;
    }

    if (!daysPerWeek || ![3, 4, 5, 6].includes(daysPerWeek)) {
      res.status(400).json({ error: 'Days per week must be 3, 4, 5, or 6' });
      return;
    }

    const input: SmartPlanInput = {
      userId,
      goalType: goalType as GoalType,
      targetWeeklyKm: targetWeeklyKm === 'baseline' ? 'baseline' : Number(targetWeeklyKm) || 'baseline',
      daysPerWeek,
      raceDate,
      targetTimeSeconds: targetTimeSeconds ? Number(targetTimeSeconds) : undefined,
      longRunDay: longRunDay || 'sunday',
    };

    const preview = await previewSmartPlan(input);

    res.json(preview);
  } catch (error) {
    console.error('Preview smart plan error:', error);
    res.status(500).json({ error: getUserFriendlyError(error) });
  }
}

export function getSmartPlanOptions(_req: Request, res: Response): void {
  const options = getGoalTypeOptions();
  res.json({ goalTypes: options });
}

export async function updatePlanController(req: Request, res: Response): Promise<void> {
  try {
    const planId = parseInt(req.params.id);
    const plan = await updateTrainingPlan(planId, req.body);
    res.json({ plan });
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ error: 'Failed to update training plan' });
  }
}

export async function deletePlanController(req: Request, res: Response): Promise<void> {
  try {
    const planId = parseInt(req.params.id);
    await deleteTrainingPlan(planId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'Failed to delete training plan' });
  }
}

// Workout Controllers

export async function getWorkouts(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { planId, startDate, endDate, days } = req.query;

    let workouts;
    if (planId) {
      workouts = await getPlannedWorkoutsByPlan(parseInt(planId as string));
    } else if (startDate && endDate) {
      workouts = await getPlannedWorkoutsByDateRange(
        userId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
    } else if (days) {
      const daysNum = parseInt(days as string);

      // For large day ranges (like calendar with 365 days), fetch ALL workouts
      // including past workouts for weekly total calculations
      if (daysNum > 30) {
        // Fetch from 60 days ago to cover past weeks in current month view
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 60);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + daysNum);
        workouts = await getPlannedWorkoutsByDateRange(userId, startDate, endDate);
      } else {
        // For smaller ranges (dashboard "Next 7 Days"), use upcoming workouts
        // which excludes completed workouts
        workouts = await getUpcomingWorkouts(userId, daysNum);
      }
    } else {
      workouts = await getUpcomingWorkouts(userId, 30);
    }

    res.json({ workouts });
  } catch (error) {
    console.error('Get workouts error:', error);
    res.status(500).json({ error: 'Failed to get workouts' });
  }
}

export async function addWorkout(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    console.log('📝 Creating workout for user:', userId);
    console.log('📝 Request body:', req.body);

    const workout = await createPlannedWorkout({ user_id: userId, ...req.body });

    console.log('✅ Workout created:', workout);
    res.json({ workout });
  } catch (error) {
    console.error('❌ Create workout error:', error);
    res.status(500).json({ error: getUserFriendlyError(error) });
  }
}

export async function updateWorkoutController(req: Request, res: Response): Promise<void> {
  try {
    const workoutId = parseInt(req.params.id);
    const workout = await updatePlannedWorkout(workoutId, req.body);

    // If the workout's scheduled_date or distance was changed, recalculate peak weeks
    // (Peak weeks are determined by weekly mileage, so both date and distance changes affect them)
    if ((req.body.scheduled_date || req.body.target_distance_meters) && workout.training_plan_id) {
      const { recalculatePeakWeeks } = await import('../services/trainingPlanService');
      await recalculatePeakWeeks(workout.training_plan_id);
      console.log('🔄 Peak weeks recalculated after workout update');
    }

    res.json({ workout });
  } catch (error) {
    console.error('Update workout error:', error);
    res.status(500).json({ error: 'Failed to update workout' });
  }
}

export async function deleteWorkoutController(req: Request, res: Response): Promise<void> {
  try {
    const workoutId = parseInt(req.params.id);

    // Get workout before deleting to retrieve training_plan_id
    const { getPlannedWorkoutById } = await import('../models/PlannedWorkout');
    const workout = await getPlannedWorkoutById(workoutId);
    const trainingPlanId = workout?.training_plan_id;

    await deletePlannedWorkout(workoutId);

    // Recalculate peak weeks after deletion if workout was part of a plan with peak identification
    if (trainingPlanId) {
      const { recalculatePeakWeeks } = await import('../services/trainingPlanService');
      await recalculatePeakWeeks(trainingPlanId);
      console.log('🔄 Peak weeks recalculated after workout deletion');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete workout error:', error);
    res.status(500).json({ error: 'Failed to delete workout' });
  }
}

export async function completeWorkout(req: Request, res: Response): Promise<void> {
  try {
    const workoutId = parseInt(req.params.id);
    const { activityId, status } = req.body;

    if (!activityId) {
      res.status(400).json({ error: 'Activity ID is required' });
      return;
    }

    const workout = await markWorkoutCompleted(workoutId, activityId, status || 'completed');
    res.json({ workout });
  } catch (error) {
    console.error('Complete workout error:', error);
    res.status(500).json({ error: 'Failed to mark workout complete' });
  }
}

// Alert Controller

export async function getAlerts(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const alerts = await generateProactiveAlerts(userId);
    res.json({ alerts });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to generate alerts' });
  }
}
