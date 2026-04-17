/**
 * Split Bucketing Service
 *
 * Processes raw Strava stream data into per-kilometer buckets with
 * correlated heart rate, pace, and elevation data.
 *
 * Uses linear interpolation to match Strava's precision for exact
 * 1km boundaries rather than discrete index slicing.
 */

import { ActivityStreamData } from './stravaService';
import { getUserHRZones } from '../models/ActivityHRZone';

/**
 * Processed split data for a single kilometer
 */
export interface ProcessedSplit {
  km: number;                    // Kilometer number (1-indexed)
  distance_start: number;        // Start distance in meters (exact)
  distance_end: number;          // End distance in meters (exact)
  time_start: number;            // Start time in seconds (interpolated)
  time_end: number;              // End time in seconds (interpolated)
  duration_seconds: number;      // Time for this km (precise)
  pace: string;                  // Formatted pace (e.g., "4:32")
  pace_seconds_per_km: number;   // Raw pace in seconds per km
  avg_hr: number | null;         // Time-weighted average heart rate
  min_hr: number | null;         // Minimum HR in this km
  max_hr: number | null;         // Maximum HR in this km
  elevation_start: number | null;// Elevation at km start (interpolated)
  elevation_end: number | null;  // Elevation at km end (interpolated)
  elevation_gain: number;        // Cumulative elevation gain in meters
  elevation_loss: number;        // Cumulative elevation loss in meters
  avg_cadence: number | null;    // Time-weighted average cadence (steps/min)
  intensity_zone: number | null; // HR zone (1-5) for this km
  avg_grade: number | null;      // Average grade percentage
  gap_seconds_per_km: number | null; // Grade Adjusted Pace
}

/**
 * Complete processed splits result
 */
export interface ProcessedSplitsResult {
  activity_id: number;
  total_distance_meters: number;
  total_time_seconds: number;
  splits: ProcessedSplit[];
  analysis: {
    fastest_km: { km: number; pace: string; pace_seconds: number } | null;
    slowest_km: { km: number; pace: string; pace_seconds: number } | null;
    avg_pace: string;
    avg_pace_seconds: number;
    positive_split: boolean;
    negative_split: boolean;
    pace_consistency: number;
    hr_drift_percent: number | null;      // Raw HR drift
    hr_drift_context: 'expected' | 'normal' | 'concerning' | null; // Context for HR drift
    pace_change_percent: number | null;   // Pace change first half to second half
    aerobic_decoupling: number | null;    // GAP-adjusted (Pw:Hr ratio change)
    fade_point_km: number | null;
  };
}

/**
 * Format seconds to pace string (mm:ss)
 */
function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Determine intensity zone from heart rate
 */
function getIntensityZone(hr: number, zones: {
  zone_1_max: number;
  zone_2_max: number;
  zone_3_max: number;
  zone_4_max: number;
  zone_5_max: number;
}): number {
  if (hr < zones.zone_1_max) return 1;
  if (hr < zones.zone_2_max) return 2;
  if (hr < zones.zone_3_max) return 3;
  if (hr < zones.zone_4_max) return 4;
  return 5;
}

/**
 * Find the index where distance first exceeds or equals target
 * Returns the index of the first point >= targetDistance
 */
