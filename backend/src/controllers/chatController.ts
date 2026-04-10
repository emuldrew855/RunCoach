import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { getConversationsByUserId, createConversation, getMessagesByConversationId, updateConversationTitle, deleteConversation, createMessage } from '../models/Chat';
import { successResponse } from '../utils/apiResponse';

// Agent service configuration
const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:3002';
const SERVICE_SECRET = process.env.SERVICE_SECRET || '';

export async function getConversations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const conversations = await getConversationsByUserId(userId);
    res.json(successResponse({ conversations }));
  } catch (error) {
    next(error);
  }
}

export async function createConversationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { title } = req.body;
    const conversation = await createConversation(userId, title);
    res.json(successResponse({ conversation }, 'Conversation created successfully'));
  } catch (error) {
    next(error);
  }
}

export async function getConversationHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { conversationId } = req.params;
    const messages = await getMessagesByConversationId(conversationId);
    res.json(successResponse({ messages }));
  } catch (error) {
    next(error);
  }
}

/**
 * Send message - proxy to agent service with streaming
 */
export async function sendMessage(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { conversationId, message } = req.body;

    console.log(`📨 Proxying chat request to agent service (user ${userId})`);

    // Validate conversation exists and belongs to user
    const { query } = await import('../config/database');
    const convCheck = await query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (convCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Conversation not found or does not belong to user',
      });
      return;
    }

    // Save user message to database BEFORE proxying to agent
    await createMessage({
      user_id: userId,
      conversation_id: conversationId,
      role: 'user',
      content: message,
      context_snapshot: null,
      model_used: undefined,
      tool_calls: null,
      pending_actions: [],
      is_agent_initiated: false,
    });

    // Forward request to agent service
    const agentResponse = await axios.post(
      `${AGENT_SERVICE_URL}/agent/chat`,
      {
        userId,
        conversationId,
        message,
      },
      {
        headers: {
          'X-Service-Token': SERVICE_SECRET,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: 120000, // 2 minutes
      }
    );

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Pipe agent service response directly to client
    agentResponse.data.pipe(res);

    // Handle errors
    agentResponse.data.on('error', (error: any) => {
      console.error('Agent service stream error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream error' })}\n\n`);
      res.end();
    });
  } catch (error: any) {
    console.error('Agent service connection error:', error.message);

    // Set SSE headers if not already set
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }

    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        error: 'Agent service unavailable. Please try again.'
      })}\n\n`
    );
    res.end();
  }
}

export async function updateConversation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { conversationId } = req.params;
    const { title } = req.body;
    const conversation = await updateConversationTitle(conversationId, title);
    res.json(successResponse({ conversation }, 'Conversation updated successfully'));
  } catch (error) {
    next(error);
  }
}

export async function deleteConversationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { conversationId } = req.params;
    await deleteConversation(conversationId);
    res.json(successResponse({}, 'Conversation deleted successfully'));
  } catch (error) {
    next(error);
  }
}
