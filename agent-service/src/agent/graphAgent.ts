/**
 * RunCoach LangGraph Agent
 *
 * Main entry point for the LangGraph-based coaching agent.
 * This file orchestrates the workflow execution and manages checkpointing.
 *
 * Architecture:
 * - tools/workoutTools.ts: All 6 workout management tools
 * - nodes/buildContextNode.ts: Context building and intent classification
 * - nodes/agentNode.ts: LLM decision-making
 * - nodes/toolExecutionNode.ts: Tool execution and response saving
 * - workflow/graphSetup.ts: Graph structure and routing logic
 */

import { HumanMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { pool } from '../config/database';
import { createWorkflow } from './workflow/graphSetup';

/**
 * CoachGraphAgent - LangGraph implementation
 * Manages the workflow execution with PostgreSQL checkpointing
 */
export class CoachGraphAgent {
  private checkpointer: PostgresSaver;
  private graph: any;
  private initialized: boolean = false;

  constructor() {
    // Initialize PostgresSaver with connection pool
    this.checkpointer = new PostgresSaver(pool);
    const workflow = createWorkflow();
    this.graph = workflow.compile({ checkpointer: this.checkpointer });
  }

  /**
   * Initialize the checkpoint saver
   * Must be called once before using the agent
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      try {
        // First check if tables already exist
        const result = await pool.query(`
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename LIKE 'checkpoint%'
          ORDER BY tablename
        `);
        const tables = result.rows.map(r => r.tablename);

        // Only call setup if tables don't exist
        if (tables.length === 0) {
          console.log('🔧 Setting up PostgreSQL checkpoint tables...');
          await this.checkpointer.setup();
          console.log('✓ PostgreSQL checkpoint tables created');
        } else {
          console.log('✓ PostgreSQL checkpoint tables already exist');
        }

        this.initialized = true;
        console.log(`✓ Checkpoint tables verified: ${tables.join(', ') || 'creating...'}`);
      } catch (error: any) {
        // If setup fails due to duplicate key (tables already exist), that's OK
        if (error.code === '23505') {
          console.log('✓ Checkpoint tables already initialized (ignoring duplicate key error)');
          this.initialized = true;
          return;
        }

        console.error('❌ Failed to initialize checkpoint saver:', error);
        console.error('💡 Tip: The agent service needs PostgreSQL checkpoint tables.');
        console.error('   Run: cd agent-service && npx ts-node src/scripts/setup-checkpoints.ts');
        throw error;
      }
    }
  }

  /**
   * Process a user message through the LangGraph workflow
   */
  async *process(input: {
    userId: number;
    conversationId: string;
    userMessage: string;
  }): AsyncGenerator<any, void, unknown> {
    console.log('🚀 Starting LangGraph workflow...');
    console.log(`👤 User: ${input.userId}, Conversation: ${input.conversationId}`);

    const initialState = {
      messages: [new HumanMessage(input.userMessage)],
      userId: input.userId,
      conversationId: input.conversationId,
      userContext: null,
      modelUsed: '',
      tokenUsage: null,
      pendingActions: [],
      stepCount: 0,
    };

    try {
      // Stream the graph execution
      const config = {
        configurable: {
          thread_id: input.conversationId,
          // Add userId to checkpoint metadata for user isolation
          user_id: input.userId,
        },
      };

      // Execute the graph with streaming
      const stream = await this.graph.stream(initialState, {
        ...config,
        streamMode: 'values',
      });

      let lastState: any = null;
      let lastMessageCount = 0; // Track how many messages we've already yielded

      for await (const state of stream) {
        lastState = state;

        // Extract and yield only NEW messages
        const messages = state.messages || [];
        const currentMessageCount = messages.length;

        // Only yield if we have new messages
        if (currentMessageCount > lastMessageCount) {
          const newMessages = messages.slice(lastMessageCount);

          // Yield only AI messages from the new batch
          for (const message of newMessages) {
            if (message._getType() === 'ai') {
              const content = message.content;
              if (content) {
                yield {
                  type: 'content',
                  content: content.toString(),
                };
              }
            }
          }

          lastMessageCount = currentMessageCount;
        }

        // Yield status updates
        yield {
          type: 'status',
          stepCount: state.stepCount || 0,
          currentNode: 'processing',
        };
      }

      // Final completion message
      if (lastState) {
        yield {
          type: 'complete',
          modelUsed: lastState.modelUsed,
          tokenUsage: lastState.tokenUsage,
          stepCount: lastState.stepCount,
        };
      }

      console.log('✅ LangGraph workflow completed');
    } catch (error: any) {
      console.error('❌ LangGraph workflow error:', error);
      yield {
        type: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Get the current state of a conversation (for checkpointing)
   * Includes user validation for security
   */
  async getState(conversationId: string, userId: number) {
    const config = {
      configurable: {
        thread_id: conversationId,
        user_id: userId, // User validation
      },
    };

    const state = await this.graph.getState(config);

    // Verify checkpoint ownership for security
    if (state && state.values && state.values.userId !== userId) {
      throw new Error('Unauthorized: Checkpoint does not belong to this user');
    }

    return state;
  }

  /**
   * Resume from a checkpoint
   */
  async *resume(conversationId: string, userId: number, input: any): AsyncGenerator<any, void, unknown> {
    const config = {
      configurable: {
        thread_id: conversationId,
        user_id: userId, // User validation
      },
    };

    const stream = await this.graph.stream(input, {
      ...config,
      streamMode: 'values',
    });

    for await (const state of stream) {
      yield state;
    }
  }
}
