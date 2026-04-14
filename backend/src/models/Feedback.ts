/**
 * Feedback Model
 *
 * Handles database operations for user feedback submissions.
 */

import { query } from '../config/database';

export interface Feedback {
  id: number;
  user_id: number | null;
  name: string | null;
  email: string | null;
  category: 'general' | 'bug' | 'feature' | 'question' | 'other';
  subject: string | null;
  message: string;
  status: 'new' | 'read' | 'responded' | 'resolved';
  admin_notes: string | null;
  responded_at: Date | null;
  page_url: string | null;
  user_agent: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFeedbackInput {
  user_id?: number;
  name?: string;
  email?: string;
  category?: string;
  subject?: string;
  message: string;
  page_url?: string;
  user_agent?: string;
}

/**
 * Create a new feedback submission
 */
export async function createFeedback(input: CreateFeedbackInput): Promise<Feedback> {
  const result = await query(
    `INSERT INTO feedback (user_id, name, email, category, subject, message, page_url, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.user_id || null,
      input.name || null,
      input.email || null,
      input.category || 'general',
      input.subject || null,
      input.message,
      input.page_url || null,
      input.user_agent || null,
    ]
  );
  return result.rows[0];
}

/**
 * Get all feedback (for admin)
 */
export async function getAllFeedback(
  limit: number = 50,
  offset: number = 0,
  status?: string
): Promise<Feedback[]> {
  let sql = `
    SELECT f.*, u.first_name as user_first_name, u.last_name as user_last_name
    FROM feedback f
    LEFT JOIN users u ON f.user_id = u.id
  `;
  const params: any[] = [];

  if (status) {
    sql += ` WHERE f.status = $1`;
    params.push(status);
  }

  sql += ` ORDER BY f.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get feedback by ID
 */
export async function getFeedbackById(id: number): Promise<Feedback | null> {
  const result = await query(
    `SELECT f.*, u.first_name as user_first_name, u.last_name as user_last_name
     FROM feedback f
     LEFT JOIN users u ON f.user_id = u.id
     WHERE f.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update feedback status
 */
export async function updateFeedbackStatus(
  id: number,
  status: string,
  adminNotes?: string
): Promise<Feedback | null> {
  const result = await query(
    `UPDATE feedback
     SET status = $1,
         admin_notes = COALESCE($2, admin_notes),
         responded_at = CASE WHEN $1 = 'responded' THEN NOW() ELSE responded_at END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, adminNotes, id]
  );
  return result.rows[0] || null;
}

/**
 * Get feedback count by status
 */
export async function getFeedbackCounts(): Promise<{ status: string; count: number }[]> {
  const result = await query(
    `SELECT status, COUNT(*)::INTEGER as count
     FROM feedback
     GROUP BY status
     ORDER BY status`
  );
  return result.rows;
}

/**
 * Get count of new/unread feedback
 */
export async function getNewFeedbackCount(): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::INTEGER as count FROM feedback WHERE status = 'new'`
  );
  return result.rows[0]?.count || 0;
}
