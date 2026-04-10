import { Router } from 'express';
import * as activityController from '../controllers/activityController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', activityController.getActivities);
router.post('/sync', activityController.syncActivitiesController);
router.get('/stats', activityController.getStats);
router.get('/hr-zones', activityController.getHRZones);
router.get('/weekly-volume', activityController.getWeeklyVolume);
router.get('/:id', activityController.getActivityDetail);
router.get('/:id/zones', activityController.getActivityZonesController);
router.post('/:id/recompute-insights', activityController.recomputeActivityInsights);

export default router;
