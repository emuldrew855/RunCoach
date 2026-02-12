/**
 * Conversation Summarization Service
 *
 * Extracts key insights, patterns, and preferences from coaching conversations.
 * This builds long-term semantic memory by identifying what the coach should remember.
 */

import { openai } from '../config/openai';
import pool from '../config/database';
import { storeConversationEmbedding, storeWorkoutInsight } from './embeddingService';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
}

interface ConversationSummary {
  summaryText: string;
  keyInsights: string[];
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'concerned';
  patterns?: string[];
  preferences?: string[];
  concerns?: string[];
}

/**
 * Summarize a conversation and extract key insights
 * Uses GPT-4 to identify what a marathon coach should remember about this conversation
 */
export async function summarizeConversation(
  _userId: number,
  _conversationId: string,
  messages: ConversationMessage[]
): Promise<ConversationSummary> {
  try {
    // Build conversation text
    const conversationText = messages
      .map((msg) => `${msg.role === 'user' ? 'Athlete' : 'Coach'}: ${msg.content}`)
      .join('\n\n');

    const summaryPrompt = `You are analyzing a conversation between a marathon coach and an athlete.
Extract the following information:

1. A brief summary (2-3 sentences) of what was discussed
2. Key insights the coach should remember (list of specific, actionable insights)
3. Topics discussed (tags like: tempo_pace, recovery, race_strategy, injury, motivation, etc.)
4. Overall sentiment (positive, neutral, or concerned)
5. Any patterns mentioned (e.g., "athlete struggles with tempo on Thursdays")
6. Any preferences stated (e.g., "prefers morning runs")
7. Any concerns raised (e.g., "experiencing knee pain")

Conversation:
${conversationText}

Respond in JSON format:
{
  "summary": "...",
  "key_insights": ["insight1", "insight2", ...],
  "topics": ["topic1", "topic2", ...],
  "sentiment": "positive|neutral|concerned",
  "patterns": ["pattern1", "pattern2", ...],
  "preferences": ["preference1", "preference2", ...],
  "concerns": ["concern1", "concern2", ...]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for cost efficiency on summarization
      messages: [{ role: 'user', content: summaryPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent extraction
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    return {
      summaryText: result.summary || '',
      keyInsights: result.key_insights || [],
      topics: result.topics || [],
      sentiment: result.sentiment || 'neutral',
      patterns: result.patterns || [],
      preferences: result.preferences || [],
      concerns: result.concerns || [],
    };
  } catch (error) {
    console.error('Error summarizing conversation:', error);
    throw error;
  }
}

/**
 * Store conversation summary in database
 */
export async function storeConversationSummary(
  userId: number,
  conversationId: string,
  summary: ConversationSummary
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO conversation_summaries
       (user_id, conversation_id, summary_text, key_insights, topics, sentiment)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (conversation_id) DO UPDATE SET
         summary_text = EXCLUDED.summary_text,
         key_insights = EXCLUDED.key_insights,
         topics = EXCLUDED.topics,
         sentiment = EXCLUDED.sentiment`,
      [userId, conversationId, summary.summaryText, summary.keyInsights, summary.topics, summary.sentiment]
    );

    console.log(`✓ Stored summary for conversation ${conversationId}`);
  } catch (error) {
    console.error('Error storing conversation summary:', error);
    throw error;
  }
}

/**
 * Extract and store workout insights from conversation summary
 * Converts patterns, preferences, and concerns into searchable insights
 */
export async function extractAndStoreInsights(
  userId: number,
  summary: ConversationSummary
): Promise<void> {
  try {
    // Store patterns
    if (summary.patterns) {
      for (const pattern of summary.patterns) {
        await storeWorkoutInsight(userId, pattern, 'pattern', {
          source: 'conversation',
          extracted_at: new Date(),
        });
      }
    }

    // Store preferences
    if (summary.preferences) {
      for (const preference of summary.preferences) {
        await storeWorkoutInsight(userId, preference, 'preference', {
          source: 'conversation',
          extracted_at: new Date(),
        });
      }
    }

    // Store concerns
    if (summary.concerns) {
      for (const concern of summary.concerns) {
        await storeWorkoutInsight(userId, concern, 'concern', {
          source: 'conversation',
          extracted_at: new Date(),
        });
      }
    }

    console.log(`✓ Extracted and stored insights for user ${userId}`);
  } catch (error) {
    console.error('Error extracting and storing insights:', error);
    throw error;
  }
}

/**
 * Process conversation after it ends
 * Summarizes, extracts insights, and creates embeddings
 */
export async function processConversation(
  userId: number,
  conversationId: string
): Promise<void> {
  try {
    console.log(`🧠 Processing conversation ${conversationId} for long-term memory...`);

    // Fetch conversation messages
    const messagesResult = await pool.query(
      `SELECT id, role, content, created_at
       FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    if (messagesResult.rows.length === 0) {
      console.log('No messages found for conversation');
      return;
    }

    const messages: ConversationMessage[] = messagesResult.rows.map((row) => ({
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    }));

    // Step 1: Summarize conversation
    const summary = await summarizeConversation(userId, conversationId, messages);

    // Step 2: Store summary
    await storeConversationSummary(userId, conversationId, summary);

    // Step 3: Extract and store insights as searchable embeddings
    await extractAndStoreInsights(userId, summary);

    // Step 4: Create embeddings for important assistant messages
    // Focus on coach's advice and explanations (skip simple acknowledgments)
    const importantMessages = messagesResult.rows.filter(
      (row) => row.role === 'assistant' && row.content.length > 100
    );

    for (const message of importantMessages) {
      await storeConversationEmbedding(
        userId,
        conversationId,
        message.id,
        message.content,
        {
          topics: summary.topics,
          sentiment: summary.sentiment,
          date: message.created_at,
        }
      );
    }

    console.log(`✓ Conversation ${conversationId} processed successfully`);
    console.log(`  - Summary created with ${summary.keyInsights.length} key insights`);
    console.log(`  - Topics: ${summary.topics.join(', ')}`);
    console.log(`  - Sentiment: ${summary.sentiment}`);
  } catch (error) {
    console.error('Error processing conversation:', error);
    throw error;
  }
}
