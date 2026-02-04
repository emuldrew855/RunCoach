import { Router } from 'express';
import * as goalController from '../controllers/goalController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', goalController.getGoals);
router.post('/', goalController.createGoalController);
router.put('/:id', goalController.updateGoalController);

export default router;
