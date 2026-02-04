import { Router } from 'express';
import authRoutes from './auth';
import activityRoutes from './activities';
import profileRoutes from './profile';
import goalRoutes from './goals';
import chatRoutes from './chat';
import trainingPlanRoutes from './trainingPlans';
import agentActionRoutes from './agentActions';
import notificationRoutes from './notifications';
import analysisRoutes from './analysis';

const router = Router();

router.use('/auth', authRoutes);
router.use('/activities', activityRoutes);
router.use('/profile', profileRoutes);
router.use('/goals', goalRoutes);
router.use('/chat', chatRoutes);
router.use('/training', trainingPlanRoutes);
router.use('/agent/actions', agentActionRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analysis', analysisRoutes);

export default router;
