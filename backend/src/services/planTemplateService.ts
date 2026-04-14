/**
 * Plan Template Service
 *
 * Generates training plans from pre-defined templates.
 * Each template includes week-by-week workout schedules.
 */

import { createTrainingPlan } from '../models/TrainingPlan';
import { createPlannedWorkout } from '../models/PlannedWorkout';

interface TemplateWorkout {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  type: string;
  name: string;
  description: string;
  distanceMeters: number;
  durationSeconds?: number;
}

interface WeekTemplate {
  weekNumber: number;
  workouts: TemplateWorkout[];
}

interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  durationWeeks: number;
  goalType: string;
  weeks: WeekTemplate[];
}

// Helper to add days to a date
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Convert km to meters
const km = (kilometers: number) => kilometers * 1000;

/**
 * Pre-defined plan templates
 */
const templates: Record<string, PlanTemplate> = {
  'marathon-beginner': {
    id: 'marathon-beginner',
    name: 'Marathon - Beginner (16 weeks)',
    description: 'Build up to 42.2km with gradual progression',
    durationWeeks: 16,
    goalType: 'marathon',
    weeks: generateMarathonBeginnerWeeks(),
  },
  'half-marathon': {
    id: 'half-marathon',
    name: 'Half Marathon (12 weeks)',
    description: 'Train for 21.1km with balanced speed and endurance',
    durationWeeks: 12,
    goalType: 'half_marathon',
    weeks: generateHalfMarathonWeeks(),
  },
  '10k-improver': {
    id: '10k-improver',
    name: '10K Improver (8 weeks)',
    description: 'Get faster at 10km with tempo runs and intervals',
    durationWeeks: 8,
    goalType: '10k',
    weeks: generate10KImproverWeeks(),
  },
  'fitness-maintenance': {
    id: 'fitness-maintenance',
    name: 'Fitness Maintenance (8 weeks)',
    description: 'Stay fit with consistent, enjoyable running',
    durationWeeks: 8,
    goalType: 'general',
    weeks: generateFitnessMaintenanceWeeks(),
  },
};

/**
 * Generate Marathon Beginner plan (16 weeks, 4 runs/week)
 * Progressive long runs from 10km to 32km
 */
function generateMarathonBeginnerWeeks(): WeekTemplate[] {
  const weeks: WeekTemplate[] = [];

  // Base distances for long runs (km) - progressive build with step-backs
  const longRunDistances = [10, 12, 14, 12, 16, 18, 14, 20, 22, 18, 26, 28, 22, 32, 20, 10];

  for (let week = 1; week <= 16; week++) {
    const longRunKm = longRunDistances[week - 1];
    const easyRunKm = Math.min(6 + week * 0.3, 10); // Easy runs grow slowly
    const tempoKm = week <= 4 ? 0 : Math.min(5 + (week - 4) * 0.5, 10); // Tempo starts week 5

    const workouts: TemplateWorkout[] = [
      // Tuesday - Easy run
      {
        dayOfWeek: 2,
        type: 'easy',
        name: 'Easy Run',
        description: 'Comfortable pace, conversational effort',
        distanceMeters: km(easyRunKm),
      },
      // Thursday - Tempo or Easy (alternating)
      {
        dayOfWeek: 4,
        type: week % 2 === 0 && week > 4 ? 'tempo' : 'easy',
        name: week % 2 === 0 && week > 4 ? 'Tempo Run' : 'Easy Run',
        description: week % 2 === 0 && week > 4
          ? 'Comfortably hard pace, controlled breathing'
          : 'Comfortable pace, conversational effort',
        distanceMeters: km(week % 2 === 0 && week > 4 ? tempoKm : easyRunKm),
      },
      // Saturday - Easy run
      {
        dayOfWeek: 6,
        type: 'easy',
        name: 'Easy Run',
        description: 'Relaxed recovery pace',
        distanceMeters: km(easyRunKm - 1),
      },
      // Sunday - Long run
      {
        dayOfWeek: 0,
        type: 'long',
        name: 'Long Run',
        description: `Build endurance with ${longRunKm}km at easy pace`,
        distanceMeters: km(longRunKm),
      },
    ];

    weeks.push({ weekNumber: week, workouts });
  }

  return weeks;
}

/**
 * Generate Half Marathon plan (12 weeks, 4 runs/week)
 */
function generateHalfMarathonWeeks(): WeekTemplate[] {
  const weeks: WeekTemplate[] = [];

  const longRunDistances = [8, 10, 12, 10, 14, 16, 12, 18, 16, 20, 14, 8];

  for (let week = 1; week <= 12; week++) {
    const longRunKm = longRunDistances[week - 1];
    const easyRunKm = Math.min(5 + week * 0.3, 8);

    const workouts: TemplateWorkout[] = [
      // Tuesday - Easy
      {
        dayOfWeek: 2,
        type: 'easy',
        name: 'Easy Run',
        description: 'Comfortable pace',
        distanceMeters: km(easyRunKm),
      },
      // Thursday - Tempo/Intervals
      {
        dayOfWeek: 4,
        type: week % 2 === 0 ? 'tempo' : 'intervals',
        name: week % 2 === 0 ? 'Tempo Run' : 'Interval Training',
        description: week % 2 === 0
          ? 'Comfortably hard sustained effort'
          : '5-6 x 800m with recovery jogs',
        distanceMeters: km(week % 2 === 0 ? 7 : 6),
      },
      // Saturday - Easy
      {
        dayOfWeek: 6,
        type: 'easy',
        name: 'Easy Run',
        description: 'Recovery pace',
        distanceMeters: km(easyRunKm - 1),
      },
      // Sunday - Long
      {
        dayOfWeek: 0,
        type: 'long',
        name: 'Long Run',
        description: `${longRunKm}km at easy pace`,
        distanceMeters: km(longRunKm),
      },
    ];

    weeks.push({ weekNumber: week, workouts });
  }

  return weeks;
}

