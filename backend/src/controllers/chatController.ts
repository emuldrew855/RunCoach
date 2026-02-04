import { Request, Response } from 'express';
import { getConversationsByUserId, createConversation, getMessagesByConversationId, updateConversationTitle, deleteConversation } from '../models/Chat';
import { streamAgentChatCompletion, saveAssistantMessage, processToolCall } from '../services/agentChatService';
import { buildUserContext } from '../utils/contextBuilder';

export async function getConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const conversations = await getConversationsByUserId(userId);
    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
}

export async function createConversationController(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { title } = req.body;
    const conversation = await createConversation(userId, title);
    res.json({ conversation });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
}

export async function getConversationHistory(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    const messages = await getMessagesByConversationId(conversationId);
    res.json({ messages });
  } catch (error) {
    console.error('Get conversation history error:', error);
    res.status(500).json({ error: 'Failed to get conversation history' });
  }
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { conversationId, message } = req.body;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get user context for saving with assistant message
    const userContext = await buildUserContext(userId);

    // Stream from agent
    const { stream, messageId } = await streamAgentChatCompletion(userId, conversationId, message);

    let fullResponse = '';
    let toolCalls: any[] = [];
    let pendingActions: string[] = [];
    let currentToolCall: any = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Handle content streaming
      if (delta?.content) {
        fullResponse += delta.content;
        res.write(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`);
      }

      // Handle tool calls
      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.index !== undefined) {
            // Initialize or get existing tool call
            if (!toolCalls[toolCall.index]) {
              toolCalls[toolCall.index] = {
                id: toolCall.id || '',
                type: 'function',
                function: {
                  name: toolCall.function?.name || '',
                  arguments: '',
                },
              };
            }

            currentToolCall = toolCalls[toolCall.index];

            // Append to function name
            if (toolCall.function?.name) {
              currentToolCall.function.name = toolCall.function.name;
            }

            // Append to function arguments
            if (toolCall.function?.arguments) {
              currentToolCall.function.arguments += toolCall.function.arguments;
            }
          }
        }
      }

      // Check if streaming is done for this chunk
      if (chunk.choices[0]?.finish_reason === 'tool_calls') {
        // Process all tool calls
        for (const toolCall of toolCalls) {
          if (toolCall && toolCall.function.name) {
            const toolName = toolCall.function.name;
            let toolArgs;

            try {
              toolArgs = JSON.parse(toolCall.function.arguments);
            } catch (e) {
              console.error('Failed to parse tool arguments:', toolCall.function.arguments);
              continue;
            }

            // Process tool call
            const result = await processToolCall(toolName, toolArgs, userId, conversationId, messageId);

            if (result.requiresApproval && result.actionId) {
              // Send pending action as SSE event
              pendingActions.push(result.actionId);

              const actionEvent = {
                type: 'pending_action',
                action_id: result.actionId,
                action_type: toolName,
                action_payload: toolArgs,
                description: getActionDescription(toolName, toolArgs),
              };

              res.write(`data: ${JSON.stringify(actionEvent)}\n\n`);
            } else if (result.result) {
              // Tool executed immediately - could send result back
              // For now, agent will incorporate this in next response
              console.log(`Tool ${toolName} executed:`, result.result);
            }
          }
        }
      }
    }

    // Save assistant message to database with tool calls and pending actions
    await saveAssistantMessage(
      userId,
      conversationId,
      fullResponse,
      userContext,
      toolCalls.length > 0 ? toolCalls : undefined,
      pendingActions.length > 0 ? pendingActions : undefined
    );

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Send message error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to generate response' })}\n\n`);
    res.end();
  }
}

/**
 * Generate human-readable description for pending action
 */
function getActionDescription(toolName: string, payload: any): string {
  switch (toolName) {
    case 'shift_workout':
      return `Shift workout to ${payload.new_date}`;
    case 'modify_workout':
      const changes = [];
      if (payload.updates.target_distance_meters) {
        changes.push(`distance to ${(payload.updates.target_distance_meters / 1000).toFixed(1)}km`);
      }
      if (payload.updates.target_pace_avg) {
        changes.push(`pace to ${formatPace(payload.updates.target_pace_avg)}/km`);
      }
      if (payload.updates.target_hr_zone) {
        changes.push(`HR zone to ${payload.updates.target_hr_zone}`);
      }
      return `Modify workout: ${changes.join(', ') || 'update parameters'}`;
    case 'create_workout':
      return `Add ${payload.workout_type} workout on ${payload.scheduled_date}`;
    case 'delete_workout':
      return `Remove workout`;
    default:
      return `${toolName} action`;
  }
}

/**
 * Format pace for display
 */
function formatPace(pace: number): string {
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export async function updateConversation(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    const { title } = req.body;
    const conversation = await updateConversationTitle(conversationId, title);
    res.json({ conversation });
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
}

export async function deleteConversationController(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    await deleteConversation(conversationId);
    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
}
