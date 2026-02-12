import { Router } from 'express';
import * as raceHistoryController from '../controllers/raceHistoryController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/history', raceHistoryController.getRaceHistory);
router.get('/history/:id', raceHistoryController.getRace);
router.post('/history', raceHistoryController.createRace);
router.put('/history/:id', raceHistoryController.updateRace);
router.delete('/history/:id', raceHistoryController.deleteRace);
router.get('/personal-bests', raceHistoryController.getPBs);

export default router;
