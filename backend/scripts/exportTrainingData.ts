/**
 * Export Training Data to CSV
 *
 * Exports comprehensive training data for analysis including:
 * - Activities with metrics
 * - Daily insights (pacing, HR, compliance)
 * - Planned workouts
 * - HR zone distributions
 * - Weekly summaries
 *
 * Usage: npx ts-node scripts/exportTrainingData.ts [userId]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import pool from '../src/config/database';
import * as fs from 'fs';

interface ExportRow {
  [key: string]: string | number | null;
}

async function exportTrainingData(userId: number) {
  console.log(`\n📊 Exporting training data for user ${userId}...\n`);

  const exportDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];

  // 1. Export Activities with Insights (Main Training Log)
  console.log('1️⃣  Exporting activities with insights...');
  const activitiesResult = await pool.query(`
    SELECT
      a.id,
      a.name,
      a.start_date,
      a.sport_type,
      ROUND(a.distance_meters / 1000, 2) as distance_km,
      ROUND(a.distance_meters / 1609.34, 2) as distance_miles,
      a.moving_time_seconds,
      ROUND(a.moving_time_seconds / 60.0, 1) as duration_minutes,
      ROUND((a.moving_time_seconds / 60.0) / (a.distance_meters / 1000), 2) as pace_min_per_km,
      ROUND(a.average_speed, 2) as avg_speed_mps,
      ROUND(a.max_speed, 2) as max_speed_mps,
      ROUND(a.average_heartrate, 0) as avg_hr,
      a.max_heartrate as max_hr,
      ROUND(a.average_cadence, 0) as avg_cadence,
      ROUND(a.total_elevation_gain_meters, 0) as elevation_gain_m,
      a.calories,
      a.suffer_score as relative_effort,
      a.perceived_exertion,
      -- HR Zones
      hz.zone_1_seconds,
      hz.zone_2_seconds,
      hz.zone_3_seconds,
      hz.zone_4_seconds,
      hz.zone_5_seconds,
      ROUND(hz.zone_1_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as zone_1_pct,
      ROUND(hz.zone_2_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as zone_2_pct,
      ROUND(hz.zone_3_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as zone_3_pct,
      ROUND(hz.zone_4_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as zone_4_pct,
      ROUND(hz.zone_5_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as zone_5_pct,
      -- Daily Insights
      dri.pacing_analysis->>'paceDelta' as pace_delta_pct,
      dri.pacing_analysis->>'consistency' as pace_consistency,
      dri.hr_behavior->>'avgZone' as avg_hr_zone,
      dri.hr_behavior->>'driftRate' as hr_drift_bpm_per_km,
      dri.hr_behavior->>'effortMismatch' as effort_mismatch,
      dri.effort_analysis->>'perceivedDifficulty' as perceived_difficulty,
      dri.effort_analysis->>'executionScore' as execution_score,
      dri.compliance_check->>'completedAsPlanned' as completed_as_planned,
      dri.compliance_check->>'distanceDeviation' as distance_deviation_pct,
      dri.compliance_check->>'paceDeviation' as pace_deviation_pct,
      dri.risk_indicators->>'injuryRisk' as injury_risk,
      dri.risk_indicators->>'recoveryNeeded' as recovery_needed,
      -- Planned workout link
      pw.name as planned_workout_name,
      pw.workout_type as planned_workout_type,
      pw.target_distance_meters / 1000 as planned_distance_km,
      pw.coach_notes as workout_notes
    FROM activities a
    LEFT JOIN activity_hr_zones hz ON hz.activity_id = a.id
    LEFT JOIN daily_run_insights dri ON dri.activity_id = a.id
    LEFT JOIN planned_workouts pw ON pw.completed_activity_id = a.id
    WHERE a.user_id = $1
    ORDER BY a.start_date DESC
  `, [userId]);

  const activitiesFile = path.join(exportDir, `activities_${timestamp}.csv`);
  await writeCsv(activitiesFile, activitiesResult.rows);
  console.log(`   ✓ ${activitiesResult.rows.length} activities → ${activitiesFile}`);

  // 2. Export Planned Workouts (Training Plan)
  console.log('2️⃣  Exporting planned workouts...');
  const workoutsResult = await pool.query(`
    SELECT
      pw.id,
      pw.scheduled_date,
      pw.name,
      pw.workout_type,
      pw.description,
      ROUND(pw.target_distance_meters / 1000, 2) as target_distance_km,
      ROUND(pw.target_duration_seconds / 60.0, 1) as target_duration_minutes,
      pw.target_pace_min as target_pace_min_per_km,
      pw.target_pace_max as target_pace_max_per_km,
      pw.target_hr_zone,
      pw.completion_status,
      pw.completed_activity_id,
      pw.coach_notes,
      tp.name as plan_name,
      tp.source as plan_source
    FROM planned_workouts pw
    JOIN training_plans tp ON tp.id = pw.training_plan_id
    WHERE tp.user_id = $1
    ORDER BY pw.scheduled_date DESC
  `, [userId]);

  const workoutsFile = path.join(exportDir, `planned_workouts_${timestamp}.csv`);
  await writeCsv(workoutsFile, workoutsResult.rows);
  console.log(`   ✓ ${workoutsResult.rows.length} planned workouts → ${workoutsFile}`);

  // 3. Export Weekly Summaries
  console.log('3️⃣  Exporting weekly summaries...');
  const weeklySummaryResult = await pool.query(`
    SELECT
      DATE_TRUNC('week', a.start_date)::date as week_start,
      COUNT(*) as total_runs,
      ROUND(SUM(a.distance_meters) / 1000, 2) as total_distance_km,
      ROUND(SUM(a.moving_time_seconds) / 3600.0, 2) as total_hours,
      ROUND(AVG(a.average_heartrate), 0) as avg_hr,
      ROUND(AVG(a.average_speed), 2) as avg_speed,
      ROUND(SUM(a.total_elevation_gain_meters), 0) as total_elevation_m,
      ROUND(SUM(a.calories), 0) as total_calories,
      ROUND(AVG(CASE WHEN dri.effort_analysis->>'executionScore' IS NOT NULL
        THEN (dri.effort_analysis->>'executionScore')::numeric ELSE NULL END), 1) as avg_execution_score,
      ROUND(AVG((dri.pacing_analysis->>'consistency')::numeric), 2) as avg_pace_consistency,
      COUNT(CASE WHEN pw.id IS NOT NULL THEN 1 END) as planned_workouts_completed,
      -- Zone distribution for the week
      ROUND(SUM(hz.zone_1_seconds + hz.zone_2_seconds)::numeric / NULLIF(SUM(a.moving_time_seconds), 0) * 100, 1) as easy_zone_pct,
      ROUND(SUM(hz.zone_4_seconds + hz.zone_5_seconds)::numeric / NULLIF(SUM(a.moving_time_seconds), 0) * 100, 1) as hard_zone_pct
    FROM activities a
    LEFT JOIN daily_run_insights dri ON dri.activity_id = a.id
    LEFT JOIN activity_hr_zones hz ON hz.activity_id = a.id
    LEFT JOIN planned_workouts pw ON pw.completed_activity_id = a.id
    WHERE a.user_id = $1
    GROUP BY DATE_TRUNC('week', a.start_date)
    ORDER BY week_start DESC
  `, [userId]);

  const weeklyFile = path.join(exportDir, `weekly_summary_${timestamp}.csv`);
  await writeCsv(weeklyFile, weeklySummaryResult.rows);
  console.log(`   ✓ ${weeklySummaryResult.rows.length} weeks → ${weeklyFile}`);

  // 4. Export Race History
  console.log('4️⃣  Exporting race history...');
  const raceHistoryResult = await pool.query(`
    SELECT
      race_name,
      race_date,
      race_type,
      ROUND(finish_time_seconds / 60.0, 2) as finish_time_minutes,
      CONCAT(
        FLOOR(finish_time_seconds / 3600), ':',
        LPAD(FLOOR((finish_time_seconds % 3600) / 60)::text, 2, '0'), ':',
        LPAD((finish_time_seconds % 60)::text, 2, '0')
      ) as finish_time_formatted,
      race_location,
      is_personal_best,
      placement,
      age_group_placement,
      weather_conditions,
      elevation_gain_meters,
      race_notes
    FROM race_history
    WHERE user_id = $1
    ORDER BY race_date DESC
  `, [userId]);

  const raceFile = path.join(exportDir, `race_history_${timestamp}.csv`);
  await writeCsv(raceFile, raceHistoryResult.rows);
  console.log(`   ✓ ${raceHistoryResult.rows.length} races → ${raceFile}`);

  // 5. Export Goals
  console.log('5️⃣  Exporting goals...');
  const goalsResult = await pool.query(`
    SELECT
      goal_type,
      race_name,
      race_location,
      target_date,
      CONCAT(
        FLOOR(target_time_seconds / 3600), ':',
        LPAD(FLOOR((target_time_seconds % 3600) / 60)::text, 2, '0'), ':',
        LPAD((target_time_seconds % 60)::text, 2, '0')
      ) as target_time,
      is_active,
      notes,
      created_at
    FROM goals
    WHERE user_id = $1
    ORDER BY target_date DESC
  `, [userId]);

  const goalsFile = path.join(exportDir, `goals_${timestamp}.csv`);
  await writeCsv(goalsFile, goalsResult.rows);
  console.log(`   ✓ ${goalsResult.rows.length} goals → ${goalsFile}`);

  // 6. Export User Profile
  console.log('6️⃣  Exporting user profile...');
  const profileResult = await pool.query(`
    SELECT
      up.age,
      up.gender,
      up.weight_kg,
      up.height_cm,
      up.running_experience_years,
      up.typical_weekly_mileage,
      up.injury_history,
      up.coach_style,
      up.coach_strictness_level,
      up.hr_zone_1_max,
      up.hr_zone_2_max,
      up.hr_zone_3_max,
      up.hr_zone_4_max,
      up.hr_zone_5_max,
      up.personal_bests->>'5k' as pb_5k_seconds,
      up.personal_bests->>'10k' as pb_10k_seconds,
      up.personal_bests->>'half_marathon' as pb_half_marathon_seconds,
      up.personal_bests->>'marathon' as pb_marathon_seconds,
      up.training_block_start,
      up.training_block_end
    FROM user_profiles up
    WHERE up.user_id = $1
  `, [userId]);

  const profileFile = path.join(exportDir, `profile_${timestamp}.csv`);
  await writeCsv(profileFile, profileResult.rows);
  console.log(`   ✓ Profile → ${profileFile}`);

  // 7. Create a combined "analysis ready" dataset
  console.log('7️⃣  Creating combined analysis dataset...');
  const combinedResult = await pool.query(`
    WITH weekly_metrics AS (
      SELECT
        DATE_TRUNC('week', a.start_date)::date as week_start,
        SUM(a.distance_meters) as week_total_distance,
        COUNT(*) as week_run_count
      FROM activities a
      WHERE a.user_id = $1
      GROUP BY DATE_TRUNC('week', a.start_date)
    )
    SELECT
      a.start_date::date as date,
      EXTRACT(DOW FROM a.start_date) as day_of_week,
      EXTRACT(WEEK FROM a.start_date) as week_number,
      a.name as run_name,
      a.sport_type,

      -- Distance & Duration
      ROUND(a.distance_meters / 1000, 2) as distance_km,
      ROUND(a.moving_time_seconds / 60.0, 1) as duration_min,
      ROUND((a.moving_time_seconds / 60.0) / NULLIF(a.distance_meters / 1000, 0), 2) as pace_min_km,

      -- Heart Rate
      ROUND(a.average_heartrate, 0) as avg_hr,
      a.max_heartrate as max_hr,
      ROUND(hz.zone_1_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as z1_pct,
      ROUND(hz.zone_2_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as z2_pct,
      ROUND(hz.zone_3_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as z3_pct,
      ROUND(hz.zone_4_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as z4_pct,
      ROUND(hz.zone_5_seconds::numeric / NULLIF(a.moving_time_seconds, 0) * 100, 1) as z5_pct,

      -- Performance Metrics
      ROUND(a.average_cadence, 0) as cadence,
      ROUND(a.total_elevation_gain_meters, 0) as elevation_m,
      a.suffer_score as strava_relative_effort,

      -- Insights
      (dri.pacing_analysis->>'consistency')::numeric as pace_consistency,
      (dri.pacing_analysis->>'paceDelta')::numeric as pace_delta,
      (dri.hr_behavior->>'avgZone')::numeric as hr_avg_zone,
      (dri.hr_behavior->>'driftRate')::numeric as hr_drift,
      (dri.effort_analysis->>'executionScore')::numeric as execution_score,
      dri.effort_analysis->>'perceivedDifficulty' as difficulty,
      (dri.compliance_check->>'completedAsPlanned')::boolean as on_plan,
      dri.risk_indicators->>'injuryRisk' as injury_risk,

      -- Workout Type
      COALESCE(pw.workout_type, 'unplanned') as workout_type,
      pw.name as planned_name,

      -- Weekly Context
      ROUND(wm.week_total_distance / 1000, 1) as week_volume_km,
      wm.week_run_count,

      -- Training Load (7-day rolling)
      ROUND((
        SELECT SUM(a2.distance_meters) / 1000
        FROM activities a2
        WHERE a2.user_id = a.user_id
          AND a2.start_date BETWEEN a.start_date - INTERVAL '7 days' AND a.start_date
      ), 1) as rolling_7d_volume_km

    FROM activities a
    LEFT JOIN activity_hr_zones hz ON hz.activity_id = a.id
    LEFT JOIN daily_run_insights dri ON dri.activity_id = a.id
    LEFT JOIN planned_workouts pw ON pw.completed_activity_id = a.id
    LEFT JOIN weekly_metrics wm ON DATE_TRUNC('week', a.start_date)::date = wm.week_start
    WHERE a.user_id = $1
    ORDER BY a.start_date DESC
  `, [userId]);

  const combinedFile = path.join(exportDir, `training_analysis_${timestamp}.csv`);
  await writeCsv(combinedFile, combinedResult.rows);
  console.log(`   ✓ ${combinedResult.rows.length} rows → ${combinedFile}`);

  console.log(`\n✅ Export complete! Files saved to: ${exportDir}\n`);
  console.log('Files created:');
  console.log(`  📁 activities_${timestamp}.csv          - Detailed activity log with insights`);
  console.log(`  📁 planned_workouts_${timestamp}.csv    - Training plan workouts`);
  console.log(`  📁 weekly_summary_${timestamp}.csv      - Week-by-week aggregates`);
  console.log(`  📁 race_history_${timestamp}.csv        - Past race results`);
  console.log(`  📁 goals_${timestamp}.csv               - Training goals`);
  console.log(`  📁 profile_${timestamp}.csv             - User profile & settings`);
  console.log(`  📁 training_analysis_${timestamp}.csv   - Combined dataset for analysis`);

  await pool.end();
}

async function writeCsv(filePath: string, rows: ExportRow[]): Promise<void> {
  if (rows.length === 0) {
    fs.writeFileSync(filePath, '');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    )
  ];

  fs.writeFileSync(filePath, csvLines.join('\n'));
}

// Run the export
const userId = parseInt(process.argv[2] || '1');
if (isNaN(userId)) {
  console.error('Usage: npx ts-node scripts/exportTrainingData.ts [userId]');
  process.exit(1);
}

exportTrainingData(userId).catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
