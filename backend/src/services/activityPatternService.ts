/**
 * Activity Pattern Extraction Service
 *
 * Automatically extracts meaningful patterns from activities:
 * - Pacing consistency (negative splits, positive splits, even pacing)
 * - Heart rate behavior (zones, intensity levels)
 * - Cadence patterns (stable, declining, variable)
 * - Elevation impact (how climbs affect pace and effort)
 *
 * These patterns are:
 * 1. Stored in activities.extracted_patterns JSONB column
 * 2. Embedded as natural language descriptions in activity_patterns table
 * 3. Used by the coach for personalized feedback and context
 */

import pool from '../config/database';
import { generateEmbedding } from './embeddingService';

export interface ExtractedPattern {
  pacing: {
    type: 'negative_split' | 'positive_split' | 'even' | 'progressive';
    consistency_score: number; // 0-1, higher = more consistent
    deterioration_percent?: number; // For positive splits
    first_half_pace: number; // min/km
    second_half_pace: number; // min/km
  };
  hr_behavior: {
    avg_zone: number; // 1-5
    intensity_level: 'easy' | 'moderate' | 'hard' | 'very_hard';
    zone_distribution?: { zone1: number; zone2: number; zone3: number; zone4: number; zone5: number };
    max_hr_percent?: number; // % of max HR reached (if user profile has max HR)
  };
  cadence?: {
    pattern: 'stable' | 'declining' | 'variable';
    consistency_score: number;
    avg_cadence: number;
  };
  elevation_impact?: {
    pace_impact_percent: number; // % slower on climbs
    effort_multiplier: number; // Perceived effort increase
  };
}

/**
 * Extract all patterns from an activity
 */
export async function extractActivityPatterns(
  _userId: number,
  activityId: number,
  activityData: any
): Promise<ExtractedPattern> {
  console.log(`📊 Extracting patterns for activity ${activityId}...`);

  // Extract pacing pattern from splits
  const pacingPattern = analyzePacingFromSplits(activityData.splits_metric || activityData.splits);

  // Analyze HR behavior
  const hrPattern = await analyzeHRBehavior(activityId, activityData);

  // Extract cadence pattern if available
  const cadencePattern = activityData.average_cadence
    ? analyzeCadencePattern(activityData)
    : undefined;

  // Analyze elevation impact if applicable
  const elevationPattern =
    activityData.total_elevation_gain_meters > 50
      ? analyzeElevationImpact(activityData)
      : undefined;

  const patterns: ExtractedPattern = {
    pacing: pacingPattern,
    hr_behavior: hrPattern,
    cadence: cadencePattern,
    elevation_impact: elevationPattern,
  };

  console.log(`✓ Patterns extracted: ${pacingPattern.type} pacing, ${hrPattern.intensity_level} intensity`);

  return patterns;
}

/**
 * Analyze splits for pacing consistency and strategy
 */
function analyzePacingFromSplits(splits: any[]): ExtractedPattern['pacing'] {
  if (!splits || splits.length < 2) {
    return {
      type: 'even',
      consistency_score: 1,
      first_half_pace: 0,
      second_half_pace: 0,
    };
  }

  // Extract speeds from splits (handle both m/s and pace formats)
  const speeds = splits.map((s) => s.average_speed || s.velocity_smooth || 0);

  // Calculate first half vs second half
  const halfPoint = Math.floor(splits.length / 2);
  const firstHalfSpeeds = speeds.slice(0, halfPoint);
  const secondHalfSpeeds = speeds.slice(halfPoint);

  const firstHalfAvg = mean(firstHalfSpeeds);
  const secondHalfAvg = mean(secondHalfSpeeds);

  // Calculate pace change percentage
  const paceChange = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

  // Determine pacing type
  let type: 'negative_split' | 'positive_split' | 'even' | 'progressive';
  if (paceChange > 3) {
    type = 'negative_split'; // Faster 2nd half (good!)
  } else if (paceChange < -3) {
    type = 'positive_split'; // Slower 2nd half (faded)
  } else {
    type = 'even'; // Consistent throughout
  }

  // Calculate consistency score (coefficient of variation)
  const stdDev = standardDeviation(speeds);
  const avgSpeed = mean(speeds);
  const coefficientOfVariation = avgSpeed > 0 ? stdDev / avgSpeed : 0;
  const consistency = Math.max(0, Math.min(1, 1 - coefficientOfVariation));

  return {
    type,
    consistency_score: consistency,
    deterioration_percent: type === 'positive_split' ? Math.abs(paceChange) : undefined,
    first_half_pace: speedToPace(firstHalfAvg),
    second_half_pace: speedToPace(secondHalfAvg),
  };
}

