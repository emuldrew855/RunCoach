/**
 * Smart Plan Generator Service
 *
 * Generates intelligent, personalized training plans based on:
 * - User's current fitness level (from baseline metrics)
 * - Goal type and target time
 * - Available training days per week
 * - Race date (if applicable)
 *
 * Key features:
 * - Progressive volume build with 10% weekly cap
 * - Step-back recovery weeks every 4th week
 * - Taper period for races
 * - Pace targets based on goal or current fitness
 */

import { createTrainingPlan, deactivateOtherPlans } from '../models/TrainingPlan';
import { bulkCreatePlannedWorkouts } from '../models/PlannedWorkout';
import { getProfileByUserId } from '../models/UserProfile';
import { get4WeekRollingBaseline } from './baselineMetricsService';
import { PlannedWorkout, TrainingPlan, RollingBaseline, UserProfile, PersonalBests } from '../types/models';

// ============================================================================
// Types
// ============================================================================

export type GoalType = '5k' | '10k' | 'half_marathon' | 'marathon' | 'general';

export interface SmartPlanInput {
  userId: number;
  goalType: GoalType;
  targetWeeklyKm: number | 'baseline';
  daysPerWeek: 3 | 4 | 5 | 6;
  raceDate?: string;           // ISO date string
  targetTimeSeconds?: number;  // Goal finish time in seconds
  longRunDay?: 'saturday' | 'sunday';
  planName?: string;
}

export interface PaceTargets {
  easy: { min: number; max: number };      // min/km in decimal
  tempo: { min: number; max: number };
  interval: { min: number; max: number };
  longRun: { min: number; max: number };
}

export interface WorkoutTemplate {
  dayOffset: number;  // Days from week start (Monday = 0)
  type: 'easy' | 'tempo' | 'intervals' | 'long' | 'recovery';
  distancePercent: number;  // Percent of weekly volume
  name: string;
  descriptionTemplate: string;
}

export interface GeneratedPlanSummary {
  totalWeeks: number;
  buildWeeks: number;
  taperWeeks: number;
  peakWeeklyKm: number;
  startingWeeklyKm: number;
  totalWorkouts: number;
  hasTaper: boolean;
  taperStartsWeek?: number;
  paceTargets: PaceTargets | null;
}

export interface GeneratedPlan {
  plan: TrainingPlan;
  workouts: PlannedWorkout[];
  summary: GeneratedPlanSummary;
}

export interface PreviewPlan {
  weeks: PreviewWeek[];
  summary: GeneratedPlanSummary;
}

export interface PreviewWeek {
  weekNumber: number;
  isStepBack: boolean;
  isTaper: boolean;
  totalKm: number;
  workouts: PreviewWorkout[];
}

export interface PreviewWorkout {
  dayOfWeek: string;
  type: string;
  name: string;
  distanceKm: number;
  paceTarget?: string;
  hrZone?: number;
  description: string;
}

// ============================================================================
// Constants
// ============================================================================

const RACE_DISTANCES: Record<GoalType, number> = {
  '5k': 5,
  '10k': 10,
  'half_marathon': 21.0975,
  'marathon': 42.195,
  'general': 0,
};

const DEFAULT_PLAN_WEEKS: Record<GoalType, number> = {
  'marathon': 16,
  'half_marathon': 12,
  '10k': 8,
  '5k': 6,
  'general': 8,
};

const TAPER_WEEKS: Record<GoalType, number> = {
  'marathon': 2,
  'half_marathon': 1,
  '10k': 1,
  '5k': 1,
  'general': 0,
};

const MAX_LONG_RUN_KM: Record<GoalType, number> = {
  'marathon': 35,
  'half_marathon': 20,
  '10k': 14,
  '5k': 10,
  'general': 15,
};

