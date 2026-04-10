import { Request, Response } from 'express';
import {
  getPaceComparisonData,
  getSplitComparisonData,
  getHRZoneDistribution,
  getExecutionScoreTrend,
  getSimilarWorkoutsData,
  getPBProgression as getPBProgressionData,
} from '../services/chartDataService';
import { ChartDataQueryParams } from '../types/chartData';

/**
 * GET /api/v1/chart-data/pace-comparison
 * Returns pace comparison data for line chart
 */
export async function getPaceComparison(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const params: ChartDataQueryParams = {
      activityId: req.query.activityId
        ? parseInt(req.query.activityId as string, 10)
        : undefined,
      distanceRange: req.query.distanceMin && req.query.distanceMax
        ? [
            parseInt(req.query.distanceMin as string, 10),
            parseInt(req.query.distanceMax as string, 10),
          ]
        : undefined,
      limit: req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined,
    };

    if (!params.activityId) {
      return res.status(400).json({
        error: 'activityId query parameter is required',
      });
    }

    const data = await getPaceComparisonData(userId, params);
    res.json(data);
  } catch (error: any) {
    console.error('Error getting pace comparison data:', error);
    res.status(500).json({
      error: 'Failed to fetch pace comparison data',
      message: error.message,
    });
  }
}

/**
 * GET /api/v1/chart-data/split-comparison
 * Returns split comparison data for bar chart
 */
export async function getSplitComparison(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const params: ChartDataQueryParams = {
      activityId: req.query.activityId
        ? parseInt(req.query.activityId as string, 10)
        : undefined,
      distanceRange: req.query.distanceMin && req.query.distanceMax
        ? [
            parseInt(req.query.distanceMin as string, 10),
            parseInt(req.query.distanceMax as string, 10),
          ]
        : undefined,
      limit: req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined,
    };

    if (!params.activityId) {
      return res.status(400).json({
        error: 'activityId query parameter is required',
      });
    }

    const data = await getSplitComparisonData(userId, params);
    res.json(data);
  } catch (error: any) {
    console.error('Error getting split comparison data:', error);
    res.status(500).json({
      error: 'Failed to fetch split comparison data',
      message: error.message,
    });
  }
}

/**
 * GET /api/v1/chart-data/hr-zone-distribution
 * Returns HR zone distribution data for stacked bar chart
 */
export async function getHRZones(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const params: ChartDataQueryParams = {
      activityId: req.query.activityId
        ? parseInt(req.query.activityId as string, 10)
        : undefined,
    };

    if (!params.activityId) {
      return res.status(400).json({
        error: 'activityId query parameter is required',
      });
    }

    const data = await getHRZoneDistribution(userId, params);
    res.json(data);
  } catch (error: any) {
    console.error('Error getting HR zone distribution:', error);
    res.status(500).json({
      error: 'Failed to fetch HR zone distribution',
      message: error.message,
    });
  }
}

/**
 * GET /api/v1/chart-data/execution-score-trend
 * Returns execution score trend data for line chart
 */
export async function getExecutionTrend(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const params: ChartDataQueryParams = {
      workoutType: req.query.workoutType
        ? (req.query.workoutType as string)
        : undefined,
      limit: req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined,
      days: req.query.days ? parseInt(req.query.days as string, 10) : undefined,
    };

    const data = await getExecutionScoreTrend(userId, params);
    res.json(data);
  } catch (error: any) {
    console.error('Error getting execution score trend:', error);
    res.status(500).json({
      error: 'Failed to fetch execution score trend',
      message: error.message,
    });
  }
}

/**
 * GET /api/v1/chart-data/similar-workouts
 * Returns similar workouts data
 */
export async function getSimilarWorkouts(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const params: ChartDataQueryParams = {
      activityId: req.query.activityId
        ? parseInt(req.query.activityId as string, 10)
        : undefined,
      distanceRange: req.query.distanceMin && req.query.distanceMax
        ? [
            parseInt(req.query.distanceMin as string, 10),
            parseInt(req.query.distanceMax as string, 10),
          ]
        : undefined,
      workoutType: req.query.workoutType
        ? (req.query.workoutType as string)
        : undefined,
      limit: req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined,
    };

    if (!params.activityId) {
      return res.status(400).json({
        error: 'activityId query parameter is required',
      });
    }

    const data = await getSimilarWorkoutsData(userId, params);
    res.json(data);
  } catch (error: any) {
    console.error('Error getting similar workouts:', error);
    res.status(500).json({
      error: 'Failed to fetch similar workouts',
      message: error.message,
    });
  }
}

/**
 * GET /api/v1/chart-data/pb-progression
 * Returns personal best progression data
 */
export async function getPBProgression(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const params: ChartDataQueryParams = {
      distance: req.query.distance
        ? parseInt(req.query.distance as string, 10)
        : undefined,
      days: req.query.days ? parseInt(req.query.days as string, 10) : undefined,
    };

    if (!params.distance) {
      return res.status(400).json({
        error: 'distance query parameter is required',
      });
    }

    const data = await getPBProgressionData(userId, params);
    res.json(data);
  } catch (error: any) {
    console.error('Error getting PB progression:', error);
    res.status(500).json({
      error: 'Failed to fetch PB progression',
      message: error.message,
    });
  }
}
