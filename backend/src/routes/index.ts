import { Router } from 'express';
import authRoutes from './auth';
import activityRoutes from './activities';
import profileRoutes from './profile';
import goalRoutes from './goals';
import chatRoutes from './chat';
import trainingPlanRoutes from './trainingPlans';
import agentActionRoutes from '../agent/routes/agent-actions.routes';
import notificationRoutes from './notifications';
import analysisRoutes from '../agent/routes/analysis.routes';
import adminRoutes from './admin.routes';
import agentContextRoutes from './agentContext.routes';
import raceHistoryRoutes from './raceHistory';
import memoriesRoutes from './memories';
import coachingRoutes from './coaching';
import chartDataRoutes from './chartData.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/activities', activityRoutes);
router.use('/profile', profileRoutes);
router.use('/goals', goalRoutes);
router.use('/chat', chatRoutes);
router.use('/training', trainingPlanRoutes);
router.use('/races', raceHistoryRoutes);
router.use('/agent/actions', agentActionRoutes);
router.use('/agent', agentContextRoutes); // Agent service endpoints
router.use('/notifications', notificationRoutes);
router.use('/analysis', analysisRoutes);
router.use('/admin', adminRoutes);
router.use('/memories', memoriesRoutes);
router.use('/coaching', coachingRoutes);
router.use('/chart-data', chartDataRoutes);

export default router;
