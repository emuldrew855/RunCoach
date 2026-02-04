import { query } from '../config/database';
import { ActivityHRZone } from '../types/models';

// Standard fixed HR zones (per user requirements)
export const HR_ZONE_THRESHOLDS = {
  zone_1_max: 120,
  zone_2_max: 140,
  zone_3_max: 160,
  zone_4_max: 175,
  zone_5_max: 220, // max theoretical
};

export async function getHRZonesByActivityId(activityId: number): Promise<ActivityHRZone | null> {
  const result = await query(
    'SELECT * FROM activity_hr_zones WHERE activity_id = $1',
    [activityId]
  );
  return result.rows[0] || null;
}

export async function calculateAndStoreHRZones(
  activityId: number,
  userId: number,
  hrData: { timestamps: number[], heartrates: number[] }
): Promise<ActivityHRZone> {
  // Initialize zone time counters
  const zoneSeconds = {
    zone_1_seconds: 0,
    zone_2_seconds: 0,
    zone_3_seconds: 0,
    zone_4_seconds: 0,
    zone_5_seconds: 0,
  };

  // Calculate time in each zone
  for (let i = 0; i < hrData.heartrates.length; i++) {
    const hr = hrData.heartrates[i];

    // Calculate duration for this data point
    // If there's a next timestamp, use the difference; otherwise assume 1 second
    const duration = i < hrData.timestamps.length - 1
      ? hrData.timestamps[i + 1] - hrData.timestamps[i]
      : 1;

    // Classify into zone and add duration
    if (hr < HR_ZONE_THRESHOLDS.zone_1_max) {
      zoneSeconds.zone_1_seconds += duration;
    } else if (hr < HR_ZONE_THRESHOLDS.zone_2_max) {
      zoneSeconds.zone_2_seconds += duration;
    } else if (hr < HR_ZONE_THRESHOLDS.zone_3_max) {
      zoneSeconds.zone_3_seconds += duration;
    } else if (hr < HR_ZONE_THRESHOLDS.zone_4_max) {
      zoneSeconds.zone_4_seconds += duration;
    } else {
      zoneSeconds.zone_5_seconds += duration;
    }
  }

  // Store in database (upsert)
  const result = await query(
    `INSERT INTO activity_hr_zones (
      activity_id, user_id, zone_1_seconds, zone_2_seconds, zone_3_seconds,
      zone_4_seconds, zone_5_seconds, zone_1_max, zone_2_max, zone_3_max,
      zone_4_max, zone_5_max
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (activity_id) DO UPDATE SET
      zone_1_seconds = EXCLUDED.zone_1_seconds,
      zone_2_seconds = EXCLUDED.zone_2_seconds,
      zone_3_seconds = EXCLUDED.zone_3_seconds,
      zone_4_seconds = EXCLUDED.zone_4_seconds,
      zone_5_seconds = EXCLUDED.zone_5_seconds,
      calculated_at = NOW()
    RETURNING *`,
    [
      activityId,
      userId,
      zoneSeconds.zone_1_seconds,
      zoneSeconds.zone_2_seconds,
      zoneSeconds.zone_3_seconds,
      zoneSeconds.zone_4_seconds,
      zoneSeconds.zone_5_seconds,
      HR_ZONE_THRESHOLDS.zone_1_max,
      HR_ZONE_THRESHOLDS.zone_2_max,
      HR_ZONE_THRESHOLDS.zone_3_max,
      HR_ZONE_THRESHOLDS.zone_4_max,
      HR_ZONE_THRESHOLDS.zone_5_max,
    ]
  );
  return result.rows[0];
}

