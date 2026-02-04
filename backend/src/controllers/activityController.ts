import { Request, Response } from 'express';
import { getActivitiesByUserId, getActivityStats } from '../models/Activity';
import { syncActivities } from '../services/activityService';
import { getHRZoneSummary } from '../models/ActivityHRZone';

export async function getActivities(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const activities = await getActivitiesByUserId(userId, limit, offset);
    res.json({ activities });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Failed to get activities' });
  }
}

export async function syncActivitiesController(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const count = await syncActivities(userId);
    res.json({ message: `Synced ${count} activities`, count });
  } catch (error) {
    console.error('Sync activities error:', error);
    res.status(500).json({ error: 'Failed to sync activities' });
  }
}

export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;
    const stats = await getActivityStats(userId, days);
    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
}

export async function getHRZones(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;
    const summary = await getHRZoneSummary(userId, days);

    // Convert to hours for frontend
    const hrZoneData = {
      zone1Hours: Number(summary.total_zone_1) / 3600,
      zone2Hours: Number(summary.total_zone_2) / 3600,
      zone3Hours: Number(summary.total_zone_3) / 3600,
      zone4Hours: Number(summary.total_zone_4) / 3600,
      zone5Hours: Number(summary.total_zone_5) / 3600,
      totalHours: (
        Number(summary.total_zone_1) +
        Number(summary.total_zone_2) +
        Number(summary.total_zone_3) +
        Number(summary.total_zone_4) +
        Number(summary.total_zone_5)
      ) / 3600,
    };

    res.json({ hrZones: hrZoneData });
  } catch (error) {
    console.error('Get HR zones error:', error);
    res.status(500).json({ error: 'Failed to get HR zones' });
  }
}
