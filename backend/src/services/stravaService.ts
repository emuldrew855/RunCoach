import axios from 'axios';
import { stravaConfig } from '../config/strava';
import { StravaTokenResponse, StravaActivity } from '../types/models';
import { getUserById, updateUser } from '../models/User';

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  console.log('Strava Config:', {
    clientId: stravaConfig.clientId,
    clientSecret: stravaConfig.clientSecret ? `${stravaConfig.clientSecret.substring(0, 10)}...` : 'MISSING',
    redirectUri: stravaConfig.redirectUri,
  });

  const requestData = {
    client_id: stravaConfig.clientId,
    client_secret: stravaConfig.clientSecret,
    code,
    grant_type: 'authorization_code',
  };

  console.log('Sending to Strava:', {
    ...requestData,
    client_secret: requestData.client_secret ? `${requestData.client_secret.substring(0, 10)}...` : 'MISSING',
    code: `${code.substring(0, 10)}...`,
  });

  const response = await axios.post(stravaConfig.tokenUrl, requestData);
  return response.data;
}

export async function refreshStravaToken(userId: number): Promise<string> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const now = Math.floor(Date.now() / 1000);

  // Check if token is expired or will expire soon (within 1 hour)
  if (user.token_expires_at > now + 3600) {
    return user.access_token;
  }

  // Refresh token
  const response = await axios.post(stravaConfig.tokenUrl, {
    client_id: stravaConfig.clientId,
    client_secret: stravaConfig.clientSecret,
    refresh_token: user.refresh_token,
    grant_type: 'refresh_token',
  });

  const { access_token, refresh_token, expires_at } = response.data;

  // Update user in database
  await updateUser(userId, {
    access_token,
    refresh_token,
    token_expires_at: expires_at,
  });

  return access_token;
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
 * Get activity streams (detailed data like HR over time)
 * Available stream types: time, heartrate, distance, altitude, velocity_smooth, etc.
 */
export async function getActivityStreams(
  userId: number,
  activityId: number,
  streamTypes: string[] = ['time', 'heartrate']
): Promise<{ time?: { data: number[] }; heartrate?: { data: number[] } }> {
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