/**
 * Generate 10K Improver plan (8 weeks, 4 runs/week)
 */
function generate10KImproverWeeks(): WeekTemplate[] {
  const weeks: WeekTemplate[] = [];

  const longRunDistances = [8, 10, 10, 8, 12, 12, 10, 6];

  for (let week = 1; week <= 8; week++) {
    const longRunKm = longRunDistances[week - 1];

    const workouts: TemplateWorkout[] = [
      // Tuesday - Intervals
      {
        dayOfWeek: 2,
        type: 'intervals',
        name: 'Speed Work',
        description: week <= 4
          ? '6 x 400m fast with 90s recovery'
          : '4 x 800m fast with 2min recovery',
        distanceMeters: km(5),
      },
      // Thursday - Tempo
      {
        dayOfWeek: 4,
        type: 'tempo',
        name: 'Tempo Run',
        description: '20-30 min at threshold pace',
        distanceMeters: km(6 + week * 0.25),
      },
      // Saturday - Easy
      {
        dayOfWeek: 6,
        type: 'easy',
        name: 'Easy Run',
        description: 'Recovery pace',
        distanceMeters: km(5),
      },
      // Sunday - Long
      {
        dayOfWeek: 0,
        type: 'long',
        name: 'Long Run',
        description: `${longRunKm}km building endurance`,
        distanceMeters: km(longRunKm),
      },
    ];

    weeks.push({ weekNumber: week, workouts });
  }

  return weeks;
}

/**
 * Generate Fitness Maintenance plan (8 weeks, 3 runs/week)
 */
function generateFitnessMaintenanceWeeks(): WeekTemplate[] {
  const weeks: WeekTemplate[] = [];

  for (let week = 1; week <= 8; week++) {
    const workouts: TemplateWorkout[] = [
      // Tuesday - Easy
      {
        dayOfWeek: 2,
        type: 'easy',
        name: 'Easy Run',
        description: 'Comfortable pace, enjoy the run',
        distanceMeters: km(5),
      },
      // Thursday - Easy
      {
        dayOfWeek: 4,
        type: 'easy',
        name: 'Easy Run',
        description: 'Comfortable pace, stress relief',
        distanceMeters: km(5),
      },
      // Sunday - Longer easy
      {
        dayOfWeek: 0,
        type: 'long',
        name: 'Weekend Run',
        description: 'Slightly longer easy run to explore',
        distanceMeters: km(8),
      },
    ];

    weeks.push({ weekNumber: week, workouts });
  }

  return weeks;
}

/**
 * Create a training plan from a template
 */
export async function createPlanFromTemplate(
  userId: number,
  templateId: string
): Promise<{ plan: any; workoutCount: number }> {
  const template = templates[templateId];

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Calculate start date (next Monday)
  const today = new Date();
  const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
  const startDate = addDays(today, daysUntilMonday);
  startDate.setHours(0, 0, 0, 0);

  // Calculate end date
  const endDate = addDays(startDate, template.durationWeeks * 7 - 1);

  // Create the training plan
  const plan = await createTrainingPlan({
    user_id: userId,
    name: template.name,
    description: template.description,
    start_date: startDate,
    end_date: endDate,
    total_weeks: template.durationWeeks,
    source: 'manual', // Using 'manual' since there's no 'template' option yet
    is_active: true,
  });

  // Generate all workouts
  let workoutCount = 0;

  for (const week of template.weeks) {
    // Calculate start of this week
    const weekStart = addDays(startDate, (week.weekNumber - 1) * 7);

    for (const workout of week.workouts) {
      // Calculate workout date based on day of week
      const daysFromWeekStart = (workout.dayOfWeek - 1 + 7) % 7; // Monday = 0
      const workoutDate = addDays(weekStart, daysFromWeekStart);

      await createPlannedWorkout({
        training_plan_id: plan.id,
        user_id: userId,
        scheduled_date: workoutDate.toISOString().split('T')[0],
        workout_type: workout.type,
        name: workout.name,
        description: workout.description,
        target_distance_meters: workout.distanceMeters,
        target_duration_seconds: workout.durationSeconds,
        completion_status: 'pending',
      });

      workoutCount++;
    }
  }

  console.log(`Created plan "${template.name}" with ${workoutCount} workouts for user ${userId}`);

  return { plan, workoutCount };
}

/**
 * Get available templates
 */
export function getAvailableTemplates(): Array<{
  id: string;
  name: string;
  description: string;
  durationWeeks: number;
  goalType: string;
}> {
  return Object.values(templates).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    durationWeeks: t.durationWeeks,
    goalType: t.goalType,
  }));
}
