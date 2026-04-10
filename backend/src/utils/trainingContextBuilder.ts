/**
 * Training Context Builder
 *
 * Builds temporal context about training blocks to help the LLM
 * distinguish between pre-plan history and structured training.
 *
 * This prevents incorrect analysis like "low adherence" when the user
 * only recently started following a structured plan.
 */

import { TrainingContext, LongRunProgression, WeeklyStats, WeeklySummary, PlanAdherence } from '../types/models';

/**
 * Format goal time from seconds to "H:MM" or "HH:MM:SS"
 */
function formatGoalTime(seconds: number | null): string {
  if (!seconds) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format goal pace from seconds or calculate from time/distance
 */
function formatGoalPace(activeGoal: any): string {
  if (!activeGoal?.target_time_seconds || !activeGoal?.goal_type) return 'N/A';

  // Get race distance in km
  const distances: Record<string, number> = {
    'marathon': 42.195,
    'half_marathon': 21.0975,
    '10k': 10,
    '5k': 5,
  };
  const distanceKm = distances[activeGoal.goal_type] || 42.195;

  // Calculate pace in min/km
  const totalMinutes = activeGoal.target_time_seconds / 60;
  const paceMinKm = totalMinutes / distanceKm;

  const mins = Math.floor(paceMinKm);
  const secs = Math.round((paceMinKm - mins) * 60);

  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

/**
 * Determine current training phase based on weeks remaining
 */
function determinePhase(
  weeksRemaining: number,
  totalWeeks: number,
  plan: any
): TrainingContext['currentPhase'] {
  // Check if we're before plan start
  if (weeksRemaining > totalWeeks) return 'pre_plan';

  // Taper: final 2-3 weeks
  const taperWeeks = plan?.taper_weeks || 2;
  if (weeksRemaining <= taperWeeks) return 'taper';

  // Peak: 2-3 weeks before taper
  if (weeksRemaining <= taperWeeks + 2) return 'peak';

  // Build: middle portion (40-70% of plan)
  const weeksCompleted = totalWeeks - weeksRemaining;
  const progressPercent = weeksCompleted / totalWeeks;
  if (progressPercent >= 0.4) return 'build';

  // Base: first 40% of plan
  return 'base';
}

/**
 * Get key focus for current training phase
 */
function getPhaseKeyFocus(phase: TrainingContext['currentPhase'], weeksRemaining: number): string {
  const focuses: Record<TrainingContext['currentPhase'], string> = {
    pre_plan: 'Building baseline fitness before structured training begins',
    base: 'Increase weekly mileage gradually (max 10%/week) and extend long run distance',
    build: 'Introduce quality sessions (tempo, intervals) while maintaining aerobic base',
    peak: 'Highest volume week(s), longest runs, race-specific workouts',
    taper: 'Reduce volume while maintaining intensity, prioritize recovery and freshness',
  };
  return focuses[phase] || focuses.base;
}

/**
 * Calculate weeks remaining until phase transition
 */
function getPhaseWeeksRemaining(
  phase: TrainingContext['currentPhase'],
  weeksRemaining: number,
  totalWeeks: number,
  taperWeeks: number = 2
): number {
  switch (phase) {
    case 'taper':
      return weeksRemaining; // Until race
    case 'peak':
      return weeksRemaining - taperWeeks; // Until taper starts
    case 'build':
      return weeksRemaining - taperWeeks - 2; // Until peak starts
    case 'base':
      const baseEndPercent = 0.4;
      const baseWeeks = Math.floor(totalWeeks * baseEndPercent);
      const weeksCompleted = totalWeeks - weeksRemaining;
      return Math.max(0, baseWeeks - weeksCompleted);
    default:
      return weeksRemaining;
  }
}

/**
 * Build Training Context object
 * Provides temporal context about the training block
 */
export function buildTrainingContext(
  activePlan: any,
  activeGoal: any,
  today: Date = new Date()
): TrainingContext | null {
  if (!activePlan || !activeGoal) return null;

  const planStart = new Date(activePlan.start_date);
  const raceDate = new Date(activeGoal.target_date);

  // Calculate weeks
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const totalWeeks = Math.ceil((raceDate.getTime() - planStart.getTime()) / msPerWeek);
  const weeksIntoBlock = Math.max(0, Math.floor((today.getTime() - planStart.getTime()) / msPerWeek));
  const weeksRemaining = Math.max(0, totalWeeks - weeksIntoBlock);

  // Determine training phase
  const taperWeeks = activePlan.taper_weeks || 2;
  const currentPhase = determinePhase(weeksRemaining, totalWeeks, activePlan);

  // Determine key focus for phase
  const keyFocus = getPhaseKeyFocus(currentPhase, weeksRemaining);

  return {
    raceGoal: activeGoal.race_name || 'Race Goal',
    goalTime: formatGoalTime(activeGoal.target_time_seconds),
    goalPace: formatGoalPace(activeGoal),
    raceDate: raceDate.toISOString().split('T')[0],

    trainingBlockStart: planStart.toISOString().split('T')[0],
    trainingBlockEnd: raceDate.toISOString().split('T')[0],
    trainingBlockLengthWeeks: totalWeeks,

    weeksIntoBlock,
    weeksRemaining,
    blockProgressPercent: totalWeeks > 0 ? Math.round((weeksIntoBlock / totalWeeks) * 100) : 0,

    currentPhase,
    phaseWeeksRemaining: getPhaseWeeksRemaining(currentPhase, weeksRemaining, totalWeeks, taperWeeks),

    keyFocus,
  };
}

/**
 * Build weekly breakdown from activities
 */
export function buildWeeklyBreakdown(
  activities: any[],
  weekStartsOn: 'sunday' | 'monday' = 'sunday'
): WeeklyStats[] {
  if (activities.length === 0) return [];

  // Sort activities by date
  const sorted = [...activities].sort((a, b) =>
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  // Find date range
  const firstDate = new Date(sorted[0].start_date);
  const lastDate = new Date(sorted[sorted.length - 1].start_date);

  // Get start of first week
  const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = weekStartsOn === 'monday'
      ? (day === 0 ? -6 : 1 - day)
      : -day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const startOfFirstWeek = getStartOfWeek(firstDate);
  const endOfLastWeek = new Date(getStartOfWeek(lastDate));
  endOfLastWeek.setDate(endOfLastWeek.getDate() + 7);

  // Build weekly stats
  const weeklyStats: WeeklyStats[] = [];
  let weekStart = new Date(startOfFirstWeek);
  let weekNumber = 1;

  while (weekStart < endOfLastWeek) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get activities for this week
    const weekActivities = activities.filter(a => {
      const activityDate = new Date(a.start_date);
      return activityDate >= weekStart && activityDate < weekEnd;
    });

    // Calculate stats
    const distance = weekActivities.reduce((sum, a) =>
      sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
    );
    const duration = weekActivities.reduce((sum, a) =>
      sum + (a.moving_time_seconds || 0), 0
    );
    const runCount = weekActivities.length;

    // Calculate average pace
    const activitiesWithSpeed = weekActivities.filter(a => a.average_speed);
    const avgPace = activitiesWithSpeed.length > 0
      ? activitiesWithSpeed.reduce((sum, a) =>
          sum + (1000 / (parseFloat(String(a.average_speed)) * 60)), 0
        ) / activitiesWithSpeed.length
      : undefined;

    // Calculate average HR
    const activitiesWithHR = weekActivities.filter(a => a.average_heartrate);
    const avgHR = activitiesWithHR.length > 0
      ? Math.round(activitiesWithHR.reduce((sum, a) =>
          sum + parseFloat(String(a.average_heartrate)), 0
        ) / activitiesWithHR.length)
      : undefined;

    // Find longest run
    const longestRun = weekActivities.reduce((max, a) =>
      (a.distance_meters && parseFloat(String(a.distance_meters)) / 1000 > max)
        ? parseFloat(String(a.distance_meters)) / 1000
        : max, 0
    );

    weeklyStats.push({
      weekNumber,
      weekStart: weekStart.toISOString().split('T')[0],
      distance: Math.round(distance * 10) / 10,
      duration,
      runCount,
      averagePace: avgPace ? Math.round(avgPace * 100) / 100 : undefined,
      averageHR: avgHR,
      longestRun: Math.round(longestRun * 10) / 10,
    });

    weekStart = weekEnd;
    weekNumber++;
  }

  return weeklyStats;
}

/**
 * Summarize weekly stats
 */
export function summarizeWeeks(weeklyStats: WeeklyStats[]): WeeklySummary {
  if (weeklyStats.length === 0) {
    return {
      avgWeeklyDistance: 0,
      avgRunsPerWeek: 0,
      longestRun: 0,
    };
  }

  const totalDistance = weeklyStats.reduce((sum, w) => sum + w.distance, 0);
  const totalRuns = weeklyStats.reduce((sum, w) => sum + w.runCount, 0);
  const longestRun = Math.max(...weeklyStats.map(w => w.longestRun));

  // Calculate volume trend (compare first half to second half)
  const halfPoint = Math.floor(weeklyStats.length / 2);
  if (halfPoint > 0) {
    const firstHalfAvg = weeklyStats.slice(0, halfPoint).reduce((s, w) => s + w.distance, 0) / halfPoint;
    const secondHalfAvg = weeklyStats.slice(halfPoint).reduce((s, w) => s + w.distance, 0) / (weeklyStats.length - halfPoint);
    const volumeTrend = firstHalfAvg > 0
      ? Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100)
      : 0;

    return {
      avgWeeklyDistance: Math.round((totalDistance / weeklyStats.length) * 10) / 10,
      avgRunsPerWeek: Math.round((totalRuns / weeklyStats.length) * 10) / 10,
      longestRun: Math.round(longestRun * 10) / 10,
      volumeTrend,
    };
  }

  return {
    avgWeeklyDistance: Math.round((totalDistance / weeklyStats.length) * 10) / 10,
    avgRunsPerWeek: Math.round((totalRuns / weeklyStats.length) * 10) / 10,
    longestRun: Math.round(longestRun * 10) / 10,
  };
}

/**
 * Build long run progression tracking
 */
export function buildLongRunProgression(
  planActivities: any[],
  prePlanActivities: any[],
  activeGoal: any
): LongRunProgression {
  // Get long runs from plan period (activities > 15km)
  const longRuns = planActivities
    .filter(a => (a.distance_meters || 0) / 1000 >= 15)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    .map(a => Math.round((a.distance_meters || 0) / 1000));

  // Get pre-plan longest run
  const prePlanLongest = prePlanActivities.length > 0
    ? Math.max(...prePlanActivities.map(a => (a.distance_meters || 0) / 1000))
    : null;

  // Calculate goal peak based on race distance
  const raceDistanceKm = activeGoal?.goal_type === 'marathon' ? 42.195
    : activeGoal?.goal_type === 'half_marathon' ? 21.1 : 10;
  const goalPeak = Math.round(raceDistanceKm * 0.75); // ~75% of race distance

  // Assess progression rate
  const assessProgression = (): LongRunProgression['progressionRate'] => {
    if (longRuns.length < 2) return 'insufficient_data';

    const weeksUntilRace = activeGoal?.target_date
      ? Math.ceil((new Date(activeGoal.target_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))
      : 12;

    const currentLongest = Math.max(...longRuns, 0);
    const remainingKm = goalPeak - currentLongest;
    const kmPerWeekNeeded = remainingKm / Math.max(weeksUntilRace - 2, 1); // -2 for taper

    if (kmPerWeekNeeded <= 2) return 'appropriate';
    if (kmPerWeekNeeded <= 3) return 'slow';
    return 'aggressive';
  };

  return {
    sincePlanStart: longRuns,
    prePlanLongest: prePlanLongest ? Math.round(prePlanLongest * 10) / 10 : null,
    currentLongest: Math.max(...longRuns, 0),
    upcomingTarget: null, // TODO: get from upcoming planned workouts
    goalPeak,
    progressionRate: assessProgression(),
  };
}

/**
 * Calculate plan adherence only since plan start date
 */
export function calculatePlanAdherenceFromWorkouts(
  plannedWorkouts: any[],
  planStartDate: Date,
  endDate: Date = new Date()
): PlanAdherence | null {
  if (!planStartDate || plannedWorkouts.length === 0) return null;

  // Filter to only past workouts (not future)
  const pastWorkouts = plannedWorkouts.filter(w =>
    new Date(w.scheduled_date) <= endDate &&
    new Date(w.scheduled_date) >= planStartDate
  );

  const completed = pastWorkouts.filter(w => w.completion_status === 'completed');
  const skipped = pastWorkouts.filter(w => w.completion_status === 'skipped');

  const weeksInPlan = Math.ceil(
    (endDate.getTime() - planStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  return {
    sincePlanStart: {
      totalPlanned: pastWorkouts.length,
      completed: completed.length,
      skipped: skipped.length,
      adherenceRate: pastWorkouts.length > 0
        ? Math.round((completed.length / pastWorkouts.length) * 100)
        : 100,
    },
    periodStart: planStartDate.toISOString().split('T')[0],
    periodEnd: endDate.toISOString().split('T')[0],
    weeksInPlan,
  };
}
