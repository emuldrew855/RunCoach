import axios from 'axios';
import { stravaConfig } from '../config/strava';
import { StravaTokenResponse, StravaActivity } from '../types/models';
import { getClient } from '../config/database';

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const requestData = {
    client_id: stravaConfig.clientId,
    client_secret: stravaConfig.clientSecret,
    code,
    grant_type: 'authorization_code',
  };

  const response = await axios.post(stravaConfig.tokenUrl, requestData, { timeout: 15000 });
  return response.data;
}

export async function refreshStravaToken(userId: number): Promise<string> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // The MCP service shares this row lock so rotated Strava credentials cannot race.
    const result = await client.query(
      'SELECT access_token, refresh_token, token_expires_at FROM public.users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const user = result.rows[0];
    if (!user) throw new Error('User not found');

    const now = Math.floor(Date.now() / 1000);

    // Check if token is expired or will expire soon (within 1 hour)
    if (user.token_expires_at > now + 3600) {
      await client.query('COMMIT');
      return user.access_token;
    }

    const response = await axios.post(stravaConfig.tokenUrl, {
      client_id: stravaConfig.clientId,
      client_secret: stravaConfig.clientSecret,
      refresh_token: user.refresh_token,
      grant_type: 'refresh_token',
    }, { timeout: 10000 });

    const { access_token, refresh_token, expires_at } = response.data;
    if (typeof access_token !== 'string' || !access_token
      || typeof refresh_token !== 'string' || !refresh_token
      || !Number.isSafeInteger(expires_at) || expires_at <= now) {
      throw new Error('Invalid Strava token response');
    }
    await client.query(
      `UPDATE public.users SET access_token = $1, refresh_token = $2,
       token_expires_at = $3, updated_at = NOW() WHERE id = $4`,
      [access_token, refresh_token, expires_at, userId]
    );
    await client.query('COMMIT');
    return access_token;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStravaActivities(
  userId: number,
  after?: number,
  page: number = 1,
  perPage: number = 100
): Promise<StravaActivity[]> {
  const accessToken = await refreshStravaToken(userId);

  const params: any = {
    per_page: perPage,
    page,
  };

  if (after) {
    params.after = after;
  }

  const response = await axios.get(`${stravaConfig.apiBaseUrl}/athlete/activities`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params,
  });

  return response.data;
}

/**
 * Stream data types from Strava API
 */
export interface ActivityStreamData {
  time?: { data: number[] };           // Seconds elapsed
  heartrate?: { data: number[] };      // BPM at each point
  distance?: { data: number[] };       // Meters from start
  altitude?: { data: number[] };       // Meters elevation
  velocity_smooth?: { data: number[] }; // Smoothed velocity in m/s
  cadence?: { data: number[] };        // Steps per minute
  watts?: { data: number[] };          // Power (if available)
  grade_smooth?: { data: number[] };   // Grade/gradient %
}

/**
 * Get activity streams (detailed data like HR over time)
 * Available stream types: time, heartrate, distance, altitude, velocity_smooth, cadence, watts, grade_smooth
 */
export async function getActivityStreams(
  userId: number,
  activityId: number,
  streamTypes: string[] = ['time', 'heartrate']
): Promise<ActivityStreamData> {
  const accessToken = await refreshStravaToken(userId);

  try {
    const response = await axios.get(
      `${stravaConfig.apiBaseUrl}/activities/${activityId}/streams`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { keys: streamTypes.join(','), key_by_type: true },
      }
    );

    return response.data;
  } catch (error: any) {
    // Strava returns 404 if no streams available for activity
    if (error.response?.status === 404) {
      return {};
    }
    throw error;
  }
}

/**
 * Get comprehensive activity streams for per-km analysis
 * Fetches all streams needed for detailed split bucketing with HR correlation
 */
export async function getActivityStreamsForAnalysis(
  userId: number,
  activityId: number
): Promise<ActivityStreamData> {
  return getActivityStreams(userId, activityId, [
    'time',
    'heartrate',
    'distance',
    'altitude',
    'velocity_smooth',
    'cadence',
    'grade_smooth',
  ]);
}

/**
 * Get activity zones (heart rate, power zones)
 * Summit Feature - requires activity:read or activity:read_all
 */
export async function getActivityZones(
  userId: number,
  activityId: number
): Promise<any> {
  const accessToken = await refreshStravaToken(userId);

  try {
    const response = await axios.get(
      `${stravaConfig.apiBaseUrl}/activities/${activityId}/zones`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return response.data;
  } catch (error: any) {
    // Strava returns 404 if no zones available (not a Summit feature or no zones data)
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}
