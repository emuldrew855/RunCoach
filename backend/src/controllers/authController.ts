import { Request, Response } from 'express';
import { exchangeCodeForToken } from '../services/stravaService';
import { upsertUser } from '../models/User';
import { generateToken } from '../utils/jwt';
import { stravaConfig } from '../config/strava';
import { getClient, query } from '../config/database';
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

  // Note: Strava appears to expect unencoded redirect_uri (despite OAuth spec)
  const authUrl = `${stravaConfig.authorizeUrl}?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${stravaConfig.scopes}`;

  logger.info('STRAVA_AUTH_URL_GENERATED', { fullUrl: authUrl });

  res.redirect(authUrl);
}

export async function handleCallback(req: Request, res: Response): Promise<void> {
  logger.info('STRAVA_CALLBACK_HIT', {
    hasCode: !!req.query.code,
    scope: req.query.scope || 'NONE',
    error: req.query.error || 'NONE',
  });

  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      logger.warn('STRAVA_CALLBACK_NO_CODE');
      res.status(400).json({ error: 'Authorization code required' });
      return;
    }

    const client = await getClient();
    let user: Awaited<ReturnType<typeof upsertUser>>;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      // Match the MCP callback lock before Strava can rotate an unknown athlete's tokens.
      await client.query('LOCK TABLE public.users IN EXCLUSIVE MODE');
      logger.info('STRAVA_TOKEN_EXCHANGE_START');
      const { access_token, refresh_token, expires_at, athlete } = await exchangeCodeForToken(code);
      user = await upsertUser({
        strava_id: athlete.id,
        email: athlete.email,
        first_name: athlete.firstname,
        last_name: athlete.lastname,
        profile_picture_url: athlete.profile,
        access_token,
        refresh_token,
        token_expires_at: expires_at,
      }, client.query.bind(client));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
      stack: error.stack,
    });
    res.redirect(`${process.env.FRONTEND_URL}/?error=auth_failed`);
  }
}

export function relayMcpCallback(req: Request, res: Response): void {
  const parameters = req.query;
  // Morgan logs originalUrl after the response; never log the relayed code/state.
  req.originalUrl = `${req.baseUrl}${req.path}`;
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  let destination: URL;
  try {
    const origin = process.env.MCP_CALLBACK_ORIGIN || '';
    destination = new URL(origin);
    if (destination.protocol !== 'https:' || destination.origin !== origin) {
      throw new Error('Invalid MCP callback origin');
    }
    destination.pathname = '/strava/callback';
  } catch {
    logger.error('MCP_CALLBACK_RELAY_UNCONFIGURED');
    res.status(503).json({ error: 'MCP callback unavailable' });
    return;
  }
  const state = parameters.state;
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)
    || !['code', 'error'].some(name => typeof parameters[name] === 'string' && parameters[name])) {
    logger.warn('MCP_CALLBACK_RELAY_INVALID');
    res.status(400).json({ error: 'Invalid MCP callback' });
    return;
  }
  for (const name of ['state', 'code', 'scope', 'error']) {
    const value = parameters[name];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 1024) {
      logger.warn('MCP_CALLBACK_RELAY_INVALID');
      res.status(400).json({ error: 'Invalid MCP callback' });
      return;
    }
    destination.searchParams.set(name, value);
  }
  res.redirect(destination.href);
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // req.user only has id and stravaId from JWT, fetch full user from database
    const result = await query(
      'SELECT id, strava_id, email, first_name, last_name, profile_picture_url, created_at, last_login_at, is_admin, onboarding_completed FROM users WHERE id = $1',
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
