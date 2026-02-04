import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { query } from '../config/database';

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const payload = verifyToken(token);

    // Fetch user from database with profile
    const result = await query(
      `SELECT
        u.*,
        json_build_object(
          'id', up.id,
          'user_id', up.user_id,
          'age', up.age,
          'weight_kg', up.weight_kg,
          'height_cm', up.height_cm,
          'gender', up.gender,
          'running_experience_years', up.running_experience_years,
          'typical_weekly_mileage', up.typical_weekly_mileage,
          'injury_history', up.injury_history,
          'preferred_units', up.preferred_units,
          'week_starts_on', up.week_starts_on,
          'timezone', up.timezone,
          'training_block_start', up.training_block_start,
          'training_block_end', up.training_block_end
        ) as profile
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id = $1`,
      [payload.userId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
