import { getUserById } from '../models/User';
import { getProfileByUserId } from '../models/UserProfile';
import { getActiveGoal } from '../models/Goal';
import { getActivitiesAfterDate, getActivityStats } from '../models/Activity';
import { getActivePlan } from '../models/TrainingPlan';
import { getUpcomingWorkouts, getPlannedWorkoutsByDateRange } from '../models/PlannedWorkout';
import { getHRZoneSummary } from '../models/ActivityHRZone';

export interface UserContextData {
  firstName: string;
  profile: any;
  activeGoal: any;
  recentStats: any;
  recentActivities: any[];
  activePlan?: {
    name: string;
    startDate: Date;
    endDate: Date;
    totalWeeks?: number;
  } | null;
  upcomingWorkouts?: Array<{
    date: Date;
    type: string;
    name?: string;
    description?: string;
    targetDistance?: number;
    targetPace?: string;
    hrZone?: number;
  }>;
  lastWeekAdherence?: {
    planned: number;
    completed: number;
    skipped: number;
  };
  lastFourWeeksAdherence?: {
    plannedDistance: number;
    actualDistance: number;
    adherenceRate: number;
  };
  thisWeekPlan?: {
    workouts: Array<{
      date: Date;
      type: string;
      name?: string;
      distance?: number;
      hrZone?: number;
      description?: string;
    }>;
    totalPlannedDistance: number;
    completedDistance: number;
  };
  nextFourWeeksPlan?: {
    week1Distance: number;
    week2Distance: number;
    week3Distance: number;
    week4Distance: number;
  };
  goalProgress?: {
    weeksRemaining: number;
    avgWeeklyMileageNeeded: number;
    currentAvgWeeklyMileage: number;
    onTrack: boolean;
  };
  hrZoneDistribution?: {
    zone1Hours: number;
    zone2Hours: number;
    zone3Hours: number;
    zone4Hours: number;
    zone5Hours: number;
    totalHours: number;
  } | null;
}

