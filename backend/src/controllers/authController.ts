import { Request, Response } from 'express';
import { exchangeCodeForToken } from '../services/stravaService';
import { upsertUser } from '../models/User';
import { generateToken } from '../utils/jwt';
import { stravaConfig } from '../config/strava';

export async function redirectToStrava(_req: Request, res: Response): Promise<void> {
  const authUrl = `${stravaConfig.authorizeUrl}?client_id=${stravaConfig.clientId}&redirect_uri=${stravaConfig.redirectUri}&response_type=code&scope=${stravaConfig.scopes}`;
  res.redirect(authUrl);
}

export async function handleCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Authorization code required' });
      return;
    }

    // Exchange code for tokens
    const tokenResponse = await exchangeCodeForToken(code);
    const { access_token, refresh_token, expires_at, athlete } = tokenResponse;

    // Create or update user
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

    // Generate JWT
    const jwt = generateToken({
      userId: user.id,
      stravaId: user.strava_id,
    });

    // Redirect to frontend with JWT
    res.redirect(`${process.env.FRONTEND_URL}/callback?token=${jwt}`);
  } catch (error) {
    console.error('Auth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/?error=auth_failed`);
  }
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { access_token, refresh_token, ...userWithoutTokens } = req.user;
    res.json({ user: userWithoutTokens });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}