export async function getHRZoneSummary(userId: number, days: number = 30): Promise<{
  total_zone_1: number;
  total_zone_2: number;
  total_zone_3: number;
  total_zone_4: number;
  total_zone_5: number;
}> {
  const result = await query(
    `SELECT
       COALESCE(SUM(zone_1_seconds), 0) as total_zone_1,
       COALESCE(SUM(zone_2_seconds), 0) as total_zone_2,
       COALESCE(SUM(zone_3_seconds), 0) as total_zone_3,
       COALESCE(SUM(zone_4_seconds), 0) as total_zone_4,
       COALESCE(SUM(zone_5_seconds), 0) as total_zone_5
     FROM activity_hr_zones ahz
     JOIN activities a ON ahz.activity_id = a.id
     WHERE ahz.user_id = $1 AND a.start_date >= NOW() - INTERVAL '${days} days'`,
    [userId]
  );
  return result.rows[0];
}

export async function calculateHRZonesForActivities(
  activities: Array<{ id: number; user_id: number; average_heartrate: number; moving_time_seconds: number }>
): Promise<void> {
  // Fallback method when detailed HR stream data is not available
  // This estimates zone distribution based on average HR and assumes a normal distribution
  for (const activity of activities) {
    if (!activity.average_heartrate || !activity.moving_time_seconds) {
      continue;
    }

    const avgHR = activity.average_heartrate;
    const totalSeconds = activity.moving_time_seconds;

    // Simple estimation: assume most time is spent near average HR
    // Distribute time across zones based on proximity to average
    const zoneSeconds = {
      zone_1_seconds: 0,
      zone_2_seconds: 0,
      zone_3_seconds: 0,
      zone_4_seconds: 0,
      zone_5_seconds: 0,
    };

    // Determine primary zone based on average HR
    if (avgHR < HR_ZONE_THRESHOLDS.zone_1_max) {
      zoneSeconds.zone_1_seconds = Math.floor(totalSeconds * 0.8);
      zoneSeconds.zone_2_seconds = Math.floor(totalSeconds * 0.2);
    } else if (avgHR < HR_ZONE_THRESHOLDS.zone_2_max) {
      zoneSeconds.zone_1_seconds = Math.floor(totalSeconds * 0.2);
      zoneSeconds.zone_2_seconds = Math.floor(totalSeconds * 0.6);
      zoneSeconds.zone_3_seconds = Math.floor(totalSeconds * 0.2);
    } else if (avgHR < HR_ZONE_THRESHOLDS.zone_3_max) {
      zoneSeconds.zone_2_seconds = Math.floor(totalSeconds * 0.2);
      zoneSeconds.zone_3_seconds = Math.floor(totalSeconds * 0.6);
      zoneSeconds.zone_4_seconds = Math.floor(totalSeconds * 0.2);
    } else if (avgHR < HR_ZONE_THRESHOLDS.zone_4_max) {
      zoneSeconds.zone_3_seconds = Math.floor(totalSeconds * 0.2);
      zoneSeconds.zone_4_seconds = Math.floor(totalSeconds * 0.6);
      zoneSeconds.zone_5_seconds = Math.floor(totalSeconds * 0.2);
    } else {
      zoneSeconds.zone_4_seconds = Math.floor(totalSeconds * 0.2);
      zoneSeconds.zone_5_seconds = Math.floor(totalSeconds * 0.8);
    }

    // Store estimated zones
    await query(
      `INSERT INTO activity_hr_zones (
        activity_id, user_id, zone_1_seconds, zone_2_seconds, zone_3_seconds,
        zone_4_seconds, zone_5_seconds, zone_1_max, zone_2_max, zone_3_max,
        zone_4_max, zone_5_max
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (activity_id) DO NOTHING`,
      [
        activity.id,
        activity.user_id,
        zoneSeconds.zone_1_seconds,
        zoneSeconds.zone_2_seconds,
        zoneSeconds.zone_3_seconds,
        zoneSeconds.zone_4_seconds,
        zoneSeconds.zone_5_seconds,
        HR_ZONE_THRESHOLDS.zone_1_max,
        HR_ZONE_THRESHOLDS.zone_2_max,
        HR_ZONE_THRESHOLDS.zone_3_max,
        HR_ZONE_THRESHOLDS.zone_4_max,
        HR_ZONE_THRESHOLDS.zone_5_max,
      ]
    );
  }
}
