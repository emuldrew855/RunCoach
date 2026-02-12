/**
 * Express API Server for Agent Service
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import axios from 'axios';
import { CoachGraphAgent } from '../agent/graphAgent';
import { config } from '../config/env';
import { pool } from '../config/database';
import { ChatRequest } from '../types';

const app = express();

// Initialize the LangGraph agent (singleton with checkpointing)
// Note: initialize() must be called before using this agent
export const agent = new CoachGraphAgent();

// Middleware
app.use(cors());
app.use(express.json());

// Service-to-Service Auth Middleware
function requireServiceAuth(req: Request, res: Response, next: NextFunction) {
  const serviceToken = req.headers['x-service-token'];

  if (serviceToken !== config.serviceSecret) {
    return res.status(401).json({ error: 'Unauthorized - Invalid service token' });
  }

  next();
}

// Helper function to trigger conversation processing (Phase 2: RAG)
async function triggerConversationProcessing(userId: number, conversationId: string): Promise<void> {
  try {
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
    await axios.post(
      `${backendUrl}/api/v1/agent/process-conversation`,
      { userId, conversationId },
      {
        headers: { 'X-Service-Token': config.serviceSecret },
        timeout: 5000, // Short timeout - fire and forget
      }
    );
    console.log(`✓ Triggered conversation processing for ${conversationId}`);
  } catch (error: any) {
    // Log error but don't fail - this is non-critical background processing
    console.error('Failed to trigger conversation processing:', error.message);
  }
}

// Health check with database status
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');

    res.json({
      status: 'healthy',
      service: 'runcoach-agent-service',
      version: '1.0.0',
      checkpoint: 'postgresql',
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'runcoach-agent-service',
      version: '1.0.0',
      checkpoint: 'postgresql',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /agent/chat
 * Main chat endpoint with streaming
 */
app.post('/agent/chat', requireServiceAuth, async (req: Request, res: Response) => {
  try {
    const { userId, conversationId, message }: ChatRequest = req.body;

    if (!userId || !conversationId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Process request with LangGraph agent
    const generator = await agent.process({ userId, conversationId, userMessage: message });

    // Stream responses
    for await (const event of generator) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

    // Trigger conversation processing for long-term memory (Phase 2: RAG)
    // Fire-and-forget - don't wait for response
    triggerConversationProcessing(userId, conversationId);
  } catch (error: any) {
    console.error('Agent chat error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * GET /agent/state/:conversationId
 * Get the current state of a conversation (checkpointing)
 * Requires userId in query params for security
 */
app.get('/agent/state/:conversationId', requireServiceAuth, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = parseInt(req.query.userId as string);

    if (!userId) {
      return res.status(400).json({ error: 'userId query parameter is required' });
    }

    const state = await agent.getState(conversationId, userId);
    res.json({ conversationId, userId, state });
  } catch (error: any) {
    console.error('Get state error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default app;