// Peak weekly volume multipliers (how much higher than current baseline)
const PEAK_VOLUME_MULTIPLIER: Record<GoalType, number> = {
  'marathon': 1.5,
  'half_marathon': 1.4,
  '10k': 1.3,
  '5k': 1.25,
  'general': 1.1,
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================================
// Workout Distribution Templates
// ============================================================================

function getWorkoutTemplates(daysPerWeek: number, longRunDayOffset: number): WorkoutTemplate[] {
  // longRunDayOffset: 5 = Saturday, 6 = Sunday (relative to Monday = 0)
  // Pre-long-run easy should be the day before the long run
  const preLongRunOffset = longRunDayOffset === 5 ? 4 : 5; // Friday if long run Sat, Saturday if long run Sun

  switch (daysPerWeek) {
    case 3:
      return [
        { dayOffset: 1, type: 'easy', distancePercent: 0.25, name: 'Easy Run', descriptionTemplate: 'Comfortable pace, conversational effort' },
        { dayOffset: 3, type: 'easy', distancePercent: 0.25, name: 'Easy Run', descriptionTemplate: 'Comfortable pace' },
        { dayOffset: longRunDayOffset, type: 'long', distancePercent: 0.50, name: 'Long Run', descriptionTemplate: 'Build endurance at easy pace' },
      ];

    case 4:
      return [
        { dayOffset: 1, type: 'easy', distancePercent: 0.20, name: 'Easy Run', descriptionTemplate: 'Comfortable pace, conversational effort' },
        { dayOffset: 3, type: 'tempo', distancePercent: 0.20, name: 'Tempo Run', descriptionTemplate: 'Tempo or threshold effort' },
        { dayOffset: preLongRunOffset, type: 'easy', distancePercent: 0.15, name: 'Easy Run', descriptionTemplate: 'Pre-long run shakeout' },
        { dayOffset: longRunDayOffset, type: 'long', distancePercent: 0.45, name: 'Long Run', descriptionTemplate: 'Build endurance at easy pace' },
      ];

    case 5:
      return [
        { dayOffset: 0, type: 'easy', distancePercent: 0.15, name: 'Easy Run', descriptionTemplate: 'Start the week with comfortable effort' },
        { dayOffset: 1, type: 'tempo', distancePercent: 0.18, name: 'Tempo Run', descriptionTemplate: 'Tempo or threshold effort' },
        { dayOffset: 3, type: 'easy', distancePercent: 0.15, name: 'Easy Run', descriptionTemplate: 'Mid-week recovery' },
        { dayOffset: preLongRunOffset, type: 'easy', distancePercent: 0.12, name: 'Easy Run', descriptionTemplate: 'Pre-long run shakeout' },
        { dayOffset: longRunDayOffset, type: 'long', distancePercent: 0.40, name: 'Long Run', descriptionTemplate: 'Build endurance at easy pace' },
      ];

    case 6:
      return [
        { dayOffset: 0, type: 'easy', distancePercent: 0.12, name: 'Easy Run', descriptionTemplate: 'Start the week easy' },
        { dayOffset: 1, type: 'intervals', distancePercent: 0.14, name: 'Speed Work', descriptionTemplate: 'Interval session with recovery jogs' },
        { dayOffset: 2, type: 'recovery', distancePercent: 0.10, name: 'Recovery Run', descriptionTemplate: 'Very easy, active recovery' },
        { dayOffset: 3, type: 'tempo', distancePercent: 0.16, name: 'Tempo Run', descriptionTemplate: 'Sustained threshold effort' },
        { dayOffset: preLongRunOffset, type: 'easy', distancePercent: 0.12, name: 'Easy Run', descriptionTemplate: 'Pre-long run shakeout' },
        { dayOffset: longRunDayOffset, type: 'long', distancePercent: 0.36, name: 'Long Run', descriptionTemplate: 'Build endurance at easy pace' },
      ];

    default:
      return getWorkoutTemplates(4, longRunDayOffset); // Fallback to 4 days
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getNextMonday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : (8 - day);
  return addDays(d, daysUntilMonday);
}

function formatPace(paceMinKm: number): string {
  const minutes = Math.floor(paceMinKm);
  const seconds = Math.round((paceMinKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

function formatPaceRange(min: number, max: number): string {
  return `${formatPace(min)} - ${formatPace(max)}`;
}

function isStepBackWeek(weekNumber: number): boolean {
  return weekNumber % 4 === 0;
}

// ============================================================================
// Fitness Data Retrieval
// ============================================================================

interface FitnessData {
  currentWeeklyKm: number;
  currentLongestRunKm: number;
  currentPaceMinKm: number | null;
  estimatedPaceFromPB: number | null;
  runningExperienceYears: number;
}

async function getUserFitnessData(userId: number): Promise<FitnessData> {
  const [baseline, profile] = await Promise.all([
    get4WeekRollingBaseline(userId),
    getProfileByUserId(userId),
  ]);

  let currentWeeklyKm = 0;
  let currentLongestRunKm = 0;
  let currentPaceMinKm: number | null = null;

  if (baseline) {
    currentWeeklyKm = baseline.avgDistanceKm;
    currentLongestRunKm = baseline.avgLongestRunKm;
    currentPaceMinKm = baseline.avgPaceMinKm > 0 ? baseline.avgPaceMinKm : null;
  }

  // Fallback to profile if no baseline
  if (currentWeeklyKm === 0 && profile?.typical_weekly_mileage) {
    currentWeeklyKm = profile.typical_weekly_mileage;
    currentLongestRunKm = currentWeeklyKm * 0.3; // Estimate: longest run ~30% of weekly
  }

  // Estimate pace from personal bests if available
  let estimatedPaceFromPB: number | null = null;
  if (profile?.personal_bests) {
    const pbs = profile.personal_bests as PersonalBests;
    // Use 10k PB as best estimate for general pace
    if (pbs['10k']) {
      estimatedPaceFromPB = pbs['10k'] / 60 / 10; // Convert seconds to min/km
    } else if (pbs['5k']) {
      estimatedPaceFromPB = (pbs['5k'] / 60 / 5) * 1.05; // 5k pace + 5%
    } else if (pbs['half_marathon']) {
      estimatedPaceFromPB = pbs['half_marathon'] / 60 / 21.0975;
    } else if (pbs['marathon']) {
      estimatedPaceFromPB = pbs['marathon'] / 60 / 42.195;
    }
  }

  return {
    currentWeeklyKm,
    currentLongestRunKm,
    currentPaceMinKm,
    estimatedPaceFromPB,
    runningExperienceYears: profile?.running_experience_years ?? 0,
  };
}

// ============================================================================
// Volume Progression
// ============================================================================

interface WeekVolume {
  weekNumber: number;
  totalKm: number;
  longRunKm: number;
  isStepBack: boolean;
  isTaper: boolean;
}

function calculateVolumeProgression(
  startingKm: number,
  peakKm: number,
  buildWeeks: number,
  taperWeeks: number,
  maxLongRunKm: number,
  goalType: GoalType
): WeekVolume[] {
  const weeks: WeekVolume[] = [];
  const totalWeeks = buildWeeks + taperWeeks;

  // Calculate weekly increase (capped at 10% of current volume)
  const totalIncrease = peakKm - startingKm;
  const buildWeeksExcludingStepBacks = Math.ceil(buildWeeks * 0.75); // ~25% are step-back weeks
  const weeklyIncrease = Math.min(
    totalIncrease / buildWeeksExcludingStepBacks,
    startingKm * 0.10
  );

  let currentVolume = startingKm;
  let peakVolume = startingKm;
  let buildWeekCount = 0;

  for (let week = 1; week <= totalWeeks; week++) {
    const isTaper = week > buildWeeks;
    const isStepBack = !isTaper && isStepBackWeek(week);

    let weekVolume: number;
    let longRunKm: number;

    if (isTaper) {
      // Taper: reduce volume progressively
      const taperWeek = week - buildWeeks;
      const taperMultiplier = 1 - (taperWeek * 0.25); // 25% reduction per taper week
      weekVolume = peakVolume * Math.max(taperMultiplier, 0.4);
      longRunKm = Math.min(maxLongRunKm * 0.5, weekVolume * 0.4);
    } else if (isStepBack) {
      // Step-back: 70% of previous week
      weekVolume = currentVolume * 0.7;
      longRunKm = Math.min(maxLongRunKm * 0.6, weekVolume * 0.35);
    } else {
      // Build week: increase volume
      buildWeekCount++;
      currentVolume = startingKm + (weeklyIncrease * buildWeekCount);
      weekVolume = Math.min(currentVolume, peakKm);
      peakVolume = Math.max(peakVolume, weekVolume);

      // Long run: 30-40% of weekly volume, capped at max
      const longRunPercent = goalType === 'marathon' ? 0.40 : 0.35;
      longRunKm = Math.min(maxLongRunKm, weekVolume * longRunPercent);
    }

    weeks.push({
      weekNumber: week,
      totalKm: Math.round(weekVolume * 10) / 10,
      longRunKm: Math.round(longRunKm * 10) / 10,
      isStepBack,
      isTaper,
    });
  }

  return weeks;
}

// ============================================================================
// Pace Target Calculation
// ============================================================================

function calculatePaceTargets(
  targetTimeSeconds: number | null | undefined,
  goalType: GoalType,
  currentPaceMinKm: number | null,
  estimatedPaceFromPB: number | null
): PaceTargets | null {
  let goalPace: number | null = null;

  // Calculate goal pace from target time
  if (targetTimeSeconds && goalType !== 'general') {
    const raceDistance = RACE_DISTANCES[goalType];
    goalPace = (targetTimeSeconds / 60) / raceDistance;
  }

  // Use baseline pace or PB estimate as fallback
  const basePace = currentPaceMinKm || estimatedPaceFromPB;

  if (!goalPace && !basePace) {
    return null;
  }

  if (goalPace) {
    // Calculate training paces from goal pace
    return {
      easy: { min: goalPace + 1.0, max: goalPace + 1.5 },
      tempo: { min: goalPace + 0.25, max: goalPace + 0.5 },
      interval: { min: goalPace - 0.5, max: goalPace - 0.25 },
      longRun: { min: goalPace + 0.75, max: goalPace + 1.25 },
    };
  } else if (basePace) {
    // Calculate training paces from current fitness
    return {
      easy: { min: basePace, max: basePace + 0.5 },
      tempo: { min: basePace - 0.5, max: basePace - 0.25 },
      interval: { min: basePace - 1.0, max: basePace - 0.5 },
      longRun: { min: basePace + 0.25, max: basePace + 0.5 },
    };
  }

  return null;
}

// ============================================================================
// Workout Generation
// ============================================================================

function generateWorkoutDescription(
  type: string,
  weekNumber: number,
  distanceKm: number,
  paceTargets: PaceTargets | null,
  isStepBack: boolean,
  isTaper: boolean,
  goalType: GoalType
): string {
  // Get pace strings for this workout type
  const getMainPace = (): string => {
    if (!paceTargets) return '';
    const paces = {
      easy: paceTargets.easy,
      recovery: paceTargets.easy,
      tempo: paceTargets.tempo,
      intervals: paceTargets.interval,
      long: paceTargets.longRun,
    }[type];
    return paces ? formatPaceRange(paces.min, paces.max) : '';
  };

  const getEasyPace = (): string => {
    if (!paceTargets) return '';
    return formatPaceRange(paceTargets.easy.min, paceTargets.easy.max);
  };

  const mainPace = getMainPace();
  const easyPace = getEasyPace();

  let desc = '';

  switch (type) {
    case 'easy':
      desc = 'Run at a comfortable, conversational pace throughout.';
      if (mainPace) {
        desc += ` Target pace: ${mainPace}.`;
      }
      desc += ' You should be able to hold a conversation easily.';
      break;

    case 'recovery':
      desc = 'Very easy active recovery run.';
      if (mainPace) {
        desc += ` Keep it slow: ${mainPace}.`;
      }
      desc += ' Focus on blood flow and loosening up - slower than you think!';
      break;

    case 'tempo': {
      // Calculate warmup/cooldown (1-1.5km each) and main tempo portion
      const warmupKm = Math.min(1.5, distanceKm * 0.15);
      const cooldownKm = Math.min(1.5, distanceKm * 0.15);
      const tempoKm = Math.max(2, distanceKm - warmupKm - cooldownKm);

      desc = `WARMUP: ${warmupKm.toFixed(1)}km easy`;
      if (easyPace) desc += ` @ ${easyPace}`;
      desc += ` | MAIN SET: ${tempoKm.toFixed(1)}km at tempo pace`;
      if (mainPace) desc += ` @ ${mainPace}`;
      desc += ` | COOLDOWN: ${cooldownKm.toFixed(1)}km easy`;
      if (easyPace) desc += ` @ ${easyPace}`;
      desc += '. Tempo pace should feel "comfortably hard" - you can speak in short phrases but not full sentences.';
      break;
    }

    case 'intervals': {
      // Calculate warmup/cooldown and interval structure based on week
      const warmupKm = Math.min(1.5, distanceKm * 0.15);
      const cooldownKm = Math.min(1.5, distanceKm * 0.15);

      desc = `WARMUP: ${warmupKm.toFixed(1)}km easy`;
      if (easyPace) desc += ` @ ${easyPace}`;
      desc += ' | MAIN SET: ';

      if (weekNumber <= 4) {
        desc += '6 x 400m fast with 90sec jog recovery';
      } else if (weekNumber <= 8) {
        desc += '5 x 800m with 2min jog recovery';
      } else {
        desc += '4 x 1000m with 2-3min jog recovery';
      }

      if (mainPace) desc += ` @ ${mainPace}`;
      desc += ` | COOLDOWN: ${cooldownKm.toFixed(1)}km easy`;
      if (easyPace) desc += ` @ ${easyPace}`;
      desc += '. Run the intervals hard but controlled - you should finish each rep feeling like you could do one more.';
      break;
    }

    case 'long':
      desc = 'Build aerobic endurance with steady effort.';
      if (mainPace) {
        desc += ` Target pace: ${mainPace}.`;
      }
      desc += ' Start conservatively - it\'s better to finish strong than start too fast. Stay hydrated and fuel if running over 90 minutes.';
      break;

    default:
      desc = 'Training run.';
      if (mainPace) desc += ` Target pace: ${mainPace}.`;
  }

  // Add context for special weeks
  if (isStepBack) {
    desc += ' RECOVERY WEEK: Keep effort easy and prioritize rest.';
  } else if (isTaper) {
    desc += ' TAPER WEEK: Maintain intensity but reduced volume - stay sharp!';
  }

  return desc;
}

// ============================================================================
// Main Functions
// ============================================================================

export async function previewSmartPlan(input: SmartPlanInput): Promise<PreviewPlan> {
  const { userId, goalType, targetWeeklyKm, daysPerWeek, raceDate, targetTimeSeconds, longRunDay } = input;

  // Get user fitness data
  const fitness = await getUserFitnessData(userId);

  // Default volumes based on goal type (for users with no data)
  const defaultVolumes: Record<GoalType, { start: number; peak: number }> = {
    'marathon': { start: 30, peak: 60 },
    'half_marathon': { start: 25, peak: 45 },
    '10k': { start: 20, peak: 35 },
    '5k': { start: 15, peak: 25 },
    'general': { start: 15, peak: 25 },
  };

  // Determine starting and peak volumes
  let startingKm: number;
  let peakKm: number;

  if (targetWeeklyKm !== 'baseline' && typeof targetWeeklyKm === 'number') {
    // User specified a target volume
    peakKm = targetWeeklyKm;
    // Start at 70% of target or current fitness, whichever is appropriate
    if (fitness.currentWeeklyKm > 0) {
      startingKm = Math.min(targetWeeklyKm * 0.7, fitness.currentWeeklyKm);
    } else {
      startingKm = targetWeeklyKm * 0.6;
    }
  } else {
    // Use baseline - calculate from current fitness or defaults
    if (fitness.currentWeeklyKm > 0) {
      startingKm = fitness.currentWeeklyKm;
      peakKm = fitness.currentWeeklyKm * PEAK_VOLUME_MULTIPLIER[goalType];
    } else {
      // No baseline data - use sensible defaults
      startingKm = defaultVolumes[goalType].start;
      peakKm = defaultVolumes[goalType].peak;
    }
  }

  // Ensure we have valid numbers
  if (isNaN(startingKm) || startingKm <= 0) {
    startingKm = defaultVolumes[goalType].start;
  }
  if (isNaN(peakKm) || peakKm <= 0) {
    peakKm = defaultVolumes[goalType].peak;
  }

  // Ensure peak is at least as high as starting
  peakKm = Math.max(peakKm, startingKm);

  // Determine plan duration
  let buildWeeks: number;
  let taperWeeks = TAPER_WEEKS[goalType];

  if (raceDate) {
    const today = new Date();
    const race = new Date(raceDate);
    const weeksUntilRace = Math.ceil((race.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const totalWeeks = Math.min(weeksUntilRace, DEFAULT_PLAN_WEEKS[goalType]);
    buildWeeks = Math.max(totalWeeks - taperWeeks, 4);
  } else {
    buildWeeks = DEFAULT_PLAN_WEEKS[goalType] - taperWeeks;
    taperWeeks = 0; // No taper without race date
  }

  const totalWeeks = buildWeeks + taperWeeks;

  // Calculate pace targets
  const paceTargets = calculatePaceTargets(
    targetTimeSeconds,
    goalType,
    fitness.currentPaceMinKm,
    fitness.estimatedPaceFromPB
  );

  // Calculate volume progression
  const volumeProgression = calculateVolumeProgression(
    startingKm,
    peakKm,
    buildWeeks,
    taperWeeks,
    MAX_LONG_RUN_KM[goalType],
    goalType
  );

  // Get workout templates
  const longRunDayOffset = longRunDay === 'saturday' ? 5 : 6;
  const templates = getWorkoutTemplates(daysPerWeek, longRunDayOffset);

  // HR zones by workout type
  const hrZoneByType: Record<string, number> = {
    easy: 2,
    recovery: 1,
    tempo: 3,
    intervals: 4,
    long: 2,
  };

  // Generate preview weeks
  const weeks: PreviewWeek[] = volumeProgression.map((weekVol) => {
    const workouts: PreviewWorkout[] = templates.map((template) => {
      let distanceKm: number;

      if (template.type === 'long') {
        distanceKm = weekVol.longRunKm;
      } else {
        // Distribute remaining volume among other workouts
        const remainingKm = weekVol.totalKm - weekVol.longRunKm;
        const otherWorkouts = templates.filter(t => t.type !== 'long');
        const totalOtherPercent = otherWorkouts.reduce((sum, t) => sum + t.distancePercent, 0);
        distanceKm = totalOtherPercent > 0
          ? remainingKm * (template.distancePercent / totalOtherPercent)
          : remainingKm / otherWorkouts.length;
      }

      // Ensure distance is a valid number
      if (isNaN(distanceKm) || distanceKm < 0) {
        distanceKm = 5; // Default to 5km if calculation fails
      }

      const paces = paceTargets ? {
        easy: paceTargets.easy,
        recovery: paceTargets.easy,
        tempo: paceTargets.tempo,
        intervals: paceTargets.interval,
        long: paceTargets.longRun,
      }[template.type] : null;

      return {
        dayOfWeek: DAY_NAMES[(template.dayOffset + 1) % 7], // Convert Monday=0 to Sunday=0
        type: template.type,
        name: template.name,
        distanceKm: Math.round(distanceKm * 10) / 10,
        paceTarget: paces ? formatPaceRange(paces.min, paces.max) : undefined,
        hrZone: hrZoneByType[template.type] || 2,
        description: generateWorkoutDescription(
          template.type,
          weekVol.weekNumber,
          distanceKm,
          paceTargets,
          weekVol.isStepBack,
          weekVol.isTaper,
          goalType
        ),
      };
    });

    return {
      weekNumber: weekVol.weekNumber,
      isStepBack: weekVol.isStepBack,
      isTaper: weekVol.isTaper,
      totalKm: isNaN(weekVol.totalKm) ? 0 : weekVol.totalKm,
      workouts,
    };
  });

  // Find peak week volume
  const peakWeeklyKm = Math.max(...volumeProgression.map(w => w.totalKm));

  return {
    weeks,
    summary: {
      totalWeeks,
      buildWeeks,
      taperWeeks,
      peakWeeklyKm,
      startingWeeklyKm: volumeProgression[0]?.totalKm || startingKm,
      totalWorkouts: totalWeeks * daysPerWeek,
      hasTaper: taperWeeks > 0,
      taperStartsWeek: taperWeeks > 0 ? buildWeeks + 1 : undefined,
      paceTargets,
    },
  };
}

export async function generateSmartPlan(input: SmartPlanInput): Promise<GeneratedPlan> {
  const { userId, goalType, daysPerWeek, raceDate, longRunDay, planName } = input;

  // Generate preview first (this does all the calculations)
  const preview = await previewSmartPlan(input);

  // Calculate plan dates
  const startDate = getNextMonday(new Date());
  const endDate = addDays(startDate, preview.summary.totalWeeks * 7 - 1);

  // Deactivate other plans
  await deactivateOtherPlans(userId);

  // Create the training plan
  const planNameFinal = planName || `${goalType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} Plan`;
  const plan = await createTrainingPlan({
    user_id: userId,
    name: planNameFinal,
    description: `Smart-generated ${preview.summary.totalWeeks}-week plan for ${goalType.replace('_', ' ')}`,
    start_date: startDate,
    end_date: endDate,
    total_weeks: preview.summary.totalWeeks,
    source: 'manual', // TODO: Add 'smart_generator' to source enum
    is_active: true,
    identify_peaks: true,
    peak_weeks_count: 1,
    taper_weeks: preview.summary.taperWeeks,
    taper_start_date: preview.summary.hasTaper
      ? addDays(startDate, preview.summary.buildWeeks * 7)
      : undefined,
    enable_carb_loading: goalType === 'marathon' || goalType === 'half_marathon',
  });

  // Generate all workouts
  const workoutsToCreate: Omit<PlannedWorkout, 'id' | 'created_at' | 'updated_at'>[] = [];
  const longRunDayOffset = longRunDay === 'saturday' ? 5 : 6;
  const templates = getWorkoutTemplates(daysPerWeek, longRunDayOffset);

  for (const week of preview.weeks) {
    const weekStart = addDays(startDate, (week.weekNumber - 1) * 7);

    for (let i = 0; i < week.workouts.length; i++) {
      const previewWorkout = week.workouts[i];
      const template = templates[i];
      const workoutDate = addDays(weekStart, template.dayOffset);

      // Get pace targets for this workout type
      const paces = preview.summary.paceTargets ? {
        easy: preview.summary.paceTargets.easy,
        recovery: preview.summary.paceTargets.easy,
        tempo: preview.summary.paceTargets.tempo,
        intervals: preview.summary.paceTargets.interval,
        long: preview.summary.paceTargets.longRun,
      }[template.type] : null;

      // Determine HR zone by workout type
      const hrZoneByType: Record<string, number> = {
        easy: 2,
        recovery: 1,
        tempo: 3,
        intervals: 4,
        long: 2,
      };

      // Calculate average pace if we have pace targets
      const avgPace = paces ? (paces.min + paces.max) / 2 : undefined;

      workoutsToCreate.push({
        training_plan_id: plan.id,
        user_id: userId,
        scheduled_date: workoutDate.toISOString().split('T')[0],
        workout_type: template.type,
        name: previewWorkout.name,
        description: previewWorkout.description,
        target_distance_meters: Math.round(previewWorkout.distanceKm * 1000),
        target_pace_min: paces?.min,
        target_pace_max: paces?.max,
        target_pace_avg: avgPace,
        target_hr_zone: hrZoneByType[template.type] || 2,
        completion_status: 'pending',
      } as any);
    }
  }

  // Bulk create all workouts
  const workouts = await bulkCreatePlannedWorkouts(workoutsToCreate);

  console.log(`Smart plan generated: "${planNameFinal}" with ${workouts.length} workouts for user ${userId}`);

  return {
    plan,
    workouts,
    summary: preview.summary,
  };
}

export function getGoalTypeOptions(): Array<{ value: GoalType; label: string; description: string }> {
  return [
    { value: '5k', label: '5K', description: 'Train for a 5 kilometer race' },
    { value: '10k', label: '10K', description: 'Train for a 10 kilometer race' },
    { value: 'half_marathon', label: 'Half Marathon', description: 'Train for a 21.1km half marathon' },
    { value: 'marathon', label: 'Marathon', description: 'Train for a full 42.2km marathon' },
    { value: 'general', label: 'General Fitness', description: 'Maintain fitness without a specific race goal' },
  ];
}