function findDistanceIndex(distances: number[], targetDistance: number): number {
  let low = 0;
  let high = distances.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (distances[mid] < targetDistance) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Interpolate a value at an exact distance using linear interpolation
 * This is the key fix - gets precise values at exact km boundaries
 */
function interpolateAtDistance(
  targetDist: number,
  distances: number[],
  values: number[]
): number {
  if (distances.length === 0 || values.length === 0) return 0;
  if (targetDist <= distances[0]) return values[0];
  if (targetDist >= distances[distances.length - 1]) return values[values.length - 1];

  const idx = findDistanceIndex(distances, targetDist);
  if (idx === 0) return values[0];

  const d1 = distances[idx - 1];
  const d2 = distances[idx];
  const v1 = values[idx - 1];
  const v2 = values[idx];

  // Linear interpolation: find exact value at targetDist
  const fraction = (targetDist - d1) / (d2 - d1);
  return v1 + fraction * (v2 - v1);
}

/**
 * Calculate time-weighted average for a metric within a distance range
 * This properly weights HR samples by duration, not count
 */
function calculateTimeWeightedAverage(
  startDist: number,
  endDist: number,
  distances: number[],
  times: number[],
  values: number[]
): { avg: number; min: number; max: number } | null {
  if (!values || values.length === 0) return null;

  const startIdx = findDistanceIndex(distances, startDist);
  const endIdx = findDistanceIndex(distances, endDist);

  if (startIdx >= endIdx) return null;

  let weightedSum = 0;
  let totalTime = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;
  let validSamples = 0;

  for (let i = startIdx; i < endIdx; i++) {
    const value = values[i];
    if (value <= 0) continue; // Skip invalid readings (HR dropouts, etc.)

    const dt = times[i + 1] - times[i];
    if (dt <= 0) continue;

    weightedSum += value * dt;
    totalTime += dt;
    minVal = Math.min(minVal, value);
    maxVal = Math.max(maxVal, value);
    validSamples++;
  }

  if (totalTime === 0 || validSamples === 0) return null;

  return {
    avg: Math.round(weightedSum / totalTime),
    min: minVal === Infinity ? 0 : Math.round(minVal),
    max: maxVal === -Infinity ? 0 : Math.round(maxVal),
  };
}

/**
 * Calculate Grade Adjusted Pace (GAP)
 * Adjusts pace based on grade to normalize effort across hills
 *
 * Uses 2.2% adjustment per 1% grade to match Strava's GAP closely.
 * Note: GAP is non-linear in reality (steep downhills slow you down),
 * but this linear approximation works well for typical running grades (-5% to +10%).
 */
function calculateGAP(paceSecondsPerKm: number, gradePercent: number): number {
  // Tuned to match Strava: 2.2% pace change per 1% grade
  // Positive grade = slower actual pace should result in faster GAP
  // Negative grade = faster actual pace should result in slower GAP
  const gradeFactor = 1 + (gradePercent * 0.022);
  return paceSecondsPerKm / gradeFactor;
}

/**
 * Calculate elevation changes within a distance range
 * Uses 1.2m threshold to filter GPS noise and runner vertical oscillation
 */
function calculateElevationChanges(
  startDist: number,
  endDist: number,
  distances: number[],
  altitudes: number[]
): { gain: number; loss: number; startElev: number; endElev: number } {
  const startIdx = findDistanceIndex(distances, startDist);
  const endIdx = findDistanceIndex(distances, endDist);

  let gain = 0;
  let loss = 0;

  // Get interpolated start/end elevations for precision
  const startElev = interpolateAtDistance(startDist, distances, altitudes);
  const endElev = interpolateAtDistance(endDist, distances, altitudes);

  // Calculate cumulative gain/loss through the segment
  // Using 1.2m threshold to filter GPS jitter and runner vertical oscillation
  // This prevents "phantom climbing" that makes GAP artificially fast
  const ELEVATION_THRESHOLD = 1.2;

  for (let i = startIdx; i < endIdx && i < altitudes.length - 1; i++) {
    const diff = altitudes[i + 1] - altitudes[i];
    if (diff > ELEVATION_THRESHOLD) {
      gain += diff;
    } else if (diff < -ELEVATION_THRESHOLD) {
      loss += Math.abs(diff);
    }
  }

  return {
    gain: Math.round(gain),
    loss: Math.round(loss),
    startElev: Math.round(startElev),
    endElev: Math.round(endElev),
  };
}

/**
 * Calculate moving time within a distance range
 * Uses velocity_smooth to detect pauses (< 0.5 m/s = paused)
 *
 * Approach: Subtraction method
 * 1. Calculate total elapsed time via interpolation (the ceiling)
 * 2. Sum only the paused time from discrete points
 * 3. Moving time = elapsed - paused (clamped)
 *
 * This avoids double-counting at fractional boundaries.
 */
function calculateMovingTime(
  startDist: number,
  endDist: number,
  distances: number[],
  times: number[],
  velocities: number[] | undefined
): { movingTime: number; pausedTime: number } {
  // 1. Get exact interpolated elapsed time (the absolute ceiling)
  const timeStart = interpolateAtDistance(startDist, distances, times);
  const timeEnd = interpolateAtDistance(endDist, distances, times);
  const totalElapsed = timeEnd - timeStart;

  if (!velocities || velocities.length === 0) {
    return { movingTime: totalElapsed, pausedTime: 0 };
  }

  const startIdx = findDistanceIndex(distances, startDist);
  const endIdx = findDistanceIndex(distances, endDist);

  let pausedSeconds = 0;
  const PAUSE_VELOCITY_THRESHOLD = 0.5; // m/s - below this is considered paused

  // 2. Only sum the pauses within the discrete points
  for (let i = startIdx; i < endIdx && i < times.length - 1; i++) {
    const dt = times[i + 1] - times[i];
    if (velocities[i] < PAUSE_VELOCITY_THRESHOLD) {
      pausedSeconds += dt;
    }
  }

  // 3. Moving time is simply the remainder (clamped to 0 and totalElapsed)
  const movingTime = Math.max(0, Math.min(totalElapsed, totalElapsed - pausedSeconds));

  return {
    movingTime,
    pausedTime: totalElapsed - movingTime,
  };
}

/**
 * Process raw stream data into 1km buckets with interpolation
 */
export async function processStreamsIntoSplits(
  userId: number,
  activityId: number,
  streams: ActivityStreamData
): Promise<ProcessedSplitsResult | null> {
  // Validate required streams
  if (!streams.distance?.data || !streams.time?.data) {
    console.log(`⚠️ Missing required streams (distance/time) for activity ${activityId}`);
    return null;
  }

  const distances = streams.distance.data;
  const times = streams.time.data;
  const heartrates = streams.heartrate?.data;
  const altitudes = streams.altitude?.data;
  const cadences = streams.cadence?.data;
  const grades = streams.grade_smooth?.data;
  const velocities = streams.velocity_smooth?.data;

  // Log raw stream data summary
  console.log('\n' + '='.repeat(80));
  console.log(`🏃 SPLIT PROCESSING FOR ACTIVITY ${activityId}`);
  console.log('='.repeat(80));
  console.log(`📊 RAW STREAM DATA:`);
  console.log(`   - Distance points: ${distances.length}`);
  console.log(`   - Time points: ${times.length}`);
  console.log(`   - HR points: ${heartrates?.length || 'N/A'}`);
  console.log(`   - Altitude points: ${altitudes?.length || 'N/A'}`);
  console.log(`   - Cadence points: ${cadences?.length || 'N/A'}`);
  console.log(`   - Grade points: ${grades?.length || 'N/A'}`);
  console.log(`   - Total distance: ${distances[distances.length - 1]?.toFixed(2)}m`);
  console.log(`   - Total time: ${times[times.length - 1]}s`);

  // Log first few and last few data points
  console.log(`\n📍 SAMPLE DATA POINTS (first 5):`);
  for (let i = 0; i < Math.min(5, distances.length); i++) {
    console.log(`   [${i}] dist=${distances[i]?.toFixed(1)}m, time=${times[i]}s, hr=${heartrates?.[i] || '-'}, alt=${altitudes?.[i]?.toFixed(1) || '-'}`);
  }
  console.log(`   ...`);
  console.log(`📍 SAMPLE DATA POINTS (last 5):`);
  for (let i = Math.max(0, distances.length - 5); i < distances.length; i++) {
    console.log(`   [${i}] dist=${distances[i]?.toFixed(1)}m, time=${times[i]}s, hr=${heartrates?.[i] || '-'}, alt=${altitudes?.[i]?.toFixed(1) || '-'}`);
  }

  if (distances.length === 0 || distances.length !== times.length) {
    console.log(`❌ Invalid stream data: distances=${distances.length}, times=${times.length}`);
    return null;
  }

  // Get user's HR zones for intensity classification
  let hrZones = {
    zone_1_max: 120,
    zone_2_max: 140,
    zone_3_max: 160,
    zone_4_max: 175,
    zone_5_max: 220,
  };

  try {
    const userZones = await getUserHRZones(userId);
    if (userZones) {
      hrZones = userZones;
    }
  } catch (e) {
    // Use defaults if can't fetch user zones
  }

  const totalDistance = distances[distances.length - 1];
  const totalTime = times[times.length - 1];
  const totalKms = Math.floor(totalDistance / 1000);

  const splits: ProcessedSplit[] = [];

  console.log(`\n📏 PROCESSING ${totalKms} COMPLETE KMs + partial:`);

  // Process each complete kilometer with interpolation
  for (let km = 1; km <= totalKms; km++) {
    const kmStart = (km - 1) * 1000;
    const kmEnd = km * 1000;

    // Find the indices around the km boundaries for debugging
    const startIdx = findDistanceIndex(distances, kmStart);
    const endIdx = findDistanceIndex(distances, kmEnd);

    // Get interpolated times at exact km boundaries
    const timeStart = interpolateAtDistance(kmStart, distances, times);
    const timeEnd = interpolateAtDistance(kmEnd, distances, times);
    const elapsedTime = timeEnd - timeStart;

    // Calculate moving time (excludes pauses detected via velocity)
    const { movingTime, pausedTime } = calculateMovingTime(kmStart, kmEnd, distances, times, velocities);

    // Use moving time for pace calculation (matches Strava's approach)
    const duration = movingTime > 0 ? movingTime : elapsedTime;

    // Log interpolation details
    console.log(`\n   KM ${km}:`);
    console.log(`      Target: ${kmStart}m → ${kmEnd}m (exactly 1000m)`);
    console.log(`      Indices: [${startIdx}] ${distances[startIdx]?.toFixed(1)}m → [${endIdx}] ${distances[endIdx]?.toFixed(1)}m`);
    console.log(`      Raw times at indices: ${times[startIdx]}s → ${times[endIdx]}s`);
    console.log(`      Interpolated times: ${timeStart.toFixed(2)}s → ${timeEnd.toFixed(2)}s`);
    console.log(`      Elapsed: ${elapsedTime.toFixed(2)}s, Moving: ${movingTime.toFixed(2)}s, Paused: ${pausedTime.toFixed(2)}s`);
    console.log(`      Duration used: ${duration.toFixed(2)}s (pace: ${formatPace(duration)})`);

    if (duration <= 0) {
      console.log(`      ⚠️ SKIPPED - invalid duration`);
      continue;
    }

    // Pace is based on moving time for exactly 1000m
    const paceSecondsPerKm = duration;

    // Time-weighted HR calculations
    let avgHr: number | null = null;
    let minHr: number | null = null;
    let maxHr: number | null = null;
    let intensityZone: number | null = null;

    if (heartrates && heartrates.length === distances.length) {
      const hrStats = calculateTimeWeightedAverage(kmStart, kmEnd, distances, times, heartrates);
      if (hrStats) {
        avgHr = hrStats.avg;
        minHr = hrStats.min;
        maxHr = hrStats.max;
        intensityZone = getIntensityZone(avgHr, hrZones);
        console.log(`      HR: avg=${avgHr}bpm (${minHr}-${maxHr}), zone=${intensityZone}`);
      }
    }

    // Elevation calculations with interpolation
    let elevationStart: number | null = null;
    let elevationEnd: number | null = null;
    let elevationGain = 0;
    let elevationLoss = 0;

    if (altitudes && altitudes.length === distances.length) {
      const elevStats = calculateElevationChanges(kmStart, kmEnd, distances, altitudes);
      elevationStart = elevStats.startElev;
      elevationEnd = elevStats.endElev;
      elevationGain = elevStats.gain;
      elevationLoss = elevStats.loss;
    }

    // Time-weighted cadence
    let avgCadence: number | null = null;
    if (cadences && cadences.length === distances.length) {
      const cadenceStats = calculateTimeWeightedAverage(kmStart, kmEnd, distances, times, cadences);
      if (cadenceStats) {
        avgCadence = cadenceStats.avg;
      }
    }

    // Average grade for this km
    let avgGrade: number | null = null;
    if (grades && grades.length === distances.length) {
      const gradeStats = calculateTimeWeightedAverage(kmStart, kmEnd, distances, times, grades);
      if (gradeStats) {
        avgGrade = Math.round(gradeStats.avg * 10) / 10;
      }
    }

    // Calculate Grade Adjusted Pace
    let gapSecondsPerKm: number | null = null;
    if (avgGrade !== null) {
      gapSecondsPerKm = Math.round(calculateGAP(paceSecondsPerKm, avgGrade));
      console.log(`      Grade: ${avgGrade}%, GAP: ${formatPace(gapSecondsPerKm)}`);
    }

    splits.push({
      km,
      distance_start: kmStart,
      distance_end: kmEnd,
      time_start: Math.round(timeStart * 100) / 100,
      time_end: Math.round(timeEnd * 100) / 100,
      duration_seconds: Math.round(duration * 100) / 100,
      pace: formatPace(paceSecondsPerKm),
      pace_seconds_per_km: Math.round(paceSecondsPerKm * 100) / 100,
      avg_hr: avgHr,
      min_hr: minHr,
      max_hr: maxHr,
      elevation_start: elevationStart,
      elevation_end: elevationEnd,
      elevation_gain: elevationGain,
      elevation_loss: elevationLoss,
      avg_cadence: avgCadence,
      intensity_zone: intensityZone,
      avg_grade: avgGrade,
      gap_seconds_per_km: gapSecondsPerKm,
    });
  }

  // Handle partial final kilometer (if >= 200m remaining)
  const remainingDistance = totalDistance - (totalKms * 1000);
  if (remainingDistance >= 200) {
    const kmStart = totalKms * 1000;
    const kmEnd = totalDistance;

    const timeStart = interpolateAtDistance(kmStart, distances, times);
    const timeEnd = times[times.length - 1];
    const duration = timeEnd - timeStart;

    if (duration > 0) {
      // Normalize pace to per-km equivalent
      const paceSecondsPerKm = (duration / remainingDistance) * 1000;

      let avgHr: number | null = null;
      let intensityZone: number | null = null;

      if (heartrates && heartrates.length === distances.length) {
        const hrStats = calculateTimeWeightedAverage(kmStart, kmEnd, distances, times, heartrates);
        if (hrStats) {
          avgHr = hrStats.avg;
          intensityZone = getIntensityZone(avgHr, hrZones);
        }
      }

      let avgGrade: number | null = null;
      let gapSecondsPerKm: number | null = null;
      if (grades && grades.length === distances.length) {
        const gradeStats = calculateTimeWeightedAverage(kmStart, kmEnd, distances, times, grades);
        if (gradeStats) {
          avgGrade = Math.round(gradeStats.avg * 10) / 10;
          gapSecondsPerKm = Math.round(calculateGAP(paceSecondsPerKm, avgGrade));
        }
      }

      splits.push({
        km: totalKms + 1,
        distance_start: kmStart,
        distance_end: Math.round(kmEnd),
        time_start: Math.round(timeStart * 100) / 100,
        time_end: Math.round(timeEnd * 100) / 100,
        duration_seconds: Math.round(duration * 100) / 100,
        pace: formatPace(paceSecondsPerKm),
        pace_seconds_per_km: Math.round(paceSecondsPerKm * 100) / 100,
        avg_hr: avgHr,
        min_hr: null,
        max_hr: null,
        elevation_start: altitudes ? Math.round(interpolateAtDistance(kmStart, distances, altitudes)) : null,
        elevation_end: altitudes ? Math.round(altitudes[altitudes.length - 1]) : null,
        elevation_gain: 0,
        elevation_loss: 0,
        avg_cadence: null,
        intensity_zone: intensityZone,
        avg_grade: avgGrade,
        gap_seconds_per_km: gapSecondsPerKm,
      });
    }
  }

  // Calculate analysis metrics
  const analysis = calculateSplitAnalysis(splits);

  // Log final summary
  console.log(`\n📊 ANALYSIS SUMMARY:`);
  console.log(`   - Splits processed: ${splits.length}`);
  console.log(`   - Fastest: KM ${analysis.fastest_km?.km} @ ${analysis.fastest_km?.pace}`);
  console.log(`   - Slowest: KM ${analysis.slowest_km?.km} @ ${analysis.slowest_km?.pace}`);
  console.log(`   - Avg pace: ${analysis.avg_pace}`);
  console.log(`   - Consistency: ${(analysis.pace_consistency * 100).toFixed(1)}%`);
  console.log(`   - Pace change (1st→2nd half): ${analysis.pace_change_percent}%`);
  console.log(`   - HR Drift: ${analysis.hr_drift_percent}% (${analysis.hr_drift_context || 'N/A'})`);
  console.log(`   - Aerobic Decoupling: ${analysis.aerobic_decoupling}%`);
  console.log(`   - Positive split: ${analysis.positive_split}, Negative split: ${analysis.negative_split}`);
  console.log('='.repeat(80) + '\n');

  return {
    activity_id: activityId,
    total_distance_meters: Math.round(totalDistance),
    total_time_seconds: Math.round(totalTime),
    splits,
    analysis,
  };
}

/**
 * Calculate aggregate analysis from processed splits
 * Only uses complete KMs for metrics to avoid skewing from partial splits
 */
function calculateSplitAnalysis(splits: ProcessedSplit[]): ProcessedSplitsResult['analysis'] {
  const emptyAnalysis = {
    fastest_km: null,
    slowest_km: null,
    avg_pace: '0:00',
    avg_pace_seconds: 0,
    positive_split: false,
    negative_split: false,
    pace_consistency: 0,
    hr_drift_percent: null,
    hr_drift_context: null as 'expected' | 'normal' | 'concerning' | null,
    pace_change_percent: null,
    aerobic_decoupling: null,
    fade_point_km: null,
  };

  if (splits.length === 0) return emptyAnalysis;

  // Only consider complete kms for analysis (exclude partial final km)
  const completeKms = splits.filter(s => (s.distance_end - s.distance_start) >= 950);

  if (completeKms.length === 0) return emptyAnalysis;

  // Find fastest and slowest km
  const sortedByPace = [...completeKms].sort((a, b) => a.pace_seconds_per_km - b.pace_seconds_per_km);
  const fastest = sortedByPace[0];
  const slowest = sortedByPace[sortedByPace.length - 1];

  // Calculate average pace (distance-weighted for precision)
  const totalDist = completeKms.reduce((sum, s) => sum + (s.distance_end - s.distance_start), 0);
  const totalTime = completeKms.reduce((sum, s) => sum + s.duration_seconds, 0);
  const avgPaceSeconds = (totalTime / totalDist) * 1000;

  // Calculate first half vs second half pace (positive/negative split)
  const halfPoint = Math.floor(completeKms.length / 2);
  if (halfPoint === 0) {
    return {
      ...emptyAnalysis,
      fastest_km: { km: fastest.km, pace: fastest.pace, pace_seconds: fastest.pace_seconds_per_km },
      slowest_km: { km: slowest.km, pace: slowest.pace, pace_seconds: slowest.pace_seconds_per_km },
      avg_pace: formatPace(avgPaceSeconds),
      avg_pace_seconds: Math.round(avgPaceSeconds),
    };
  }

  const firstHalf = completeKms.slice(0, halfPoint);
  const secondHalf = completeKms.slice(halfPoint);

  const firstHalfTime = firstHalf.reduce((sum, s) => sum + s.duration_seconds, 0);
  const firstHalfDist = firstHalf.reduce((sum, s) => sum + (s.distance_end - s.distance_start), 0);
  const firstHalfPace = (firstHalfTime / firstHalfDist) * 1000;

  const secondHalfTime = secondHalf.reduce((sum, s) => sum + s.duration_seconds, 0);
  const secondHalfDist = secondHalf.reduce((sum, s) => sum + (s.distance_end - s.distance_start), 0);
  const secondHalfPace = (secondHalfTime / secondHalfDist) * 1000;

  const positiveSplit = secondHalfPace > firstHalfPace * 1.02; // 2% threshold
  const negativeSplit = secondHalfPace < firstHalfPace * 0.98;

  // Calculate pace consistency (coefficient of variation)
  const paceStdDev = Math.sqrt(
    completeKms.reduce((sum, s) => sum + Math.pow(s.pace_seconds_per_km - avgPaceSeconds, 2), 0) / completeKms.length
  );
  const paceConsistency = Math.max(0, Math.min(1, 1 - (paceStdDev / avgPaceSeconds)));

  // Calculate HR drift (raw - comparing average HR first half vs second half)
  // Also calculate pace change to determine if HR drift is "expected" or "concerning"
  let hrDriftPercent: number | null = null;
  let paceChangePercent: number | null = null;
  let hrDriftContext: 'expected' | 'normal' | 'concerning' = 'normal';

  const kmsWithHr = completeKms.filter(s => s.avg_hr !== null && s.avg_hr > 0);

  if (kmsWithHr.length >= 4) {
    const hrHalfPoint = Math.floor(kmsWithHr.length / 2);
    const firstHalfHrKms = kmsWithHr.slice(0, hrHalfPoint);
    const secondHalfHrKms = kmsWithHr.slice(hrHalfPoint);

    // Time-weighted HR for each half
    const firstHalfHrTime = firstHalfHrKms.reduce((sum, s) => sum + s.duration_seconds, 0);
    const firstHalfHrSum = firstHalfHrKms.reduce((sum, s) => sum + (s.avg_hr || 0) * s.duration_seconds, 0);
    const firstHalfHr = firstHalfHrSum / firstHalfHrTime;

    const secondHalfHrTime = secondHalfHrKms.reduce((sum, s) => sum + s.duration_seconds, 0);
    const secondHalfHrSum = secondHalfHrKms.reduce((sum, s) => sum + (s.avg_hr || 0) * s.duration_seconds, 0);
    const secondHalfHr = secondHalfHrSum / secondHalfHrTime;

    hrDriftPercent = Math.round(((secondHalfHr - firstHalfHr) / firstHalfHr) * 100 * 10) / 10;

    // Calculate pace change between halves
    // Negative = got faster, Positive = got slower
    paceChangePercent = Math.round(((secondHalfPace - firstHalfPace) / firstHalfPace) * 100 * 10) / 10;

    // Determine HR drift context:
    // - If pace got significantly faster (negative split > 3%), HR increase is EXPECTED
    // - If pace stayed same but HR increased > 5%, that's CONCERNING (true cardiac drift)
    // - Otherwise it's NORMAL
    if (paceChangePercent < -3 && hrDriftPercent > 0) {
      // Negative split run - HR increase is natural response to faster pace
      hrDriftContext = 'expected';
    } else if (Math.abs(paceChangePercent) <= 3 && hrDriftPercent > 5) {
      // Pace stayed constant but HR crept up - true cardiac drift/fatigue
      hrDriftContext = 'concerning';
    }
  }

  // Calculate Aerobic Decoupling (Pw:Hr - GAP-adjusted)
  // This is the proper way to measure cardiac drift, accounting for terrain
  let aerobicDecoupling: number | null = null;
  const kmsWithGap = completeKms.filter(s => s.gap_seconds_per_km !== null && s.avg_hr !== null && s.avg_hr > 0);

  if (kmsWithGap.length >= 4) {
    const gapHalfPoint = Math.floor(kmsWithGap.length / 2);
    const firstHalfGapKms = kmsWithGap.slice(0, gapHalfPoint);
    const secondHalfGapKms = kmsWithGap.slice(gapHalfPoint);

    // Calculate Pace:HR ratio for each half (using GAP)
    // Lower ratio = more effort per unit pace
    const firstHalfGapTime = firstHalfGapKms.reduce((sum, s) => sum + s.duration_seconds, 0);
    const firstHalfGapSum = firstHalfGapKms.reduce((sum, s) => sum + (s.gap_seconds_per_km || 0) * s.duration_seconds, 0);
    const firstHalfGap = firstHalfGapSum / firstHalfGapTime;
    const firstHalfHrSum = firstHalfGapKms.reduce((sum, s) => sum + (s.avg_hr || 0) * s.duration_seconds, 0);
    const firstHalfHr = firstHalfHrSum / firstHalfGapTime;
    const firstHalfPwHr = firstHalfGap / firstHalfHr; // Pace:HR ratio

    const secondHalfGapTime = secondHalfGapKms.reduce((sum, s) => sum + s.duration_seconds, 0);
    const secondHalfGapSum = secondHalfGapKms.reduce((sum, s) => sum + (s.gap_seconds_per_km || 0) * s.duration_seconds, 0);
    const secondHalfGap = secondHalfGapSum / secondHalfGapTime;
    const secondHalfHrSum = secondHalfGapKms.reduce((sum, s) => sum + (s.avg_hr || 0) * s.duration_seconds, 0);
    const secondHalfHr = secondHalfHrSum / secondHalfGapTime;
    const secondHalfPwHr = secondHalfGap / secondHalfHr;

    // Decoupling = % change in Pace:HR ratio
    // Positive = HR increased relative to effort (fatigue/dehydration)
    aerobicDecoupling = Math.round(((firstHalfPwHr - secondHalfPwHr) / firstHalfPwHr) * 100 * 10) / 10;
  }

  // Detect fade point (first km where pace drops >5% from average of first 3 kms)
  let fadePointKm: number | null = null;
  if (completeKms.length >= 5) {
    const baselineKms = completeKms.slice(0, 3);
    const baselineTime = baselineKms.reduce((sum, s) => sum + s.duration_seconds, 0);
    const baselineDist = baselineKms.reduce((sum, s) => sum + (s.distance_end - s.distance_start), 0);
    const baselinePace = (baselineTime / baselineDist) * 1000;

    for (let i = 3; i < completeKms.length; i++) {
      if (completeKms[i].pace_seconds_per_km > baselinePace * 1.05) {
        fadePointKm = completeKms[i].km;
        break;
      }
    }
  }

  return {
    fastest_km: {
      km: fastest.km,
      pace: fastest.pace,
      pace_seconds: fastest.pace_seconds_per_km,
    },
    slowest_km: {
      km: slowest.km,
      pace: slowest.pace,
      pace_seconds: slowest.pace_seconds_per_km,
    },
    avg_pace: formatPace(avgPaceSeconds),
    avg_pace_seconds: Math.round(avgPaceSeconds),
    positive_split: positiveSplit,
    negative_split: negativeSplit,
    pace_consistency: Math.round(paceConsistency * 100) / 100,
    hr_drift_percent: hrDriftPercent,
    hr_drift_context: hrDriftPercent !== null ? hrDriftContext : null,
    pace_change_percent: paceChangePercent,
    aerobic_decoupling: aerobicDecoupling,
    fade_point_km: fadePointKm,
  };
}
