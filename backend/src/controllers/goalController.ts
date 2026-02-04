import { Request, Response } from 'express';
import { getGoalsByUserId, createGoal, updateGoal } from '../models/Goal';

export async function getGoals(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const goals = await getGoalsByUserId(userId);
    res.json({ goals });
  } catch (error) {
    console.error('Get goals error:', error);
    res.status(500).json({ error: 'Failed to get goals' });
  }
}

export async function createGoalController(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const goal = await createGoal({ user_id: userId, ...req.body });
    res.json({ goal });
  } catch (error) {
    console.error('Create goal error:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
}

export async function updateGoalController(req: Request, res: Response): Promise<void> {
  try {
    const goalId = parseInt(req.params.id);
    const goal = await updateGoal(goalId, req.body);
    res.json({ goal });
  } catch (error) {
    console.error('Update goal error:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
}
