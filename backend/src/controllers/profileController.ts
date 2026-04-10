import { Request, Response } from 'express';
import { getProfileByUserId, upsertProfile } from '../models/UserProfile';
import { recalculateAllUserHRZones } from '../models/ActivityHRZone';

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

    // Check if HR zones are being updated
    const hrZonesUpdated = [
      'hr_zone_1_max',
      'hr_zone_2_max',
      'hr_zone_3_max',
      'hr_zone_4_max',
      'hr_zone_5_max'
    ].some(field => req.body[field] !== undefined);

    // Update the profile
    const profile = await upsertProfile({ user_id: userId, ...req.body });

    // If HR zones were updated, recalculate all activity HR zones in the background
    if (hrZonesUpdated) {
      console.log(`🔄 HR zones updated for user ${userId}, triggering recalculation...`);
      // Run in background (don't await)
      recalculateAllUserHRZones(userId)
        .then(count => {
          console.log(`✅ Recalculated HR zones for ${count} activities (user ${userId})`);
        })
        .catch(error => {
          console.error(`❌ Failed to recalculate HR zones for user ${userId}:`, error);
        });
    }

    res.json({ profile });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

/**
 * Manually trigger recalculation of HR zones for all activities
 * Useful for testing or fixing data issues
 */
export async function recalculateHRZones(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    console.log(`🔄 Manually triggered HR zone recalculation for user ${userId}`);

    const count = await recalculateAllUserHRZones(userId);

    res.json({
      success: true,
      message: `Successfully recalculated HR zones for ${count} activities`,
      activitiesUpdated: count,
    });
  } catch (error) {
    console.error('Recalculate HR zones error:', error);
    res.status(500).json({ error: 'Failed to recalculate HR zones' });
  }
}
