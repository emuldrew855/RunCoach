import { openai, openaiConfig } from '../config/openai';
import { getMessagesByConversationId, createMessage } from '../models/Chat';
import { buildUserContext, buildSystemPrompt } from '../utils/contextBuilder';

export async function streamChatCompletion(
  userId: number,
  conversationId: string,
  userMessage: string
): Promise<AsyncIterable<any>> {
  // Build user context
  const userContext = await buildUserContext(userId);
  const systemPrompt = buildSystemPrompt(userContext);

  // Get conversation history
  const history = await getMessagesByConversationId(conversationId, 20);

  // Build messages array
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  // Save user message
  await createMessage({
    user_id: userId,
    conversation_id: conversationId,
    role: 'user',
    content: userMessage,
    context_snapshot: userContext,
    model_used: openaiConfig.model,
  });

  // Stream from OpenAI
  const stream = await openai.chat.completions.create({
    model: openaiConfig.model,
    messages,
    stream: true,
    max_tokens: openaiConfig.maxTokens,
    temperature: 0.7,
  });

  return stream;
}

export async function saveAssistantMessage(
  userId: number,
  conversationId: string,
  content: string,
  contextSnapshot: any
): Promise<void> {
  await createMessage({
    user_id: userId,
    conversation_id: conversationId,
    role: 'assistant',
    content,
    context_snapshot: contextSnapshot,
    model_used: openaiConfig.model,
  });
}
