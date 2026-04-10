import { Request, Response } from 'express';
import { exchangeCodeForToken } from '../services/stravaService';
import { upsertUser } from '../models/User';
import { generateToken } from '../utils/jwt';
import { stravaConfig } from '../config/strava';
import { query } from '../config/database';
import logger from '../utils/logger';

export async function redirectToStrava(_req: Request, res: Response): Promise<void> {
  const redirectUri = stravaConfig.redirectUri?.trim() || '';
  const clientId = stravaConfig.clientId || '';

  logger.info('STRAVA_AUTH_REDIRECT', {
    clientId,
    redirectUri,
    redirectUriLength: redirectUri.length,
    redirectUriEncoded: encodeURIComponent(redirectUri),
  });

  // URL-encode the redirect_uri as required by OAuth 2.0 spec
  const authUrl = `${stravaConfig.authorizeUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${stravaConfig.scopes}`;

  logger.info('STRAVA_AUTH_URL_GENERATED', { fullUrl: authUrl });

  res.redirect(authUrl);
}

export async function handleCallback(req: Request, res: Response): Promise<void> {
  logger.info('STRAVA_CALLBACK_HIT', {
    query: req.query,
    hasCode: !!req.query.code,
    state: req.query.state || 'NONE',
    scope: req.query.scope || 'NONE',
    error: req.query.error || 'NONE',
  });

  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      logger.warn('STRAVA_CALLBACK_NO_CODE', { query: req.query });
      res.status(400).json({ error: 'Authorization code required' });
      return;
    }

    logger.info('STRAVA_TOKEN_EXCHANGE_START');
    const tokenResponse = await exchangeCodeForToken(code);
    logger.info('STRAVA_TOKEN_EXCHANGE_SUCCESS', { athleteId: tokenResponse.athlete?.id });
    const { access_token, refresh_token, expires_at, athlete } = tokenResponse;

    logger.info('USER_UPSERT_START', { stravaId: athlete.id });
    const user = await upsertUser({
      strava_id: athlete.id,
      email: athlete.email,
      first_name: athlete.firstname,
      last_name: athlete.lastname,
      profile_picture_url: athlete.profile,
      access_token,
      refresh_token,
      token_expires_at: expires_at,
    });
    logger.info('USER_UPSERT_SUCCESS', { userId: user.id });

    const jwt = generateToken({
      userId: user.id,
      stravaId: user.strava_id,
    });

    const frontendUrl = process.env.FRONTEND_URL || '';
    logger.info('AUTH_REDIRECT_TO_FRONTEND', { frontendUrl });

    res.redirect(`${frontendUrl}/callback?token=${jwt}`);
  } catch (error: any) {
    logger.error('AUTH_CALLBACK_ERROR', {
      message: error.message,
      responseStatus: error.response?.status,
      responseData: error.response?.data,
      stack: error.stack,
    });
    res.redirect(`${process.env.FRONTEND_URL}/?error=auth_failed`);
  }
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // req.user only has id and stravaId from JWT, fetch full user from database
    const result = await query(
      'SELECT id, strava_id, email, first_name, last_name, profile_picture_url, created_at, last_login_at, is_admin FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}
