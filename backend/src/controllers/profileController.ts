import { Request, Response } from 'express';
import { getProfileByUserId, upsertProfile } from '../models/UserProfile';

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const profile = await getProfileByUserId(userId);
    res.json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const profile = await upsertProfile({ user_id: userId, ...req.body });
    res.json({ profile });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}
