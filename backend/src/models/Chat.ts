import { query } from '../config/database';
import { Conversation, ChatMessage } from '../types/models';

export async function getConversationsByUserId(userId: number): Promise<Conversation[]> {
  const result = await query(
    `SELECT DISTINCT ON (c.id) c.*
     FROM conversations c
     WHERE c.user_id = $1
       AND EXISTS (
         SELECT 1 FROM chat_messages m
         WHERE m.conversation_id = c.id
       )
     ORDER BY c.id DESC, c.last_message_at DESC NULLS LAST, c.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function createConversation(userId: number, title?: string): Promise<Conversation> {
  const result = await query(
    'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
    [userId, title]
  );
  return result.rows[0];
}

export async function getMessagesByConversationId(conversationId: string, limit: number = 50): Promise<ChatMessage[]> {
  const result = await query(
    `SELECT * FROM chat_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows;
}

export async function createMessage(message: Omit<ChatMessage, 'id' | 'created_at'>): Promise<ChatMessage> {
  const messageData = message as any;

  const result = await query(
    `INSERT INTO chat_messages (
      user_id, conversation_id, role, content, context_snapshot, model_used,
      tool_calls, pending_actions, is_agent_initiated
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      messageData.user_id,
      messageData.conversation_id,
      messageData.role,
      messageData.content,
      messageData.context_snapshot,
      messageData.model_used,
      messageData.tool_calls ? JSON.stringify(messageData.tool_calls) : null,
      messageData.pending_actions || [],
      messageData.is_agent_initiated || false,
    ]
  );

  // Update conversation last_message_at
  await query(
    'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
    [messageData.conversation_id]
  );

  return result.rows[0];
}

export async function updateConversationTitle(conversationId: string, title: string): Promise<Conversation> {
  const result = await query(
    'UPDATE conversations SET title = $1 WHERE id = $2 RETURNING *',
    [title, conversationId]
  );
  return result.rows[0];
}

export async function updateMessagePendingActions(messageId: number, pendingActionIds: string[]): Promise<ChatMessage> {
  const result = await query(
    'UPDATE chat_messages SET pending_actions = $1 WHERE id = $2 RETURNING *',
    [pendingActionIds, messageId]
  );
  return result.rows[0];
}

export async function deleteConversation(conversationId: string): Promise<void> {
  // Delete all messages first (foreign key constraint)
  await query('DELETE FROM chat_messages WHERE conversation_id = $1', [conversationId]);
  // Delete conversation
  await query('DELETE FROM conversations WHERE id = $1', [conversationId]);
}
