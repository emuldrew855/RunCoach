/**
 * Runner Tendency Service
 *
 * Analyzes behavioral patterns over 4-6 week windows.
 * Detects persistent issues like:
 * - Starting too fast (70% of runs show fade)
 * - Easy runs too hard (75% in wrong zone)
 * - Volume increases too aggressive (60% of weeks exceed 10%)
 * - Workout skipping patterns
 *
 * Updated every 2 weeks for all active users.
 */

import pool from '../config/database';

export interface RunnerTendency {
  userId: number;
  tendencyType: 'pacing' | 'hr_management' | 'volume' | 'compliance';
  pacingBehavior?: any;
  hrManagement?: any;
  volumeBehavior?: any;
  complianceBehavior?: any;
  observationStart: Date;
  observationEnd: Date;
  activitiesAnalyzed: number;
  confidenceScore: number;
}

/**
 * Compute all tendencies for a user
 * Should be called every 2 weeks
 */
export async function computeRunnerTendencies(userId: number): Promise<void> {
  console.log(`🔍 Computing runner tendencies for user ${userId}...`);

  const observationEnd = new Date();
  const observationStart = new Date();
  observationStart.setDate(observationStart.getDate() - 42); // 6 weeks back

  try {
    // Compute each tendency type
    await analyzePacingTendency(userId, observationStart, observationEnd);
    await analyzeHRManagementTendency(userId, observationStart, observationEnd);
    await analyzeVolumeTendency(userId, observationStart, observationEnd);
    await analyzeComplianceTendency(userId, observationStart, observationEnd);

    console.log(`✓ Runner tendencies computed for user ${userId}`);
  } catch (error) {
    console.error(`Error computing tendencies for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Analyze pacing tendencies
 */
async function analyzePacingTendency(
  userId: number,
  observationStart: Date,
  observationEnd: Date
): Promise<void> {
  // Get daily insights for analysis
  const insightsResult = await pool.query(
    `SELECT
       dri.run_date,
       dri.pacing_analysis,
       dri.effort_analysis,
       dri.compliance_check
     FROM daily_run_insights dri
     WHERE dri.user_id = $1
       AND dri.run_date >= $2
       AND dri.run_date <= $3
     ORDER BY dri.run_date DESC`,
    [userId, observationStart, observationEnd]
  );

  const insights = insightsResult.rows;
  const totalRuns = insights.length;

  if (totalRuns < 5) {
    console.log('  ⚠️  Insufficient data for pacing tendency (need ≥5 runs)');
    return;
  }

  // Analyze starts too fast pattern
  const fadeRuns = insights.filter(i => {
    const pacing = i.pacing_analysis;
    return pacing.paceDelta < -5; // Pace fade >5%
  });

  const startsTooFastFrequency = (fadeRuns.length / totalRuns) * 100;
  const avgFadePercent = fadeRuns.length > 0
    ? fadeRuns.reduce((sum: number, i: any) => sum + Math.abs(i.pacing_analysis.paceDelta), 0) / fadeRuns.length
    : 0;

  // Analyze negative split ability
  const negativeSplitRuns = insights.filter(i => {
    const pacing = i.pacing_analysis;
    return pacing.paceDelta > 0; // Faster in second half
  });

  const negativeSplitFrequency = (negativeSplitRuns.length / totalRuns) * 100;
  const avgImprovement = negativeSplitRuns.length > 0
    ? negativeSplitRuns.reduce((sum: number, i: any) => sum + i.pacing_analysis.paceDelta, 0) / negativeSplitRuns.length
    : 0;

  // Analyze target pace accuracy (for runs with plans)
  const runsWithTargets = insights.filter(i => i.compliance_check.paceDeviation !== 0);
  const avgDeviation = runsWithTargets.length > 0
    ? runsWithTargets.reduce((sum: number, i: any) => sum + Math.abs(i.compliance_check.paceDeviation), 0) / runsWithTargets.length
    : 0;

  const tooFastCount = runsWithTargets.filter((i: any) => i.compliance_check.paceDeviation < 0).length;
  const tooSlowCount = runsWithTargets.filter((i: any) => i.compliance_check.paceDeviation > 0).length;

  let direction: 'too_fast' | 'too_slow' | 'accurate' = 'accurate';
  if (avgDeviation > 5) {
    direction = tooFastCount > tooSlowCount ? 'too_fast' : 'too_slow';
  }

  const lastFadeRun = fadeRuns.length > 0 ? fadeRuns[0].run_date : null;

  const pacingBehavior = {
    startsTooFast: {
      frequency: Math.round(startsTooFastFrequency),
      avgFadePercent: Math.round(avgFadePercent * 10) / 10,
      lastOccurrence: lastFadeRun
    },
    negativeSplitAbility: {
      frequency: Math.round(negativeSplitFrequency),
      avgImprovement: Math.round(avgImprovement * 10) / 10
    },
    targetPaceAccuracy: {
      avgDeviation: Math.round(avgDeviation * 10) / 10,
      direction
    }
  };

  // Calculate confidence score (based on sample size)
  const confidence = Math.min(1.0, totalRuns / 20); // Full confidence at 20+ runs

  await storeTendency({
    userId,
    tendencyType: 'pacing',
    pacingBehavior,
    observationStart,
    observationEnd,
    activitiesAnalyzed: totalRuns,
    confidenceScore: confidence
  });

  console.log(`  ✓ Pacing tendency analyzed (${totalRuns} runs, ${startsTooFastFrequency.toFixed(0)}% fade rate)`);
}

/**
 * Analyze HR management tendencies
 */
async function analyzeHRManagementTendency(
  userId: number,
  observationStart: Date,
  observationEnd: Date
): Promise<void> {
  // Get daily insights with HR data
  const insightsResult = await pool.query(
    `SELECT
       dri.run_date,
       dri.hr_behavior,
       dri.effort_analysis
     FROM daily_run_insights dri
     WHERE dri.user_id = $1
       AND dri.run_date >= $2
       AND dri.run_date <= $3
       AND (dri.hr_behavior->>'avgHR')::numeric > 0
     ORDER BY dri.run_date DESC`,
    [userId, observationStart, observationEnd]
  );

  const insights = insightsResult.rows;
  const totalRuns = insights.length;

  if (totalRuns < 5) {
    console.log('  ⚠️  Insufficient HR data for tendency analysis');
    return;
  }

  // Analyze easy run intensity
  const easyRuns = insights.filter(i => i.effort_analysis.perceivedDifficulty === 'easy');

  if (easyRuns.length > 0) {
    const avgZone = easyRuns.reduce((sum: number, i: any) => sum + i.hr_behavior.avgZone, 0) / easyRuns.length;
    const shouldBe = 2.0; // Zone 2
    const tooHardRuns = easyRuns.filter((i: any) => i.hr_behavior.avgZone > 2.5);
    const issueFrequency = (tooHardRuns.length / easyRuns.length) * 100;

    // Analyze effort calibration
    const effortMismatchRuns = insights.filter((i: any) => i.hr_behavior.effortMismatch === true);
    const hrPaceMismatch = (effortMismatchRuns.length / totalRuns) * 100;

    const hrTooHighCount = effortMismatchRuns.filter((i: any) => i.hr_behavior.avgZone > 2.5).length;
    const typicalIssue = hrTooHighCount > effortMismatchRuns.length / 2 ? 'hr_too_high' : 'well_calibrated';

    const hrManagement = {
      easyRunIntensity: {
        avgZone: Math.round(avgZone * 10) / 10,
        shouldBe,
        issueFrequency: Math.round(issueFrequency)
      },
      effortCalibration: {
        hrPaceMismatch: Math.round(hrPaceMismatch),
        typicalIssue
      }
    };

    const confidence = Math.min(1.0, totalRuns / 20);

    await storeTendency({
      userId,
      tendencyType: 'hr_management',
      hrManagement,
      observationStart,
      observationEnd,
      activitiesAnalyzed: totalRuns,
      confidenceScore: confidence
    });

    console.log(`  ✓ HR management tendency analyzed (${issueFrequency.toFixed(0)}% easy runs too hard)`);
  }
}

/**
 * Analyze volume management tendencies
 */
async function analyzeVolumeTendency(
  userId: number,
  observationStart: Date,
  observationEnd: Date
): Promise<void> {
  // Get weekly insights for volume analysis
  const weeklyResult = await pool.query(
    `SELECT
       wi.week_start,
       wi.volume_analysis,
       wi.training_load
     FROM weekly_insights wi
     WHERE wi.user_id = $1
       AND wi.week_start >= $2
       AND wi.week_end <= $3
     ORDER BY wi.week_start DESC`,
    [userId, observationStart, observationEnd]
  );

  const weeks = weeklyResult.rows;

  if (weeks.length < 3) {
    console.log('  ⚠️  Insufficient weekly data for volume tendency');
    return;
  }

  // Analyze weekly increases
  const increases = weeks.map((w: any) => w.volume_analysis.weekOverWeekChange).filter((n: number) => !isNaN(n));
  const avgWeeklyIncrease = increases.reduce((sum: number, n: number) => sum + n, 0) / increases.length;

  const exceedsGuidelineCount = increases.filter((n: number) => n > 10).length;
  const exceedsGuideline = (exceedsGuidelineCount / increases.length) * 100;

  // Detect crash pattern (big increase followed by skip/injury)
  let crashPattern = false;
  for (let i = 0; i < weeks.length - 1; i++) {
    const increase = weeks[i].volume_analysis.weekOverWeekChange;
    const nextWeekVolume = i + 1 < weeks.length ? weeks[i + 1].volume_analysis.totalDistance : 0;

    if (increase > 15 && nextWeekVolume < weeks[i].volume_analysis.totalDistance * 0.7) {
      crashPattern = true;
      break;
    }
  }

  // Analyze recovery adherence
  const avgRecoveryDays = weeks.reduce((sum: number, w: any) => sum + w.training_load.recoveryDaysActual, 0) / weeks.length;
  const takesRestDays = avgRecoveryDays >= 1;

  // Check recovery run quality (simplified)
  const recoveryRunQuality: 'appropriate' | 'too_hard' | 'too_easy' = 'appropriate';

  const volumeBehavior = {
    buildupPattern: {
      avgWeeklyIncrease: Math.round(avgWeeklyIncrease * 10) / 10,
      exceedsGuideline: Math.round(exceedsGuideline),
      crashPattern
    },
    recoveryAdherence: {
      takesRestDays,
      avgRecoveryDaysPerWeek: Math.round(avgRecoveryDays * 10) / 10,
      recoveryRunQuality
    }
  };

  const confidence = Math.min(1.0, weeks.length / 6);

  await storeTendency({
    userId,
    tendencyType: 'volume',
    volumeBehavior,
    observationStart,
    observationEnd,
    activitiesAnalyzed: weeks.length,
    confidenceScore: confidence
  });

  console.log(`  ✓ Volume tendency analyzed (${exceedsGuideline.toFixed(0)}% weeks exceed 10% guideline)`);
}

/**
 * Analyze compliance tendencies
 */
async function analyzeComplianceTendency(
  userId: number,
  observationStart: Date,
  observationEnd: Date
): Promise<void> {
  // Get planned workouts in observation period
  const workoutsResult = await pool.query(
    `SELECT
       pw.id,
       pw.scheduled_date,
       pw.workout_type,
       pw.completion_status,
       pw.target_distance_meters,
       dri.compliance_check
     FROM planned_workouts pw
     LEFT JOIN activities a ON pw.completed_activity_id = a.id
     LEFT JOIN daily_run_insights dri ON a.id = dri.activity_id
     WHERE pw.user_id = $1
       AND pw.scheduled_date >= $2
       AND pw.scheduled_date <= $3`,
    [userId, observationStart, observationEnd]
  );

  const workouts = workoutsResult.rows;
  const totalPlanned = workouts.length;

  if (totalPlanned < 5) {
    console.log('  ⚠️  Insufficient planned workouts for compliance tendency');
    return;
  }

  // Analyze skipping patterns
  const skipped = workouts.filter((w: any) => w.completion_status === 'skipped');
  const skippingFrequency = (skipped.length / totalPlanned) * 100;

  const skippedTypes: { [key: string]: number } = {};
  skipped.forEach((w: any) => {
    skippedTypes[w.workout_type] = (skippedTypes[w.workout_type] || 0) + 1;
  });

  const topSkippedTypes = Object.entries(skippedTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type);

  // Analyze modification patterns
  const completed = workouts.filter((w: any) => w.completion_status === 'completed' && w.compliance_check);
  const modified = completed.filter((w: any) => !w.compliance_check.completedAsPlanned);
  const modificationFrequency = completed.length > 0 ? (modified.length / completed.length) * 100 : 0;

  const modifications: { [key: string]: number } = {};
  modified.forEach((w: any) => {
    w.compliance_check.modifications.forEach((mod: string) => {
      modifications[mod] = (modifications[mod] || 0) + 1;
    });
  });

  const typicalChanges = Object.keys(modifications).slice(0, 3);

  const requestsEasierWorkouts = typicalChanges.some(c =>
    c.includes('Shortened') || c.includes('Slowed')
  );

  const complianceBehavior = {
    workoutSkipping: {
      frequency: Math.round(skippingFrequency),
      skippedTypes: topSkippedTypes,
      skippingPattern: topSkippedTypes.length > 0
        ? `Tends to skip ${topSkippedTypes[0]} workouts`
        : 'No clear pattern'
    },
    planModifications: {
      frequency: Math.round(modificationFrequency),
      typicalChanges,
      requestsEasierWorkouts
    }
  };

  const confidence = Math.min(1.0, totalPlanned / 30);

  await storeTendency({
    userId,
    tendencyType: 'compliance',
    complianceBehavior,
    observationStart,
    observationEnd,
    activitiesAnalyzed: totalPlanned,
    confidenceScore: confidence
  });

  console.log(`  ✓ Compliance tendency analyzed (${skippingFrequency.toFixed(0)}% skip rate)`);
}

/**
 * Store tendency in database
 */
async function storeTendency(tendency: Partial<RunnerTendency>): Promise<void> {
  await pool.query(
    `INSERT INTO runner_tendencies
     (user_id, tendency_type, pacing_behavior, hr_management, volume_behavior,
      compliance_behavior, observation_start, observation_end, activities_analyzed, confidence_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, tendency_type)
     DO UPDATE SET
       pacing_behavior = EXCLUDED.pacing_behavior,
       hr_management = EXCLUDED.hr_management,
       volume_behavior = EXCLUDED.volume_behavior,
       compliance_behavior = EXCLUDED.compliance_behavior,
       observation_start = EXCLUDED.observation_start,
       observation_end = EXCLUDED.observation_end,
       activities_analyzed = EXCLUDED.activities_analyzed,
       confidence_score = EXCLUDED.confidence_score,
       updated_at = CURRENT_TIMESTAMP`,
    [
      tendency.userId,
      tendency.tendencyType,
      JSON.stringify(tendency.pacingBehavior || null),
      JSON.stringify(tendency.hrManagement || null),
      JSON.stringify(tendency.volumeBehavior || null),
      JSON.stringify(tendency.complianceBehavior || null),
      tendency.observationStart,
      tendency.observationEnd,
      tendency.activitiesAnalyzed,
      tendency.confidenceScore
    ]
  );
}

/**
 * Batch compute tendencies for all active users
 * Should run every 2 weeks via cron
 */
export async function batchComputeTendencies(): Promise<void> {
  console.log('🔄 Starting batch tendency computation...');

  try {
    // Get users with activities in last 6 weeks
    const result = await pool.query(
      `SELECT DISTINCT user_id
       FROM activities
       WHERE start_date >= CURRENT_DATE - INTERVAL '42 days'`
    );

    const activeUsers = result.rows.map(row => row.user_id);
    console.log(`Found ${activeUsers.length} active users`);

    for (const userId of activeUsers) {
      try {
        await computeRunnerTendencies(userId);
      } catch (error) {
        console.error(`Failed to compute tendencies for user ${userId}:`, error);
      }
    }

    console.log('✓ Batch tendency computation completed');
  } catch (error) {
    console.error('Error in batch tendency computation:', error);
    throw error;
  }
}
