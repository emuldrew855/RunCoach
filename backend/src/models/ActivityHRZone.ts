import { query } from '../config/database';
import { ActivityHRZone } from '../types/models';

// Default HR zones (used as fallback if user hasn't set custom zones)
export const DEFAULT_HR_ZONE_THRESHOLDS = {
  zone_1_max: 120,
  zone_2_max: 140,
  zone_3_max: 160,
  zone_4_max: 175,
  zone_5_max: 220,
};

/**
 * Get user's custom HR zones from profile
 */
async function getUserHRZones(userId: number): Promise<{
  zone_1_max: number;
  zone_2_max: number;
  zone_3_max: number;
  zone_4_max: number;
  zone_5_max: number;
}> {
  const result = await query(
    `SELECT hr_zone_1_max, hr_zone_2_max, hr_zone_3_max, hr_zone_4_max, hr_zone_5_max
     FROM user_profiles WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0 || !result.rows[0].hr_zone_1_max) {
    return DEFAULT_HR_ZONE_THRESHOLDS;
  }

  return {
    zone_1_max: result.rows[0].hr_zone_1_max,
    zone_2_max: result.rows[0].hr_zone_2_max,
    zone_3_max: result.rows[0].hr_zone_3_max,
    zone_4_max: result.rows[0].hr_zone_4_max,
    zone_5_max: result.rows[0].hr_zone_5_max,
  };
}

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
  // Get user's custom HR zones
  const hrZones = await getUserHRZones(userId);

  // Initialize zone time counters
  const zoneSeconds = {
    zone_1_seconds: 0,
    zone_2_seconds: 0,
    zone_3_seconds: 0,
    zone_4_seconds: 0,
    zone_5_seconds: 0,
  };

  // Calculate time in each zone using user's custom zones
  for (let i = 0; i < hrData.heartrates.length; i++) {
    const hr = hrData.heartrates[i];

    // Calculate duration for this data point
    // If there's a next timestamp, use the difference; otherwise assume 1 second
    const duration = i < hrData.timestamps.length - 1
      ? hrData.timestamps[i + 1] - hrData.timestamps[i]
      : 1;

    // Classify into zone and add duration (using custom zones)
    if (hr < hrZones.zone_1_max) {
      zoneSeconds.zone_1_seconds += duration;
    } else if (hr < hrZones.zone_2_max) {
      zoneSeconds.zone_2_seconds += duration;
    } else if (hr < hrZones.zone_3_max) {
      zoneSeconds.zone_3_seconds += duration;
    } else if (hr < hrZones.zone_4_max) {
      zoneSeconds.zone_4_seconds += duration;
    } else {
      zoneSeconds.zone_5_seconds += duration;
    }
  }

  // Store in database (upsert) with user's custom zone thresholds
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
      zone_1_max = EXCLUDED.zone_1_max,
      zone_2_max = EXCLUDED.zone_2_max,
      zone_3_max = EXCLUDED.zone_3_max,
      zone_4_max = EXCLUDED.zone_4_max,
      zone_5_max = EXCLUDED.zone_5_max,
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
      hrZones.zone_1_max,
      hrZones.zone_2_max,
      hrZones.zone_3_max,
      hrZones.zone_4_max,
      hrZones.zone_5_max,
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

/**
 * Recalculate HR zones for all user's activities using updated custom zones
 * Call this when user updates their custom HR zones
 */
export async function recalculateAllUserHRZones(userId: number): Promise<number> {
  console.log(`🔄 Recalculating HR zones for all activities (user ${userId})`);

  // Get user's updated custom HR zones
  const hrZones = await getUserHRZones(userId);

  // Get all activities with HR zone data for this user
  const activitiesResult = await query(
    `SELECT activity_id, zone_1_seconds, zone_2_seconds, zone_3_seconds, zone_4_seconds, zone_5_seconds
     FROM activity_hr_zones
     WHERE user_id = $1`,
    [userId]
  );

  let recalculatedCount = 0;

  for (const activity of activitiesResult.rows) {
    // Get the activity's HR data to recalculate zones properly
    const activityDataResult = await query(
      `SELECT strava_data FROM activities WHERE id = $1`,
      [activity.activity_id]
    );

    if (activityDataResult.rows.length === 0) {
      continue;
    }

    const stravaData = activityDataResult.rows[0].strava_data;

    // Check if we have detailed HR stream data
    if (stravaData?.heartrate_stream) {
      // Recalculate using actual HR stream data with new zones
      const hrData = {
        timestamps: stravaData.heartrate_stream.map((point: any) => point.time),
        heartrates: stravaData.heartrate_stream.map((point: any) => point.value),
      };

      // Recalculate zones with new thresholds
      const zoneSeconds = {
        zone_1_seconds: 0,
        zone_2_seconds: 0,
        zone_3_seconds: 0,
        zone_4_seconds: 0,
        zone_5_seconds: 0,
      };

      for (let i = 0; i < hrData.heartrates.length; i++) {
        const hr = hrData.heartrates[i];
        const duration = i < hrData.timestamps.length - 1
          ? hrData.timestamps[i + 1] - hrData.timestamps[i]
          : 1;

        if (hr < hrZones.zone_1_max) {
          zoneSeconds.zone_1_seconds += duration;
        } else if (hr < hrZones.zone_2_max) {
          zoneSeconds.zone_2_seconds += duration;
        } else if (hr < hrZones.zone_3_max) {
          zoneSeconds.zone_3_seconds += duration;
        } else if (hr < hrZones.zone_4_max) {
          zoneSeconds.zone_4_seconds += duration;
        } else {
          zoneSeconds.zone_5_seconds += duration;
        }
      }

      // Update the activity's HR zones with new calculations and thresholds
      await query(
        `UPDATE activity_hr_zones SET
          zone_1_seconds = $1,
          zone_2_seconds = $2,
          zone_3_seconds = $3,
          zone_4_seconds = $4,
          zone_5_seconds = $5,
          zone_1_max = $6,
          zone_2_max = $7,
          zone_3_max = $8,
          zone_4_max = $9,
          zone_5_max = $10,
          calculated_at = NOW()
         WHERE activity_id = $11`,
        [
          zoneSeconds.zone_1_seconds,
          zoneSeconds.zone_2_seconds,
          zoneSeconds.zone_3_seconds,
          zoneSeconds.zone_4_seconds,
          zoneSeconds.zone_5_seconds,
          hrZones.zone_1_max,
          hrZones.zone_2_max,
          hrZones.zone_3_max,
          hrZones.zone_4_max,
          hrZones.zone_5_max,
          activity.activity_id,
        ]
      );

      recalculatedCount++;
    } else {
      // No HR stream data - just update the zone thresholds
      // (The time distribution stays the same, just the thresholds change)
      await query(
        `UPDATE activity_hr_zones SET
          zone_1_max = $1,
          zone_2_max = $2,
          zone_3_max = $3,
          zone_4_max = $4,
          zone_5_max = $5,
          calculated_at = NOW()
         WHERE activity_id = $6`,
        [
          hrZones.zone_1_max,
          hrZones.zone_2_max,
          hrZones.zone_3_max,
          hrZones.zone_4_max,
          hrZones.zone_5_max,
          activity.activity_id,
        ]
      );

      recalculatedCount++;
    }
  }

  console.log(`✅ Recalculated HR zones for ${recalculatedCount} activities`);
  return recalculatedCount;
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

    // Get user's custom HR zones
    const hrZones = await getUserHRZones(activity.user_id);

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

    // Determine primary zone based on average HR (using custom zones)
    if (avgHR < hrZones.zone_1_max) {
      zoneSeconds.zone_1_seconds = Math.floor(totalSeconds * 0.8);
      zoneSeconds.zone_2_seconds = Math.floor(totalSeconds * 0.2);
    } else if (avgHR < hrZones.zone_2_max) {
      zoneSeconds.zone_1_seconds = Math.floor(totalSeconds * 0.2);
      zoneSeconds.zone_2_seconds = Math.floor(totalSeconds * 0.6);
      zoneSeconds.zone_3_seconds = Math.floor(totalSeconds * 0.2);
    } else if (avgHR < hrZones.zone_3_max) {
      zoneSeconds.zone_2_seconds = Math.floor(totalSeconds * 0.2);
      zoneSeconds.zone_3_seconds = Math.floor(totalSeconds * 0.6);
      zoneSeconds.zone_4_seconds = Math.floor(totalSeconds * 0.2);
    } else if (avgHR < hrZones.zone_4_max) {
      zoneSeconds.zone_3_seconds = Math.floor(totalSeconds * 0.2);
      zoneSeconds.zone_4_seconds = Math.floor(totalSeconds * 0.6);
      zoneSeconds.zone_5_seconds = Math.floor(totalSeconds * 0.2);
    } else {
      zoneSeconds.zone_4_seconds = Math.floor(totalSeconds * 0.2);
      zoneSeconds.zone_5_seconds = Math.floor(totalSeconds * 0.8);
    }

    // Store estimated zones with user's custom zone thresholds
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
        hrZones.zone_1_max,
        hrZones.zone_2_max,
        hrZones.zone_3_max,
        hrZones.zone_4_max,
        hrZones.zone_5_max,
      ]
    );
  }
}
