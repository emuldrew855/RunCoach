import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/strava', authController.redirectToStrava);
router.get('/callback', authController.handleCallback);
router.get('/strava/callback', authController.handleCallback);
router.get('/me', authenticateToken, authController.getCurrentUser);

export default router;
