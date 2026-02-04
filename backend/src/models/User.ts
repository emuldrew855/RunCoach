import { query } from '../config/database';
import { User } from '../types/models';

export async function getUserById(id: number): Promise<User | null> {
  const result = await query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getUserByStravaId(stravaId: number): Promise<User | null> {
  const result = await query(
    'SELECT * FROM users WHERE strava_id = $1',
    [stravaId]
  );
  return result.rows[0] || null;
}

export async function createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at' | 'last_login_at'>): Promise<User> {
  const result = await query(
    `INSERT INTO users (strava_id, email, first_name, last_name, profile_picture_url, access_token, refresh_token, token_expires_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [
      user.strava_id,
      user.email,
      user.first_name,
      user.last_name,
      user.profile_picture_url,
      user.access_token,
      user.refresh_token,
      user.token_expires_at,
    ]
  );
  return result.rows[0];
}

export async function updateUser(id: number, updates: Partial<User>): Promise<User> {
  const fields = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function upsertUser(user: Omit<User, 'id' | 'created_at' | 'updated_at' | 'last_login_at'>): Promise<User> {
  const result = await query(
    `INSERT INTO users (strava_id, email, first_name, last_name, profile_picture_url, access_token, refresh_token, token_expires_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (strava_id)
     DO UPDATE SET
       email = EXCLUDED.email,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       profile_picture_url = EXCLUDED.profile_picture_url,
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_expires_at = EXCLUDED.token_expires_at,
       last_login_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      user.strava_id,
      user.email,
      user.first_name,
      user.last_name,
      user.profile_picture_url,
      user.access_token,
      user.refresh_token,
      user.token_expires_at,
    ]
  );
  return result.rows[0];
}
