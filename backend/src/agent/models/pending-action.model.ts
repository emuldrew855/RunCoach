/**
 * Pending Action Model
 *
 * Manages pending actions that require user approval before execution.
 * Includes operations for creating, approving, rejecting, and executing actions.
 */

import { query } from '../../config/database';

export interface PendingAction {
  id: string;
  user_id: number;
  conversation_id: string;
  message_id: number;
  action_type: string;
  action_payload: any;
  agent_reasoning: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  approved_at?: Date;
  rejected_at?: Date;
  rejection_reason?: string;
  executed_at?: Date;
  execution_result?: any;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create a new pending action
 */
export async function createPendingAction(
  action: Omit<PendingAction, 'id' | 'created_at' | 'updated_at' | 'status'>
): Promise<PendingAction> {
  const result = await query(
    `INSERT INTO pending_actions (
      user_id, conversation_id, message_id, action_type, action_payload, agent_reasoning
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      action.user_id,
      action.conversation_id,
      action.message_id || null,
      action.action_type,
      JSON.stringify(action.action_payload),
      action.agent_reasoning || null,
    ]
  );
  return result.rows[0];
}

/**
 * Get pending action by ID
 */
export async function getPendingActionById(id: string): Promise<PendingAction | null> {
  const result = await query(
    'SELECT * FROM pending_actions WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get all pending actions for a user
 */
export async function getPendingActionsByUser(
  userId: number,
  status?: string
): Promise<PendingAction[]> {
  let sql = 'SELECT * FROM pending_actions WHERE user_id = $1';
  const params: any[] = [userId];

  if (status) {
    sql += ' AND status = $2';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get pending actions for a conversation
 */
export async function getPendingActionsByConversation(
  conversationId: string
): Promise<PendingAction[]> {
  const result = await query(
    'SELECT * FROM pending_actions WHERE conversation_id = $1 ORDER BY created_at DESC',
    [conversationId]
  );
  return result.rows;
}

/**
 * Approve a pending action
 */
export async function approvePendingAction(
  actionId: string,
  userId: number
): Promise<PendingAction | null> {
  const result = await query(
    `UPDATE pending_actions
     SET status = 'approved', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [actionId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Reject a pending action
 */
export async function rejectPendingAction(
  actionId: string,
  userId: number,
  reason?: string
): Promise<PendingAction | null> {
  const result = await query(
    `UPDATE pending_actions
     SET status = 'rejected',
         rejected_at = CURRENT_TIMESTAMP,
         rejection_reason = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [actionId, userId, reason]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Mark action as executed with result
 */
export async function markActionExecuted(
  actionId: string,
  executionResult: any
): Promise<PendingAction | null> {
  const result = await query(
    `UPDATE pending_actions
     SET status = 'executed',
         executed_at = CURRENT_TIMESTAMP,
         execution_result = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'approved'
     RETURNING *`,
    [actionId, JSON.stringify(executionResult)]
  );

  return result.rows[0] || null;
}

/**
 * Mark action as failed with error
 */
export async function markActionFailed(
  actionId: string,
  errorMessage: string
): Promise<PendingAction | null> {
  const result = await query(
    `UPDATE pending_actions
     SET status = 'failed',
         error_message = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'approved'
     RETURNING *`,
    [actionId, errorMessage]
  );

  return result.rows[0] || null;
}

/**
 * Count pending actions for a user
 */
export async function countPendingActions(userId: number): Promise<number> {
  const result = await query(
    'SELECT COUNT(*) as count FROM pending_actions WHERE user_id = $1 AND status = $2',
    [userId, 'pending']
  );
  return parseInt(result.rows[0].count);
}

/**
 * Delete old pending actions (cleanup)
 */
export async function deleteOldPendingActions(daysOld: number = 30): Promise<number> {
  const result = await query(
    `DELETE FROM pending_actions
     WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
     AND status IN ('rejected', 'executed', 'failed')`,
    []
  );
  return result.rowCount || 0;
}
