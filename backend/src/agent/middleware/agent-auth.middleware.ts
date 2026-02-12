/**
 * Agent Authorization Middleware
 *
 * Verifies that users can only access and modify their own resources.
 * Prevents users from approving/rejecting other users' pending actions.
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../../config/database';

/**
 * Service-to-Service Authentication
 * Verify X-Service-Token header for agent service requests
 */
export function requireServiceAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const serviceToken = req.headers['x-service-token'];
  const expectedToken = process.env.SERVICE_SECRET || 'your-service-secret-change-in-production';

  if (serviceToken !== expectedToken) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid service token',
    });
    return;
  }

  next();
}

/**
 * Verify that a pending action belongs to the authenticated user
 * Use this before approve/reject endpoints
 */
export async function verifyActionOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const actionId = req.params.actionId;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    if (!actionId) {
      res.status(400).json({ error: 'Bad Request: Action ID is required' });
      return;
    }

    // Query pending action
    const result = await query(
      'SELECT user_id FROM pending_actions WHERE id = $1',
      [actionId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }

    const action = result.rows[0];

    // Verify ownership
    if (action.user_id !== userId) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to modify this action',
      });
      return;
    }

    // Ownership verified, proceed
    next();
  } catch (error) {
    console.error('Authorization middleware error:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

/**
 * Verify that a conversation belongs to the authenticated user
 * Use this before chat-related endpoints
 */
export async function verifyConversationOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const conversationId = req.params.conversationId || req.body.conversationId;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    if (!conversationId) {
      res.status(400).json({ error: 'Bad Request: Conversation ID is required' });
      return;
    }

    // Query conversation
    const result = await query(
      'SELECT user_id FROM conversations WHERE id = $1',
      [conversationId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const conversation = result.rows[0];

    // Verify ownership
    if (conversation.user_id !== userId) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to access this conversation',
      });
      return;
    }

    // Ownership verified, proceed
    next();
  } catch (error) {
    console.error('Authorization middleware error:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}