/**
 * Analyze HR behavior from HR zones or raw HR data
 */
async function analyzeHRBehavior(
  activityId: number,
  activityData: any
): Promise<ExtractedPattern['hr_behavior']> {
  // Try to get HR zone data from database
  const hrZones = await pool.query(
    `SELECT zone_1_seconds, zone_2_seconds, zone_3_seconds, zone_4_seconds, zone_5_seconds
     FROM activity_hr_zones
     WHERE activity_id = $1`,
    [activityId]
  );

  if (hrZones.rows.length > 0) {
    const zones = hrZones.rows[0];
    const totalSeconds =
      zones.zone_1_seconds +
      zones.zone_2_seconds +
      zones.zone_3_seconds +
      zones.zone_4_seconds +
      zones.zone_5_seconds;

    // Calculate weighted average zone
    const avgZone =
      totalSeconds > 0
        ? (zones.zone_1_seconds * 1 +
            zones.zone_2_seconds * 2 +
            zones.zone_3_seconds * 3 +
            zones.zone_4_seconds * 4 +
            zones.zone_5_seconds * 5) /
          totalSeconds
        : 2;

    // Determine intensity level
    let intensityLevel: 'easy' | 'moderate' | 'hard' | 'very_hard';
    if (avgZone < 2.5) intensityLevel = 'easy';
    else if (avgZone < 3.5) intensityLevel = 'moderate';
    else if (avgZone < 4.5) intensityLevel = 'hard';
    else intensityLevel = 'very_hard';

    return {
      avg_zone: Math.round(avgZone * 10) / 10,
      intensity_level: intensityLevel,
      zone_distribution: {
        zone1: Math.round((zones.zone_1_seconds / totalSeconds) * 100) / 100,
        zone2: Math.round((zones.zone_2_seconds / totalSeconds) * 100) / 100,
        zone3: Math.round((zones.zone_3_seconds / totalSeconds) * 100) / 100,
        zone4: Math.round((zones.zone_4_seconds / totalSeconds) * 100) / 100,
        zone5: Math.round((zones.zone_5_seconds / totalSeconds) * 100) / 100,
      },
    };
  }

  // Fallback: estimate from average HR
  if (activityData.average_heartrate) {
    const avgHR = activityData.average_heartrate;
    let intensityLevel: 'easy' | 'moderate' | 'hard' | 'very_hard';
    let avgZone: number;

    // Simple estimation based on common HR thresholds
    if (avgHR < 130) {
      intensityLevel = 'easy';
      avgZone = 1.5;
    } else if (avgHR < 150) {
      intensityLevel = 'moderate';
      avgZone = 2.5;
    } else if (avgHR < 170) {
      intensityLevel = 'hard';
      avgZone = 3.5;
    } else {
      intensityLevel = 'very_hard';
      avgZone = 4.5;
    }

    return { avg_zone: avgZone, intensity_level: intensityLevel };
  }

  // No HR data available
  return { avg_zone: 0, intensity_level: 'moderate' };
}

/**
 * Analyze cadence consistency
 */
function analyzeCadencePattern(activityData: any): ExtractedPattern['cadence'] {
  const avgCadence = activityData.average_cadence;

  // Estimate consistency based on average cadence
  // (Without time-series data, we use heuristics)
  let pattern: 'stable' | 'declining' | 'variable';
  let consistency: number;

  // Typical cadence patterns based on research
  if (avgCadence >= 170 && avgCadence <= 185) {
    pattern = 'stable'; // Good cadence range
    consistency = 0.85;
  } else if (avgCadence < 170) {
    pattern = 'declining'; // May indicate fatigue
    consistency = 0.7;
  } else {
    pattern = 'variable'; // Unusually high, might be inconsistent
    consistency = 0.75;
  }

  return {
    pattern,
    consistency_score: consistency,
    avg_cadence: Math.round(avgCadence),
  };
}

