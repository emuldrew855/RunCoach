/**
 * RunCoach LangGraph Agent
 *
 * Main entry point for the LangGraph-based coaching agent.
 * This file orchestrates the workflow execution and manages checkpointing.
 *
 * ARCHITECTURES:
 * 1. Legacy (monolithic): Single graph with full context loading
 *    - workflow/graphSetup.ts
 *
 * 2. Supervisor (multi-agent): Orchestrator-Worker pattern with JIT context
 *    - workflow/supervisorGraphSetup.ts
 *    - router/llmRouter.ts
 *    - nodes/workers/*.ts
 *
 * Toggle via USE_SUPERVISOR_ARCHITECTURE environment variable
 */

import { HumanMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { pool } from '../config/database';
import { createWorkflow } from './workflow/graphSetup';
import { createSupervisorWorkflow } from './workflow/supervisorGraphSetup';
import { createInitialSupervisorState } from './workflow/supervisorState';

// Feature flag for supervisor architecture
const USE_SUPERVISOR_ARCHITECTURE = process.env.USE_SUPERVISOR_ARCHITECTURE === 'true';

/**
 * CoachGraphAgent - LangGraph implementation
 * Manages the workflow execution with PostgreSQL checkpointing
 *
 * Supports two architectures:
 * 1. Legacy: Monolithic context, regex-based intent classification
 * 2. Supervisor: Multi-agent, JIT context, LLM-based routing
 */
export class CoachGraphAgent {
  private checkpointer: PostgresSaver;
  private graph: any;
  private supervisorGraph: any;
  private initialized: boolean = false;
  private useSupervisor: boolean;

  constructor() {
    // Initialize PostgresSaver with connection pool
    this.checkpointer = new PostgresSaver(pool);
    this.useSupervisor = USE_SUPERVISOR_ARCHITECTURE;

    // Create the appropriate workflow(s)
    const legacyWorkflow = createWorkflow();
    this.graph = legacyWorkflow.compile({ checkpointer: this.checkpointer });

    if (this.useSupervisor) {
      console.log('🚀 Using SUPERVISOR (multi-agent) architecture');
      const supervisorWorkflow = createSupervisorWorkflow();
      this.supervisorGraph = supervisorWorkflow.compile({ checkpointer: this.checkpointer });
    } else {
      console.log('📦 Using LEGACY (monolithic) architecture');
    }
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
        const requiredTables = ['checkpoints', 'checkpoint_writes', 'checkpoint_blobs', 'checkpoint_migrations'];
        const missingTables = requiredTables.filter(t => !tables.includes(t));

        if (missingTables.length > 0) {
          console.log(`🔧 Missing checkpoint tables: ${missingTables.join(', ')}`);
          console.log('🔧 Setting up PostgreSQL checkpoint tables...');

          try {
            // Try using PostgresSaver.setup() first
            await this.checkpointer.setup();
            console.log('✓ PostgreSQL checkpoint tables created via PostgresSaver');
          } catch (setupError: any) {
            console.warn(`⚠️ PostgresSaver.setup() failed: ${setupError.message}`);
            console.log('🔧 Attempting manual table creation...');

            // Fallback: Create tables manually via SQL
            await this.createCheckpointTablesManually();
            console.log('✓ PostgreSQL checkpoint tables created via manual SQL');
          }
        } else {
          console.log('✓ PostgreSQL checkpoint tables already exist');
        }

        // Verify tables were created
        const verifyResult = await pool.query(`
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename IN ('checkpoints', 'checkpoint_writes', 'checkpoint_blobs', 'checkpoint_migrations')
        `);
        const verifiedTables = verifyResult.rows.map(r => r.tablename);

        if (verifiedTables.length < 4) {
          throw new Error(`Failed to create all checkpoint tables. Found: ${verifiedTables.join(', ')}`);
        }

        this.initialized = true;
        console.log(`✓ Checkpoint tables verified: ${verifiedTables.join(', ')}`);
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
   * Manually create checkpoint tables via SQL
   * Fallback if PostgresSaver.setup() fails
   */
  private async createCheckpointTablesManually(): Promise<void> {
    // These are the standard LangGraph checkpoint tables
    const createTablesSql = `
      -- Checkpoints table
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      );

      -- Checkpoint writes table
      CREATE TABLE IF NOT EXISTS checkpoint_writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        blob BYTEA,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      );

      -- Checkpoint blobs table
      CREATE TABLE IF NOT EXISTS checkpoint_blobs (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL,
        version TEXT NOT NULL,
        type TEXT NOT NULL,
        blob BYTEA,
        PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
      );

      -- Checkpoint migrations table
      CREATE TABLE IF NOT EXISTS checkpoint_migrations (
        v INTEGER PRIMARY KEY
      );

      -- Insert migration version if not exists
      INSERT INTO checkpoint_migrations (v) VALUES (1) ON CONFLICT (v) DO NOTHING;
    `;

    await pool.query(createTablesSql);
  }

  /**
   * Process a user message through the LangGraph workflow
   * Supports both legacy (monolithic) and supervisor (multi-agent) architectures
   */
  async *process(input: {
    userId: number;
    conversationId: string;
    userMessage: string;
  }): AsyncGenerator<any, void, unknown> {
    const architecture = this.useSupervisor ? 'SUPERVISOR' : 'LEGACY';
    console.log(`🚀 Starting LangGraph workflow (${architecture})...`);
    console.log(`👤 User: ${input.userId}, Conversation: ${input.conversationId}`);

    // Select appropriate graph and initial state based on architecture
    const graph = this.useSupervisor ? this.supervisorGraph : this.graph;
    const initialState = this.useSupervisor
      ? createInitialSupervisorState(input.userId, input.conversationId, input.userMessage)
      : {
          messages: [new HumanMessage(input.userMessage)],
          userId: input.userId,
          conversationId: input.conversationId,
          userContext: null,
          modelUsed: '',
          tokenUsage: null,
          pendingActions: [],
          stepCount: 0,
          // Agent analytics tracking
          startTime: Date.now(),
          intentConfidence: 0,
          architecture: 'single_pass' as const, // Will be updated in buildContextNode
          contextTokens: 0,
          toolsUsed: [],
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
      const stream = await graph.stream(initialState, {
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

        // Yield status updates (include routing info for supervisor architecture)
        const statusUpdate: any = {
          type: 'status',
          stepCount: state.stepCount || 0,
          currentNode: state.currentWorker || 'processing',
        };

        // Add supervisor-specific metadata
        if (this.useSupervisor && state.routingDecision) {
          statusUpdate.routingDecision = state.routingDecision;
          statusUpdate.activeWorkers = state.activeWorkers;
        }

        yield statusUpdate;
      }

      // Final completion message
      if (lastState) {
        const completionMessage: any = {
          type: 'complete',
          modelUsed: lastState.modelUsed,
          tokenUsage: lastState.tokenUsage,
          stepCount: lastState.stepCount,
        };

        // Add supervisor-specific completion info
        if (this.useSupervisor) {
          completionMessage.architecture = 'supervisor';
          completionMessage.workersUsed = lastState.workerOutputs?.map((w: any) => w.worker) || [];
          completionMessage.pendingActions = lastState.pendingActions || [];
        }

        yield completionMessage;
      }

      console.log(`✅ LangGraph workflow completed (${architecture})`);
    } catch (error: any) {
      console.error(`❌ LangGraph workflow error (${architecture}):`, error);
      yield {
        type: 'error',
        error: error.message,
        architecture,
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

    // Use appropriate graph based on architecture
    const graph = this.useSupervisor ? this.supervisorGraph : this.graph;
    const state = await graph.getState(config);

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

    // Use appropriate graph based on architecture
    const graph = this.useSupervisor ? this.supervisorGraph : this.graph;
    const stream = await graph.stream(input, {
      ...config,
      streamMode: 'values',
    });

    for await (const state of stream) {
      yield state;
    }
  }

  /**
   * Check which architecture is currently in use
   */
  getArchitecture(): 'supervisor' | 'legacy' {
    return this.useSupervisor ? 'supervisor' : 'legacy';
  }
}
