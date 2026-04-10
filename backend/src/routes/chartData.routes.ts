import { Router } from 'express';
import {
  getPaceComparison,
  getSplitComparison,
  getHRZones,
  getExecutionTrend,
  getSimilarWorkouts,
  getPBProgression,
} from '../controllers/chartDataController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All chart data endpoints require authentication
router.use(authenticateToken);

/**
 * GET /api/v1/chart-data/pace-comparison
 * Query params: activityId (required), distanceMin, distanceMax, limit
 * Returns pace per km/mile comparison data for line charts
 */
router.get('/pace-comparison', getPaceComparison);

/**
 * GET /api/v1/chart-data/split-comparison
 * Query params: activityId (required), distanceMin, distanceMax, limit
 * Returns split comparison data for bar charts
 */
router.get('/split-comparison', getSplitComparison);

/**
 * GET /api/v1/chart-data/hr-zone-distribution
 * Query params: activityId (required)
 * Returns HR zone distribution data for stacked bar charts
 */
router.get('/hr-zone-distribution', getHRZones);

/**
 * GET /api/v1/chart-data/execution-score-trend
 * Query params: workoutType (optional), limit, days
 * Returns execution score trend over time for line charts
 */
router.get('/execution-score-trend', getExecutionTrend);

/**
 * GET /api/v1/chart-data/similar-workouts
 * Query params: activityId (required), distanceMin, distanceMax, workoutType, limit
 * Returns similar workout data for comparison
 */
router.get('/similar-workouts', getSimilarWorkouts);

/**
 * GET /api/v1/chart-data/pb-progression
 * Query params: distance (required), days
 * Returns personal best progression over time
 */
router.get('/pb-progression', getPBProgression);

export default router;