export async function buildUserContext(userId: number): Promise<UserContextData> {
  const user = await getUserById(userId);
  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentActivities = await getActivitiesAfterDate(userId, thirtyDaysAgo);
  const recentStats = await getActivityStats(userId, 30);

  // Get active training plan
  const activePlan = await getActivePlan(userId);

  // Get upcoming workouts (next 28 days for 4 weeks lookahead)
  const upcomingWorkouts = activePlan ? await getUpcomingWorkouts(userId, 28) : [];

  // Get last week's planned vs actual
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const lastWeekPlanned = activePlan
    ? await getPlannedWorkoutsByDateRange(userId, weekAgo, new Date())
    : [];

  // Get last 4 weeks of planned workouts for trend analysis
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const lastFourWeeksPlanned = activePlan
    ? await getPlannedWorkoutsByDateRange(userId, fourWeeksAgo, new Date())
    : [];

  // Get HR zone distribution
  const hrZoneSummary = await getHRZoneSummary(userId, 30);

  // Calculate this week's plan
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Start of week (Sunday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const thisWeekWorkouts = upcomingWorkouts.filter(w => {
    const wDate = new Date(w.scheduled_date);
    return wDate >= startOfWeek && wDate < endOfWeek;
  });

  const thisWeekPlan = thisWeekWorkouts.length > 0 ? {
    workouts: thisWeekWorkouts.map(w => ({
      date: w.scheduled_date,
      type: w.workout_type,
      name: w.name,
      distance: w.target_distance_meters ? w.target_distance_meters / 1000 : undefined,
      hrZone: w.target_hr_zone,
      description: w.description,
    })),
    totalPlannedDistance: thisWeekWorkouts.reduce((sum, w) =>
      sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0
    ),
    completedDistance: thisWeekWorkouts
      .filter(w => w.completion_status === 'completed')
      .reduce((sum, w) => sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0),
  } : undefined;

  // Calculate next 4 weeks planned distances
  const nextFourWeeks = [];
  for (let i = 0; i < 4; i++) {
    const weekStart = new Date(endOfWeek);
    weekStart.setDate(weekStart.getDate() + (i * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const weekWorkouts = upcomingWorkouts.filter(w => {
      const wDate = new Date(w.scheduled_date);
      return wDate >= weekStart && wDate < weekEnd;
    });

    nextFourWeeks.push(
      weekWorkouts.reduce((sum, w) =>
        sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0
      )
    );
  }

  // Calculate last 4 weeks adherence
  const lastFourWeeksPlannedDistance = lastFourWeeksPlanned.reduce((sum, w) =>
    sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0
  );
  const lastFourWeeksActualDistance = parseFloat(recentStats.total_distance) / 1000;
  const lastFourWeeksAdherence = lastFourWeeksPlannedDistance > 0 ? {
    plannedDistance: lastFourWeeksPlannedDistance,
    actualDistance: lastFourWeeksActualDistance,
    adherenceRate: (lastFourWeeksActualDistance / lastFourWeeksPlannedDistance) * 100,
  } : undefined;

  // Calculate goal progress
  let goalProgress = undefined;
  if (activeGoal?.target_date) {
    const weeksRemaining = Math.ceil(
      (new Date(activeGoal.target_date).getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

    // Estimate needed mileage based on goal type
    const goalMileageMap: Record<string, number> = {
      'marathon': 55, // avg weekly km for marathon
      'half_marathon': 40,
      '10k': 30,
      '5k': 25,
    };

    const avgWeeklyMileageNeeded = goalMileageMap[activeGoal.goal_type] || 40;
    const currentAvgWeeklyMileage = (parseFloat(recentStats.total_distance) / 1000) / 4; // last 4 weeks avg

    goalProgress = {
      weeksRemaining,
      avgWeeklyMileageNeeded,
      currentAvgWeeklyMileage,
      onTrack: currentAvgWeeklyMileage >= avgWeeklyMileageNeeded * 0.8, // within 80%
    };
  }

  return {
    firstName: user?.first_name || 'there',
    profile: profile || {},
    activeGoal,
    recentStats: {
      totalRuns: parseInt(recentStats.total_runs) || 0,
      totalDistance: parseFloat(recentStats.total_distance) / 1000 || 0, // Convert to km
      averagePace: recentStats.avg_speed ? (1000 / (parseFloat(recentStats.avg_speed) * 60)) : 0, // min/km
      totalElevation: parseFloat(recentStats.total_elevation) || 0,
      longestRun: parseFloat(recentStats.longest_run) / 1000 || 0, // Convert to km
    },
    recentActivities: recentActivities.slice(0, 5).map(a => ({
      start_date: a.start_date,
      distance_meters: a.distance_meters,
      moving_time_seconds: a.moving_time_seconds,
      average_speed: a.average_speed,
    })),

    // Training plan data
    activePlan: activePlan ? {
      name: activePlan.name,
      startDate: activePlan.start_date,
      endDate: activePlan.end_date,
      totalWeeks: activePlan.total_weeks,
    } : null,

    upcomingWorkouts: upcomingWorkouts.slice(0, 7).map(w => ({
      date: w.scheduled_date,
      type: w.workout_type,
      name: w.name,
      description: w.description,
      targetDistance: w.target_distance_meters ? w.target_distance_meters / 1000 : undefined,
      targetPace: w.target_pace_min && w.target_pace_max
        ? `${formatPace(w.target_pace_min)}-${formatPace(w.target_pace_max)}`
        : undefined,
      hrZone: w.target_hr_zone,
    })),

    thisWeekPlan,

    nextFourWeeksPlan: nextFourWeeks.length === 4 ? {
      week1Distance: nextFourWeeks[0],
      week2Distance: nextFourWeeks[1],
      week3Distance: nextFourWeeks[2],
      week4Distance: nextFourWeeks[3],
    } : undefined,

    lastWeekAdherence: lastWeekPlanned.length > 0 ? {
      planned: lastWeekPlanned.length,
      completed: lastWeekPlanned.filter(w => w.completion_status === 'completed').length,
      skipped: lastWeekPlanned.filter(w => w.completion_status === 'skipped').length,
    } : undefined,

    lastFourWeeksAdherence,
    goalProgress,

    hrZoneDistribution: hrZoneSummary && (
      parseFloat(String(hrZoneSummary.total_zone_1 || 0)) +
      parseFloat(String(hrZoneSummary.total_zone_2 || 0)) +
      parseFloat(String(hrZoneSummary.total_zone_3 || 0)) +
      parseFloat(String(hrZoneSummary.total_zone_4 || 0)) +
      parseFloat(String(hrZoneSummary.total_zone_5 || 0))
    ) > 0 ? {
      zone1Hours: parseFloat(String(hrZoneSummary.total_zone_1 || 0)) / 3600,
      zone2Hours: parseFloat(String(hrZoneSummary.total_zone_2 || 0)) / 3600,
      zone3Hours: parseFloat(String(hrZoneSummary.total_zone_3 || 0)) / 3600,
      zone4Hours: parseFloat(String(hrZoneSummary.total_zone_4 || 0)) / 3600,
      zone5Hours: parseFloat(String(hrZoneSummary.total_zone_5 || 0)) / 3600,
      totalHours: (
        parseFloat(String(hrZoneSummary.total_zone_1 || 0)) +
        parseFloat(String(hrZoneSummary.total_zone_2 || 0)) +
        parseFloat(String(hrZoneSummary.total_zone_3 || 0)) +
        parseFloat(String(hrZoneSummary.total_zone_4 || 0)) +
        parseFloat(String(hrZoneSummary.total_zone_5 || 0))
      ) / 3600,
    } : null,
  };
}

function formatTime(seconds?: number): string {
  if (!seconds) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

function formatPace(pace: number): string {
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function calculateDaysRemaining(targetDate?: Date): number {
  if (!targetDate) return 0;
  const now = new Date();
  const target = new Date(targetDate);
  const diffTime = target.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculateCurrentWeek(startDate: Date): number {
  const now = new Date();
  const diff = now.getTime() - new Date(startDate).getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export function buildSystemPrompt(userData: UserContextData): string {
  const zone1_2_percent = userData.hrZoneDistribution
    ? ((userData.hrZoneDistribution.zone1Hours + userData.hrZoneDistribution.zone2Hours) /
        userData.hrZoneDistribution.totalHours) * 100
    : 0;

  return `You are an expert running coach assistant helping ${userData.firstName}.

# Athlete Profile
${userData.profile.age ? `- Age: ${userData.profile.age}` : ''}
${userData.profile.weight_kg ? `- Weight: ${userData.profile.weight_kg} kg` : ''}
${userData.profile.running_experience_years ? `- Running Experience: ${userData.profile.running_experience_years} years` : ''}
${userData.profile.typical_weekly_mileage ? `- Typical Weekly Mileage: ${userData.profile.typical_weekly_mileage} km` : ''}
${userData.profile.injury_history ? `- Injury History: ${userData.profile.injury_history}` : '- Injury History: None reported'}

# Current Goal
${userData.activeGoal ? `- Goal: ${userData.activeGoal.goal_type}
- Target Time: ${formatTime(userData.activeGoal.target_time_seconds)}
- Target Date: ${formatDate(userData.activeGoal.target_date)}
- Days Remaining: ${calculateDaysRemaining(userData.activeGoal.target_date)}
${userData.activeGoal.race_name ? `- Race: ${userData.activeGoal.race_name}` : ''}` : '- No active goal set'}

${userData.activePlan ? `# Active Training Plan
- Plan: ${userData.activePlan.name}
- Duration: ${userData.activePlan.totalWeeks || 'N/A'} weeks
- Progress: Week ${calculateCurrentWeek(userData.activePlan.startDate)} of ${userData.activePlan.totalWeeks || 'N/A'}
- Start Date: ${formatDate(userData.activePlan.startDate)}
- End Date: ${formatDate(userData.activePlan.endDate)}` : '# Active Training Plan\n- No active training plan'}

${userData.thisWeekPlan ? `# This Week's Plan
- Total Planned Distance: ${userData.thisWeekPlan.totalPlannedDistance.toFixed(1)} km
- Completed So Far: ${userData.thisWeekPlan.completedDistance.toFixed(1)} km
- Remaining: ${(userData.thisWeekPlan.totalPlannedDistance - userData.thisWeekPlan.completedDistance).toFixed(1)} km

Planned Workouts:
${userData.thisWeekPlan.workouts.map(w =>
  `- ${formatDate(w.date)}: ${w.name || w.type} ${w.distance ? `- ${w.distance.toFixed(1)}km` : ''} ${w.hrZone ? `(Zone ${w.hrZone})` : ''} ${w.description ? `\n  Note: ${w.description}` : ''}`
).join('\n')}` : '# This Week\'s Plan\n- No workouts planned for this week'}

${userData.nextFourWeeksPlan ? `# Upcoming Training Load (Next 4 Weeks)
- Week 1: ${userData.nextFourWeeksPlan.week1Distance.toFixed(1)} km
- Week 2: ${userData.nextFourWeeksPlan.week2Distance.toFixed(1)} km
- Week 3: ${userData.nextFourWeeksPlan.week3Distance.toFixed(1)} km
- Week 4: ${userData.nextFourWeeksPlan.week4Distance.toFixed(1)} km` : ''}

${userData.upcomingWorkouts && userData.upcomingWorkouts.length > 0 ? `# Next 7 Days Detailed Schedule
${userData.upcomingWorkouts.map(w =>
  `- ${formatDate(w.date)}: ${w.name || w.type} ${w.targetDistance ? `- ${w.targetDistance.toFixed(1)}km` : ''} ${w.targetPace ? `at ${w.targetPace}` : ''} ${w.hrZone ? `(Zone ${w.hrZone})` : ''}`
).join('\n')}` : ''}

# Recent Training Summary (Last 30 Days)
- Total Runs: ${userData.recentStats.totalRuns}
- Total Distance: ${userData.recentStats.totalDistance.toFixed(2)} km
- Average Pace: ${formatPace(userData.recentStats.averagePace)} min/km
- Total Elevation: ${userData.recentStats.totalElevation.toFixed(0)} m
- Longest Run: ${userData.recentStats.longestRun.toFixed(2)} km

${userData.lastWeekAdherence ? `# Training Plan Adherence (Last 7 Days)
- Planned Workouts: ${userData.lastWeekAdherence.planned}
- Completed: ${userData.lastWeekAdherence.completed}
- Skipped: ${userData.lastWeekAdherence.skipped}
- Adherence Rate: ${userData.lastWeekAdherence.planned > 0 ? Math.round((userData.lastWeekAdherence.completed / userData.lastWeekAdherence.planned) * 100) : 0}%` : ''}

${userData.lastFourWeeksAdherence ? `# Last 4 Weeks Training Summary
- Planned Distance: ${userData.lastFourWeeksAdherence.plannedDistance.toFixed(1)} km
- Actual Distance: ${userData.lastFourWeeksAdherence.actualDistance.toFixed(1)} km
- Adherence: ${userData.lastFourWeeksAdherence.adherenceRate.toFixed(0)}%
${userData.lastFourWeeksAdherence.adherenceRate < 80 ? '⚠️ Below target - consistency is key for marathon training' : '✓ Good adherence to plan'}` : ''}

${userData.goalProgress ? `# Goal Progress Analysis
- Weeks Until Race: ${userData.goalProgress.weeksRemaining}
- Target Weekly Mileage: ${userData.goalProgress.avgWeeklyMileageNeeded.toFixed(1)} km
- Current Weekly Average: ${userData.goalProgress.currentAvgWeeklyMileage.toFixed(1)} km
- Status: ${userData.goalProgress.onTrack ? '✓ ON TRACK - Keep up the great work!' : '⚠️ BELOW TARGET - Need to increase weekly mileage'}
${!userData.goalProgress.onTrack ? `- Gap: ${(userData.goalProgress.avgWeeklyMileageNeeded - userData.goalProgress.currentAvgWeeklyMileage).toFixed(1)} km per week` : ''}` : ''}

${userData.hrZoneDistribution ? `# Heart Rate Zone Distribution (Last 30 Days)
- Zone 1 (Recovery, <120 bpm): ${userData.hrZoneDistribution.zone1Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone1Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Zone 2 (Easy, 120-140 bpm): ${userData.hrZoneDistribution.zone2Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone2Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Zone 3 (Moderate, 140-160 bpm): ${userData.hrZoneDistribution.zone3Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone3Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Zone 4 (Hard, 160-175 bpm): ${userData.hrZoneDistribution.zone4Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone4Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Zone 5 (Max, >175 bpm): ${userData.hrZoneDistribution.zone5Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone5Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Total Training Time: ${userData.hrZoneDistribution.totalHours.toFixed(1)}h

IMPORTANT: For marathon training, ~80% of volume should be in Zones 1-2. Current: ${zone1_2_percent.toFixed(0)}%` : '# Heart Rate Zone Distribution\n- HR zone data not available yet'}

# Recent Runs (Last 5)
${userData.recentActivities.map(activity => `- ${formatDate(activity.start_date)}: ${(activity.distance_meters / 1000).toFixed(2)} km in ${formatTime(activity.moving_time_seconds)}`).join('\n')}

# Your Role as AI Running Coach
You are an expert running coach who provides:

**Training Plan Analysis:**
- Analyze this week's planned workouts in context of the overall goal
- Identify if the training load is appropriate or needs adjustment
- Flag potential issues (too much intensity, insufficient recovery, mileage jumps)
- Consider the next 4 weeks of planned training when giving advice

**Post-Run Feedback & Check-ins:**
- When the athlete completes a run, compare it to what was planned
- Provide specific feedback on pace, HR zones, and execution
- Celebrate wins and identify areas for improvement
- Suggest adjustments to upcoming workouts based on recent performance

**Goal Progress Monitoring:**
- Regularly assess if training is on track for the goal
- Calculate if weekly mileage aligns with goal requirements
- Provide specific recommendations when behind or ahead of target
- Consider time remaining and adjust advice accordingly

**Proactive Coaching:**
- Suggest modifications to planned workouts when needed
- Warn about injury risks (sudden mileage increases, too much intensity)
- Recommend recovery when HR data shows high zone training
- Encourage consistency when adherence drops

# Guidelines
- **Be Specific:** Reference actual workout names, dates, and metrics
- **Compare Plan vs Actual:** "Your Tuesday tempo run was planned for 10km at 4:45/km, but you ran 4:38/km - excellent pacing!"
- **Look Forward:** "Your long run this Sunday is 22km - based on last week's 18km, that's appropriate progression"
- **Context Aware:** Consider goal date, injury history, HR zones, adherence rate
- **Actionable Advice:** Don't just analyze - suggest concrete adjustments
- **Supportive but Honest:** Celebrate successes, but flag concerns directly
- **Use Metric Units:** km, kg, min/km, bpm
- **HR Zone Specific:** Zone 1 (<120), Zone 2 (120-140), Zone 3 (140-160), Zone 4 (160-175), Zone 5 (>175)

# Example Interactions
**Check-in after a run:** "Great job completing yesterday's easy 8km! I see you kept it in Zone 2 (avg 135 bpm) as planned. Your Wednesday tempo run is coming up - 12km with 6km at threshold pace. Ready to discuss pacing strategy?"

**Weekly analysis:** "Looking at your week: You've completed 35km of 45km planned. Your long run Sunday is crucial - 20km in Zone 2. This is a key workout for your marathon goal, don't skip it!"

**Goal progress:** "You're ${userData.goalProgress?.weeksRemaining} weeks from race day. Your current weekly average (${userData.goalProgress?.currentAvgWeeklyMileage.toFixed(1)}km) is ${userData.goalProgress?.onTrack ? 'right on track!' : `below the target ${userData.goalProgress?.avgWeeklyMileageNeeded.toFixed(1)}km needed for sub-3hr marathon. Let's discuss how to safely build up.`}"

# Important
- Refer to THIS WEEK'S PLAN and NEXT 4 WEEKS when giving advice
- Use Goal Progress data to keep athlete motivated and on track
- Flag adherence issues proactively
- Suggest workout modifications when HR data shows overtraining`;
}
