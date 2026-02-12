import { Request, Response, NextFunction } from 'express';
import {
  getRaceHistoryByUserId,
  getRaceHistoryById,
  createRaceHistory,
  updateRaceHistory,
  deleteRaceHistory,
  getPersonalBests,
} from '../models/RaceHistory';
import { successResponse } from '../utils/apiResponse';

export async function getRaceHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const raceHistory = await getRaceHistoryByUserId(userId);
    res.json(successResponse({ raceHistory }));
  } catch (error) {
    next(error);
  }
}

export async function getRace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const raceId = parseInt(req.params.id);
    const race = await getRaceHistoryById(raceId, userId);

    if (!race) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }

    res.json(successResponse({ race }));
  } catch (error) {
    next(error);
  }
}

export async function createRace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const raceData = { ...req.body, user_id: userId };
    const race = await createRaceHistory(raceData);
    res.json(successResponse({ race }, 'Race added successfully'));
  } catch (error) {
    next(error);
  }
}

export async function updateRace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const raceId = parseInt(req.params.id);
    const race = await updateRaceHistory(raceId, userId, req.body);

    if (!race) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }

    res.json(successResponse({ race }, 'Race updated successfully'));
  } catch (error) {
    next(error);
  }
}

export async function deleteRace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const raceId = parseInt(req.params.id);
    const deleted = await deleteRaceHistory(raceId, userId);

    if (!deleted) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }

    res.json(successResponse({}, 'Race deleted successfully'));
  } catch (error) {
    next(error);
  }
}

export async function getPBs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const personalBests = await getPersonalBests(userId);
    res.json(successResponse({ personalBests }));
  } catch (error) {
    next(error);
  }
}
