import { Router } from 'express';
import * as trainingPlanController from '../controllers/trainingPlanController';
import { authenticateToken } from '../middleware/auth';
import { uploadConfig } from '../services/trainingPlanService';

const router = Router();

router.use(authenticateToken);

// Training Plan Routes
router.get('/plans', trainingPlanController.getPlans);
router.get('/plans/active', trainingPlanController.getActivePlanController);
router.post('/plans', trainingPlanController.createManualPlan);
router.post('/plans/upload', uploadConfig.single('file'), trainingPlanController.uploadPlanFile);
router.put('/plans/:id', trainingPlanController.updatePlanController);
router.delete('/plans/:id', trainingPlanController.deletePlanController);

// Workout Routes
router.get('/workouts', trainingPlanController.getWorkouts);
router.post('/workouts', trainingPlanController.addWorkout);
router.put('/workouts/:id', trainingPlanController.updateWorkoutController);
router.delete('/workouts/:id', trainingPlanController.deleteWorkoutController);
router.post('/workouts/:id/complete', trainingPlanController.completeWorkout);

// Alert Routes
router.get('/alerts', trainingPlanController.getAlerts);

export default router;
