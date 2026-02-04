import { Router } from 'express';
import * as activityController from '../controllers/activityController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', activityController.getActivities);
router.post('/sync', activityController.syncActivitiesController);
router.get('/stats', activityController.getStats);
router.get('/hr-zones', activityController.getHRZones);

export default router;
