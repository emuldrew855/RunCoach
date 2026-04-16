/**
 * Backend API Client
 *
 * Communicates with main backend service to fetch context and execute tools.
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';
import { UserContextData, Message } from '../types';

class BackendClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.backendApiUrl,
      headers: {
        'X-Service-Token': config.backendServiceToken,
        'X-Agent-Service': 'true',
      },
      timeout: 30000, // 30 seconds
    });
  }

  /**
   * Fetch user context for agent (with optional intent for context filtering)
   */
  async getUserContext(userId: number, intent?: string, userMessage?: string): Promise<UserContextData> {
    try {
      const params: any = {};
      if (intent) params.intent = intent;
      if (userMessage) params.message = userMessage;

      const response = await this.client.get(`/api/v1/agent/context/${userId}`, { params });
      return response.data.data.context;
    } catch (error: any) {
      console.error('Failed to fetch user context:', error.message);
      throw new Error(`Failed to fetch user context: ${error.message}`);
    }
  }

  // ============================================
  // TIERED CONTEXT METHODS (for multi-agent architecture)
  // ============================================

  /**
   * Fetch CORE context (~1k tokens)
   * Contains: Basic profile, goal, training phase
   */
  async getCoreContext(userId: number): Promise<any> {
    try {
      const response = await this.client.get(`/api/v1/agent/context/${userId}/core`);
      return response.data.data.context;
    } catch (error: any) {
      console.error('Failed to fetch core context:', error.message);
      throw new Error(`Failed to fetch core context: ${error.message}`);
    }
  }

  /**
   * Fetch ACTIVE context (~3k tokens)
   * Contains: This week's data, last 2 runs, current adherence
   */
  async getActiveContext(userId: number): Promise<any> {
    try {
      const response = await this.client.get(`/api/v1/agent/context/${userId}/active`);
      return response.data.data.context;
    } catch (error: any) {
      console.error('Failed to fetch active context:', error.message);
      throw new Error(`Failed to fetch active context: ${error.message}`);
    }
  }

  /**
   * Fetch DEEP context (~15k tokens)
   * Contains: 30-day history, 4-week plan, HR distribution, trends
   */
  async getDeepContext(userId: number): Promise<any> {
    try {
      const response = await this.client.get(`/api/v1/agent/context/${userId}/deep`);
      return response.data.data.context;
    } catch (error: any) {
      console.error('Failed to fetch deep context:', error.message);
      throw new Error(`Failed to fetch deep context: ${error.message}`);
    }
  }

  // ============================================
  // JIT DATA METHODS (for worker tools)
  // ============================================

  /**
   * Fetch just the most recent activity (~500 tokens)
   */
  async getLastActivity(userId: number): Promise<any> {
    try {
      const response = await this.client.get(`/api/v1/agent/data/last-activity/${userId}`);
      return response.data.data.activity;
    } catch (error: any) {
      console.error('Failed to fetch last activity:', error.message);
      return null;
    }
  }

  /**
   * Fetch recent activities for N days (~300 tokens per activity)
   */
  async getRecentActivities(userId: number, days: number = 7): Promise<any[]> {
    try {
      const response = await this.client.get(
        `/api/v1/agent/data/recent-activities/${userId}?days=${days}`
      );
      return response.data.data.activities || [];
    } catch (error: any) {
      console.error('Failed to fetch recent activities:', error.message);
      return [];
    }
  }

  /**
   * Fetch upcoming workouts for N days (~500 tokens for 7 days)
   */
  async getUpcomingWorkouts(userId: number, days: number = 7): Promise<any[]> {
    try {
      const response = await this.client.get(
        `/api/v1/agent/data/upcoming-workouts/${userId}?days=${days}`
      );
      return response.data.data.workouts || [];
    } catch (error: any) {
      console.error('Failed to fetch upcoming workouts:', error.message);
      return [];
    }
  }

  /**
   * Fetch HR zone summary for N days (~400 tokens)
   */
  async getHRZoneSummary(userId: number, days: number = 30): Promise<any> {
    try {
      const response = await this.client.get(
        `/api/v1/agent/data/hr-zones/${userId}?days=${days}`
      );
      return response.data.data.hrZones;
    } catch (error: any) {
      console.error('Failed to fetch HR zone summary:', error.message);
      return null;
    }
  }

  /**
   * Fetch conversation history
   */
  async getConversationHistory(conversationId: string, limit: number = 20): Promise<Message[]> {
    try {
      const response = await this.client.get(
        `/api/v1/agent/conversation/${conversationId}?limit=${limit}`
      );
      return response.data.data.messages || [];
    } catch (error: any) {
      console.error('Failed to fetch conversation history:', error.message);
      return [];
    }
  }

  /**
   * Execute tool: Shift Workout
   */
  async shiftWorkout(workoutId: number, newDate: string): Promise<any> {
    try {
      const response = await this.client.post('/api/v1/agent/workout/shift', {
        workoutId,
        newDate,
      });
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to shift workout:', error.message);
      throw error;
    }
  }

  /**
   * Execute tool: Modify Workout
   */
  async modifyWorkout(workoutId: number, updates: any): Promise<any> {
    try {
      const response = await this.client.post('/api/v1/agent/workout/modify', {
        workoutId,
        updates,
      });
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to modify workout:', error.message);
      throw error;
    }
  }

  /**
   * Execute tool: Create Workout
   */
  async createWorkout(userId: number, workoutData: any): Promise<any> {
    try {
      const response = await this.client.post('/api/v1/agent/workout/create', {
        userId,
        workout: workoutData,
      });
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to create workout:', error.message);
      throw error;
    }
  }

  /**
   * Execute tool: Delete Workout
   */
  async deleteWorkout(workoutId: number): Promise<any> {
    try {
      const response = await this.client.post('/api/v1/agent/workout/delete', {
        workoutId,
      });
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to delete workout:', error.message);
      throw error;
    }
  }

  /**
   * Preview bulk workout modification
   */
  async bulkModifyWorkoutsPreview(userId: number, criteria: any, updates: any): Promise<any> {
    try {
      const response = await this.client.post('/api/v1/agent/workout/bulk-modify-preview', {
        userId,
        criteria,
        updates,
      });
      return response.data.data.preview;
    } catch (error: any) {
      console.error('Failed to preview bulk modification:', error.message);
      throw error;
    }
  }

  /**
   * Track token usage (report back to backend)
   */
  async trackTokenUsage(
    userId: number,
    conversationId: string,
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    },
    model: string,
    requestType: string
  ): Promise<void> {
    try {
      await this.client.post('/api/v1/agent/token-usage', {
        userId,
        conversationId,
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        model,
        requestType,
      });
    } catch (error: any) {
      console.error('Failed to track token usage:', error.message);
      // Don't throw - token tracking failure shouldn't break the flow
    }
  }

  /**
   * Track agent usage with extended analytics (report back to backend)
   * Includes intent, architecture, response time, context tokens, and tool usage
   */
  async trackAgentUsage(
    userId: number,
    conversationId: string,
    data: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      model: string;
      requestType: string;
      intent?: string;
      intentConfidence?: number;
      architecture?: 'two_pass' | 'single_pass';
      responseTimeMs?: number;
      contextTokens?: number;
      toolCallsCount?: number;
      toolsUsed?: string[];
    }
  ): Promise<void> {
    try {
      await this.client.post('/api/v1/agent/token-usage', {
        userId,
        conversationId,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
        model: data.model,
        requestType: data.requestType,
        // Extended agent analytics fields
        intent: data.intent,
        intentConfidence: data.intentConfidence,
        architecture: data.architecture,
        responseTimeMs: data.responseTimeMs,
        contextTokens: data.contextTokens,
        toolCallsCount: data.toolCallsCount,
        toolsUsed: data.toolsUsed,
      });
      console.log(`📊 Agent analytics tracked: intent=${data.intent}, arch=${data.architecture}, responseTime=${data.responseTimeMs}ms, contextTokens=${data.contextTokens}`);
    } catch (error: any) {
      console.error('Failed to track agent usage:', error.message);
      // Don't throw - analytics tracking failure shouldn't break the flow
    }
  }

  /**
   * Create a pending action
   */
  async createPendingAction(
    userId: number,
    conversationId: string,
    messageId: number,
    actionType: string,
    actionPayload: any,
    agentReasoning: string
  ): Promise<string> {
    try {
      const response = await this.client.post('/api/v1/agent/actions/create', {
        user_id: userId,
        conversation_id: conversationId,
        message_id: messageId,
        action_type: actionType,
        action_payload: actionPayload,
        agent_reasoning: agentReasoning,
      });
      return response.data.data.action.id;
    } catch (error: any) {
      console.error('Failed to create pending action:', error.message);
      throw error;
    }
  }

  /**
   * Save assistant message to backend
   */
  async saveAssistantMessage(
    userId: number,
    conversationId: string,
    content: string,
    contextSnapshot: any,
    toolCalls?: any[],
    pendingActions?: any[]
  ): Promise<void> {
    try {
      // First save the message without pending actions to get message ID
      const response = await this.client.post('/api/v1/agent/save-message', {
        userId,
        conversationId,
        role: 'assistant',
        content,
        contextSnapshot,
        toolCalls,
        pendingActionIds: undefined,
      });

      const message = response.data.data.message;

      // If we have pending actions, create them with the message ID
      if (pendingActions && pendingActions.length > 0 && message.id) {
        const actionIds: string[] = [];

        for (const action of pendingActions) {
          try {
            const actionId = await this.createPendingAction(
              userId,
              conversationId,
              message.id,
              action.action_type,
              action.action_payload,
              action.agent_reasoning
            );
            actionIds.push(actionId);
          } catch (error) {
            console.error('Failed to create pending action:', error);
            // Continue with other actions even if one fails
          }
        }

        // Update the message with pending action IDs if we created any
        if (actionIds.length > 0) {
          await this.client.post('/api/v1/agent/update-message-actions', {
            messageId: message.id,
            pendingActionIds: actionIds,
          });
        }
      }
    } catch (error: any) {
      console.error('Failed to save assistant message:', error.message);
    }
  }
}

export const backendClient = new BackendClient();
