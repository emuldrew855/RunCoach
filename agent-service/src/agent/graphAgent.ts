/**
 * RunCoach LangGraph Agent
 *
 * Proper LangGraph implementation using StateGraph, tools, and checkpointing.
 */

import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { config } from '../config/env';
import { pool } from '../config/database';
import { backendClient } from '../api/backendClient';
import { selectModelForChat } from '../config/modelSelection';
import { buildSystemPrompt } from '../config/systemPrompt';
import { classifyIntent, getIntentDescription, getExpectedContextSize, Intent } from '../utils/intentClassifier';
import { getAgentConfig, logAgentSelection } from './agentConfig';

/**
 * Define the state structure for our agent
 */
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),
  userId: Annotation<number>,
  conversationId: Annotation<string>,
  userContext: Annotation<any>,
  intent: Annotation<string>, // NEW: Track which agent type to use (run_analysis, plan_review, etc.)
  modelUsed: Annotation<string>,
  tokenUsage: Annotation<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null>,
  pendingActions: Annotation<any[]>,
  stepCount: Annotation<number>,
});

/**
 * Define LangChain tools for workout management
 */
const shiftWorkoutTool = tool(
  async ({ workoutId, newDate, reason }: { workoutId: number; newDate: string; reason?: string }) => {
    try {
      // Create pending action instead of executing directly
      const pendingAction = {
        action_type: 'shift_workout',
        action_payload: {
          workout_id: workoutId,
          new_date: newDate,
        },
        agent_reasoning: reason || `Shifting workout to ${newDate}`,
      };

      return JSON.stringify({
        success: true,
        pending: true,
        message: `Workout shift to ${newDate} suggested. Please review and approve the change.`,
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'shift_workout',
    description:
      'Suggest shifting a workout to a different date. IMPORTANT: This SUGGESTS changes - user must approve before execution. Use the workout ID from the schedule.',
    schema: z.object({
      workoutId: z.number().describe('The ID of the workout to shift'),
      newDate: z.string().describe('The new date in YYYY-MM-DD format'),
      reason: z.string().optional().describe('Explanation of why this shift is recommended'),
    }),
  }
);

const modifyWorkoutTool = tool(
  async ({
    workoutId,
    updates,
    reason,
  }: {
    workoutId: number;
    updates: {
      target_distance_meters?: number;
      target_duration_seconds?: number;
      target_pace_min?: number;
      target_pace_max?: number;
      target_pace_avg?: number;
      target_hr_zone?: number;
      target_hr_min?: number;
      target_hr_max?: number;
      workout_type?: string;
      name?: string;
      description?: string;
      coach_notes?: string;
      intervals?: any;
    };
    reason?: string;
  }) => {
    try {
      // Create pending action instead of executing directly
      const pendingAction = {
        action_type: 'modify_workout',
        action_payload: {
          workout_id: workoutId,
          updates,
        },
        agent_reasoning: reason || 'Modifying workout parameters',
      };

      return JSON.stringify({
        success: true,
        pending: true,
        message: 'Workout modification suggested. Please review and approve the change.',
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'modify_workout',
    description:
      'Suggest modifications to a planned workout. IMPORTANT: This SUGGESTS changes - user must approve before execution. Can modify distance, duration, pace (min/max/avg), HR zones, workout type, notes, and structured intervals.',
    schema: z.object({
      workoutId: z.number().describe('The ID of the workout to modify'),
      updates: z
        .object({
          target_distance_meters: z.number().nullable().optional().describe('Distance in meters'),
          target_duration_seconds: z.number().nullable().optional().describe('Duration in seconds'),
          target_pace_min: z.number().nullable().optional().describe('Fastest pace in min/km (e.g., 4.5 = 4:30/km)'),
          target_pace_max: z.number().nullable().optional().describe('Slowest pace in min/km'),
          target_pace_avg: z.number().nullable().optional().describe('Target average pace in min/km'),
          target_hr_zone: z.number().min(1).max(5).nullable().optional().describe('Heart rate zone (1-5)'),
          target_hr_min: z.number().nullable().optional().describe('Minimum heart rate (bpm)'),
          target_hr_max: z.number().nullable().optional().describe('Maximum heart rate (bpm)'),
          workout_type: z.string().nullable().optional().describe('Workout type (easy, long_run, tempo, intervals, etc.)'),
          name: z.string().nullable().optional().describe('Workout name'),
          description: z.string().nullable().optional().describe('Workout description'),
          coach_notes: z.string().nullable().optional().describe('Coach instructions for the athlete'),
          intervals: z.any().nullable().optional().describe('Structured interval workout definition (JSONB)'),
        })
        .describe('The fields to update'),
      reason: z.string().optional().describe('Explanation of why this modification is recommended'),
    }),
  }
);

const createWorkoutTool = tool(
  async ({
    scheduledDate,
    workoutType,
    name,
    targetDistanceMeters,
    targetDurationSeconds,
    targetPaceMin,
    targetPaceMax,
    targetPaceAvg,
    targetHrZone,
    targetHrMin,
    targetHrMax,
    coachNotes,
    intervals,
    reason,
  }: {
    scheduledDate: string;
    workoutType: string;
    name?: string;
    targetDistanceMeters?: number;
    targetDurationSeconds?: number;
    targetPaceMin?: number;
    targetPaceMax?: number;
    targetPaceAvg?: number;
    targetHrZone?: number;
    targetHrMin?: number;
    targetHrMax?: number;
    coachNotes?: string;
    intervals?: any;
    reason?: string;
  }) => {
    try {
      // Create pending action instead of executing directly
      const pendingAction = {
        action_type: 'create_workout',
        action_payload: {
          scheduled_date: scheduledDate,
          workout_type: workoutType,
          name,
          target_distance_meters: targetDistanceMeters,
          target_duration_seconds: targetDurationSeconds,
          target_pace_min: targetPaceMin,
          target_pace_max: targetPaceMax,
          target_pace_avg: targetPaceAvg,
          target_hr_zone: targetHrZone,
          target_hr_min: targetHrMin,
          target_hr_max: targetHrMax,
          coach_notes: coachNotes,
          intervals,
        },
        agent_reasoning: reason || `Creating new ${workoutType} workout for ${scheduledDate}`,
      };

      return JSON.stringify({
        success: true,
        pending: true,
        message: `New ${workoutType} workout for ${scheduledDate} suggested. Please review and approve.`,
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'create_workout',
    description:
      'Suggest creating a new workout in the training plan. IMPORTANT: This SUGGESTS changes - user must approve before execution. Supports full interval workouts with structured format.',
    schema: z.object({
      scheduledDate: z.string().describe('Date in YYYY-MM-DD format'),
      workoutType: z.string().describe('Type: easy, long_run, tempo, intervals, recovery, race, rest'),
      name: z.string().nullable().optional().describe('Workout name'),
      targetDistanceMeters: z.number().nullable().optional().describe('Distance in meters'),
      targetDurationSeconds: z.number().nullable().optional().describe('Duration in seconds'),
      targetPaceMin: z.number().nullable().optional().describe('Fastest pace in min/km'),
      targetPaceMax: z.number().nullable().optional().describe('Slowest pace in min/km'),
      targetPaceAvg: z.number().nullable().optional().describe('Target average pace in min/km'),
      targetHrZone: z.number().min(1).max(5).nullable().optional().describe('Heart rate zone (1-5)'),
      targetHrMin: z.number().nullable().optional().describe('Minimum heart rate (bpm)'),
      targetHrMax: z.number().nullable().optional().describe('Maximum heart rate (bpm)'),
      coachNotes: z.string().nullable().optional().describe('Coach instructions'),
      intervals: z.any().nullable().optional().describe('Structured interval workout: {warmup, mainSet, cooldown}'),
      reason: z.string().optional().describe('Explanation of why this workout is recommended'),
    }),
  }
);

const deleteWorkoutTool = tool(
  async ({ workoutId, reason }: { workoutId: number; reason?: string }) => {
    try {
      // Create pending action instead of executing directly
      const pendingAction = {
        action_type: 'delete_workout',
        action_payload: {
          workout_id: workoutId,
        },
        agent_reasoning: reason || `Deleting workout ${workoutId}`,
      };

      return JSON.stringify({
        success: true,
        pending: true,
        message: 'Workout deletion suggested. Please review and approve the change.',
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'delete_workout',
    description: 'Suggest deleting a workout from the training plan. IMPORTANT: This SUGGESTS changes - user must approve before execution.',
    schema: z.object({
      workoutId: z.number().describe('The ID of the workout to delete'),
      reason: z.string().optional().describe('Explanation of why this workout should be deleted'),
    }),
  }
);

const bulkModifyWorkoutsTool = tool(
  async ({ criteria, updates, reason }: {
    criteria: {
      workout_types?: string[];
      date_range?: { start_date: string; end_date: string };
      days_from_now?: { min?: number; max?: number };
      exclude_completed?: boolean;
      limit?: number;
    };
    updates: {
      target_distance_meters?: number;
      target_duration_seconds?: number;
      target_pace_min?: number;
      target_pace_max?: number;
      target_pace_avg?: number;
      target_hr_zone?: number;
      target_hr_min?: number;
      target_hr_max?: number;
      workout_type?: string;
      name?: string;
      description?: string;
      coach_notes?: string;
      intervals?: any;
    };
    reason: string;
  }) => {
    try {
      // Create pending action with criteria - preview will be fetched during approval
      const pendingAction = {
        action_type: 'bulk_modify_workouts',
        action_payload: {
          criteria,
          updates,
        },
        agent_reasoning: reason,
      };

      // Build a descriptive message based on criteria
      let description = 'Bulk modification suggested: ';
      if (criteria.workout_types && criteria.workout_types.length > 0) {
        description += `all ${criteria.workout_types.join(', ')} workouts`;
      } else {
        description += 'all matching workouts';
      }

      if (criteria.date_range) {
        description += ` from ${criteria.date_range.start_date} to ${criteria.date_range.end_date}`;
      } else if (criteria.days_from_now) {
        if (criteria.days_from_now.min !== undefined && criteria.days_from_now.max !== undefined) {
          description += ` in the next ${criteria.days_from_now.min}-${criteria.days_from_now.max} days`;
        } else if (criteria.days_from_now.max !== undefined) {
          description += ` in the next ${criteria.days_from_now.max} days`;
        }
      }

      description += '. Please review and approve the bulk modification.';

      return JSON.stringify({
        success: true,
        pending: true,
        message: description,
        pendingAction,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: 'bulk_modify_workouts',
    description: `Suggest modifications to multiple workouts matching specific criteria. Use when user wants to change "all X workouts" or "all workouts in Y period".

IMPORTANT: This SUGGESTS bulk changes - user must approve before execution. Only affects FUTURE/INCOMPLETE workouts.

Examples:
- "All my long runs need to be at Zone 2" → criteria: { workout_types: ['long_run'], exclude_completed: true }
- "Reduce all tempo runs in next 4 weeks" → criteria: { workout_types: ['tempo'], days_from_now: { min: 0, max: 28 } }
- "Change all easy runs to 5:30 pace" → criteria: { workout_types: ['easy'] }, updates: { target_pace_avg: 5.5 }`,

    schema: z.object({
      criteria: z.object({
        workout_types: z.array(z.string()).optional().describe('Filter by workout types (easy, long_run, tempo, intervals, recovery, race, rest)'),
        date_range: z.object({
          start_date: z.string().describe('YYYY-MM-DD format'),
          end_date: z.string().describe('YYYY-MM-DD format'),
        }).optional().describe('Absolute date range'),
        days_from_now: z.object({
          min: z.number().optional().describe('Minimum days from today'),
          max: z.number().optional().describe('Maximum days from today'),
        }).optional().describe('Relative date range from today'),
        exclude_completed: z.boolean().default(true).describe('Never modify completed workouts (always true for safety)'),
        limit: z.number().default(50).describe('Max workouts to modify (safety limit, max 100)'),
      }).describe('Criteria to match workouts'),
      updates: z.object({
        target_distance_meters: z.number().nullable().optional(),
        target_duration_seconds: z.number().nullable().optional(),
        target_pace_min: z.number().nullable().optional(),
        target_pace_max: z.number().nullable().optional(),
        target_pace_avg: z.number().nullable().optional(),
        target_hr_zone: z.number().min(1).max(5).nullable().optional(),
        target_hr_min: z.number().nullable().optional(),
        target_hr_max: z.number().nullable().optional(),
        workout_type: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        coach_notes: z.string().nullable().optional(),
        intervals: z.any().nullable().optional(),
      }).describe('Updates to apply to matched workouts'),
      reason: z.string().describe('Explain why this bulk modification is recommended'),
    }),
  }
);

const tools = [shiftWorkoutTool, modifyWorkoutTool, createWorkoutTool, deleteWorkoutTool, bulkModifyWorkoutsTool];

/**
 * Node: Build Context
 * Fetches user data and conversation history from backend
 * NOW WITH INTENT CLASSIFICATION for optimized context loading
 */
async function buildContextNode(state: typeof AgentState.State) {
  console.log('📊 Building user context...');

  try {
    // Get the latest user message for intent classification
    const userMessages = state.messages.filter(m => m._getType() === 'human');
    const latestUserMessage = userMessages[userMessages.length - 1];
    const userMessageContent = latestUserMessage?.content as string || '';

    // Classify intent to determine which context to load
    const intentResult = classifyIntent(userMessageContent);
    console.log(`🎯 Intent detected: ${intentResult.intent} (${(intentResult.confidence * 100).toFixed(0)}% confidence)`);
    console.log(`📄 ${getIntentDescription(intentResult.intent)}`);
    console.log(`💾 Expected context size: ~${getExpectedContextSize(intentResult.intent).toLocaleString()} tokens`);

    // Fetch context with intent filtering (60-87% token reduction!)
    const userContext = await backendClient.getUserContext(
      state.userId,
      intentResult.intent,
      userMessageContent
    );

    const conversationHistory = await backendClient.getConversationHistory(
      state.conversationId,
      20
    );

    // Convert conversation history to messages
    const historyMessages: BaseMessage[] = conversationHistory.map((msg: any) => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content);
      }
      return new SystemMessage(msg.content);
    });

    // Get specialized agent configuration for this intent
    const agentConfig = getAgentConfig(intentResult.intent as Intent, {
      shiftWorkoutTool,
      modifyWorkoutTool,
      createWorkoutTool,
      deleteWorkoutTool,
      bulkModifyWorkoutsTool,
    });

    // Log which agent was selected
    logAgentSelection(intentResult.intent as Intent, intentResult.confidence);

    // Build specialized system prompt using agent's prompt builder (Phase 2: Multi-Agent)
    const systemPrompt = agentConfig.promptBuilder(userContext);
    const systemMessage = new SystemMessage(systemPrompt);

    return {
      userContext,
      messages: [systemMessage, ...historyMessages],
      intent: intentResult.intent, // NEW: Store intent in state for agent router
      stepCount: state.stepCount + 1,
    };
  } catch (error: any) {
    console.error('❌ Failed to build context:', error);
    throw error;
  }
}

/**
 * Node: Agent Decision
 * Calls LLM to decide next action (respond or use tools)
 */
async function agentNode(state: typeof AgentState.State) {
  console.log('🤖 Agent making decision...');

  // Select appropriate model
  const lastUserMessage = state.messages
    .filter((m) => m._getType() === 'human')
    .slice(-1)[0]?.content?.toString() || '';

  const modelConfig = selectModelForChat(
    lastUserMessage,
    state.messages.filter((m) => m._getType() !== 'system').length
  );

  console.log(`📝 Using model: ${modelConfig.model} (${modelConfig.reason})`);

  // Get agent-specific configuration and tools based on intent (Phase 2: Multi-Agent)
  const intent = (state.intent || 'general_chat') as Intent;
  const agentConfig = getAgentConfig(intent, {
    shiftWorkoutTool,
    modifyWorkoutTool,
    createWorkoutTool,
    deleteWorkoutTool,
    bulkModifyWorkoutsTool,
  });

  console.log(`🔧 Agent tools: ${agentConfig.tools.length > 0 ? agentConfig.tools.map(t => t.name).join(', ') : 'NONE (read-only)'}`);

  // Create ChatOpenAI instance with agent-specific tools
  const modelWithTools = new ChatOpenAI({
    modelName: modelConfig.model,
    temperature: agentConfig.temperature, // Use agent-specific temperature
    streaming: true,
  });

  // Only bind tools if agent has any (read-only agents have no tools)
  const model = agentConfig.tools.length > 0
    ? modelWithTools.bindTools(agentConfig.tools)
    : modelWithTools;

  // Invoke the model
  const response = await model.invoke(state.messages);

  return {
    messages: [response],
    modelUsed: modelConfig.model,
    stepCount: state.stepCount + 1,
  };
}

/**
 * Node: Execute Tools
 * Runs the tools requested by the agent
 */
async function toolNode(state: typeof AgentState.State) {
  console.log('🔧 Executing tools...');

  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = (lastMessage as any).tool_calls || [];

  if (toolCalls.length === 0) {
    return state;
  }

  // Execute each tool
  const toolResults: BaseMessage[] = [];

  for (const toolCall of toolCalls) {
    const tool = tools.find((t) => t.name === toolCall.name);

    if (!tool) {
      console.error(`❌ Unknown tool: ${toolCall.name}`);
      continue;
    }

    try {
      console.log(`⚙️  Executing ${toolCall.name} with args:`, toolCall.args);
      const result = await tool.invoke(toolCall.args);

      // Create tool message
      toolResults.push({
        type: 'tool',
        content: result,
        tool_call_id: toolCall.id,
        name: toolCall.name,
      } as any);
    } catch (error: any) {
      console.error(`❌ Tool ${toolCall.name} failed:`, error);
      toolResults.push({
        type: 'tool',
        content: JSON.stringify({ success: false, error: error.message }),
        tool_call_id: toolCall.id,
        name: toolCall.name,
      } as any);
    }
  }

  return {
    messages: toolResults,
    stepCount: state.stepCount + 1,
  };
}

/**
 * Node: Save Response
 * Saves the final response to the backend
 */
async function saveResponseNode(state: typeof AgentState.State) {
  console.log('💾 Saving response...');

  const lastAIMessage = [...state.messages]
    .reverse()
    .find((m) => m._getType() === 'ai') as AIMessage;

  if (!lastAIMessage) {
    return state;
  }

  const responseContent = lastAIMessage.content.toString();

  // Collect pending actions from tool results
  const pendingActions: any[] = [];
  for (const message of state.messages) {
    if (message._getType() === 'tool') {
      const toolMessage = message as ToolMessage;
      try {
        const result = JSON.parse(toolMessage.content as string);
        if (result.pending && result.pendingAction) {
          pendingActions.push(result.pendingAction);
        }
      } catch (e) {
        // Not JSON or doesn't have pending action - continue
      }
    }
  }

  // Save to backend
  try {
    await backendClient.saveAssistantMessage(
      state.userId,
      state.conversationId,
      responseContent,
      state.userContext,
      undefined, // tool calls
      pendingActions.length > 0 ? pendingActions : undefined // pending actions
    );

    // Track token usage if available
    const usage = (lastAIMessage as any).usage_metadata;
    if (usage && state.modelUsed) {
      await backendClient.trackTokenUsage(
        state.userId,
        state.conversationId,
        {
          promptTokens: usage.input_tokens || 0,
          completionTokens: usage.output_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        state.modelUsed,
        'chat'
      );
    }
  } catch (error) {
    console.error('❌ Failed to save response:', error);
  }

  return {
    stepCount: state.stepCount + 1,
  };
}

/**
 * Router: Determine next step
 */
function shouldContinue(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check if last message has tool calls
  if (lastMessage._getType() === 'ai') {
    const aiMessage = lastMessage as AIMessage;
    const hasToolCalls = (aiMessage as any).tool_calls && (aiMessage as any).tool_calls.length > 0;

    if (hasToolCalls) {
      return 'tools';
    }
  }

  // Check if max steps reached
  if (state.stepCount > 10) {
    console.warn('⚠️  Max steps reached, ending workflow');
    return 'end';
  }

  return 'end';
}

/**
 * Build the LangGraph workflow
 */
function createWorkflow() {
  const workflow = new StateGraph(AgentState)
    // Add nodes
    .addNode('buildContext', buildContextNode)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('saveResponse', saveResponseNode)

    // Add edges
    .addEdge('__start__', 'buildContext')
    .addEdge('buildContext', 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      end: 'saveResponse',
    })
    .addEdge('tools', 'agent') // After tools, go back to agent
    .addEdge('saveResponse', '__end__');

  return workflow;
}

/**
 * CoachGraphAgent - LangGraph implementation
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