/**
 * Analyze how elevation affects pace and effort
 */
function analyzeElevationImpact(activityData: any): ExtractedPattern['elevation_impact'] {
  const elevationGain = activityData.total_elevation_gain_meters;
  const distance = activityData.distance_meters || 1000;

  // Calculate elevation gain per kilometer
  const elevationPerKm = (elevationGain / distance) * 1000;

  // Estimate pace impact (rough heuristic: 1% slower per 10m elevation gain/km)
  const paceImpact = Math.min(50, elevationPerKm * 1.5); // Cap at 50%

  // Estimate effort multiplier (perceived exertion)
  const effortMultiplier = 1 + paceImpact / 100;

  return {
    pace_impact_percent: Math.round(paceImpact * 10) / 10,
    effort_multiplier: Math.round(effortMultiplier * 100) / 100,
  };
}

/**
 * Generate natural language pattern descriptions and store with embeddings
 */
export async function generatePatternEmbeddings(
  userId: number,
  activityId: number,
  patterns: ExtractedPattern
): Promise<void> {
  console.log(`🧠 Generating pattern embeddings for activity ${activityId}...`);

  // Generate natural language descriptions of patterns
  const patternDescriptions: Array<{ text: string; category: string }> = [];

  // Pacing pattern
  if (patterns.pacing.consistency_score > 0.7) {
    patternDescriptions.push({
      text: `Runner exhibits ${patterns.pacing.type} pacing strategy with ${Math.round(patterns.pacing.consistency_score * 100)}% consistency`,
      category: 'pacing',
    });
  }

  if (patterns.pacing.type === 'positive_split' && patterns.pacing.deterioration_percent) {
    patternDescriptions.push({
      text: `Pace deteriorated by ${patterns.pacing.deterioration_percent.toFixed(1)}% in second half, indicating potential pacing issue or fatigue`,
      category: 'pacing',
    });
  }

  // HR behavior pattern
  patternDescriptions.push({
    text: `Training intensity: ${patterns.hr_behavior.intensity_level}, primarily in Zone ${Math.round(patterns.hr_behavior.avg_zone)}`,
    category: 'hr_behavior',
  });

  // Cadence pattern if available
  if (patterns.cadence) {
    patternDescriptions.push({
      text: `Cadence pattern: ${patterns.cadence.pattern} at ${patterns.cadence.avg_cadence} steps/min`,
      category: 'performance',
    });
  }

  // Elevation impact if significant
  if (patterns.elevation_impact && patterns.elevation_impact.pace_impact_percent > 5) {
    patternDescriptions.push({
      text: `Elevation gain slows pace by approximately ${patterns.elevation_impact.pace_impact_percent.toFixed(1)}% with ${patterns.elevation_impact.effort_multiplier}x effort multiplier`,
      category: 'performance',
    });
  }

  // Store each pattern with embedding
  for (const { text, category } of patternDescriptions) {
    try {
      const embedding = await generateEmbedding(text);

      // Use ON CONFLICT to increment occurrence count if pattern already exists
      await pool.query(
        `INSERT INTO activity_patterns
         (user_id, pattern_text, pattern_category, occurrence_count, embedding, metadata, first_seen, last_seen)
         VALUES ($1, $2, $3, 1, $4::vector, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, pattern_text)
         DO UPDATE SET
           occurrence_count = activity_patterns.occurrence_count + 1,
           last_seen = CURRENT_TIMESTAMP,
           metadata = jsonb_set(
             activity_patterns.metadata,
             '{activity_ids}',
             COALESCE(activity_patterns.metadata->'activity_ids', '[]'::jsonb) || $6::jsonb
           )`,
        [userId, text, category, JSON.stringify(embedding), JSON.stringify({ activity_id: activityId }), JSON.stringify(activityId)]
      );
    } catch (error) {
      console.error(`Failed to store pattern embedding: ${text}`, error);
    }
  }

  console.log(`✓ Stored ${patternDescriptions.length} pattern embeddings`);
}

// Helper functions

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Convert speed (m/s) to pace (min/km)
 */
function speedToPace(speed: number): number {
  if (speed === 0) return 0;
  return 1000 / (speed * 60); // Convert to min/km
}
