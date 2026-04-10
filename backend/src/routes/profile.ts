import { Router } from 'express';
import * as profileController from '../controllers/profileController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', profileController.getProfile);
router.put('/', profileController.updateProfile);
router.post('/recalculate-hr-zones', profileController.recalculateHRZones);

export default router;
