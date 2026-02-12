/**
 * Embedding Service
 *
 * Handles creation and management of vector embeddings for long-term semantic memory.
 * Uses OpenAI's text-embedding-3-small model (1536 dimensions).
 */

import { openai } from '../config/openai';
import pool from '../config/database';

/**
 * Generate embedding for a given text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * Returns a value between -1 and 1, where 1 means identical
 *
 * NOTE: This function is deprecated after pgvector migration (migration 021).
 * Use database-native similarity search with the <=> operator instead.
 * Kept for backward compatibility only.
 */
export function cosineSimilarity(embeddingA: number[], embeddingB: number[]): number {
  if (embeddingA.length !== embeddingB.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < embeddingA.length; i++) {
    dotProduct += embeddingA[i] * embeddingB[i];
    magnitudeA += embeddingA[i] * embeddingA[i];
    magnitudeB += embeddingB[i] * embeddingB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Store conversation message embedding
 */
export async function storeConversationEmbedding(
  userId: number,
  conversationId: string,
  messageId: number,
  content: string,
  metadata: any = {}
): Promise<void> {
  try {
    const embedding = await generateEmbedding(content);

    // After pgvector migration (021), pass array directly - PostgreSQL handles conversion
    await pool.query(
      `INSERT INTO conversation_embeddings
       (user_id, conversation_id, message_id, content, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5::vector, $6)`,
      [userId, conversationId, messageId, content, JSON.stringify(embedding), metadata]
    );

    console.log(`✓ Stored embedding for message ${messageId} in conversation ${conversationId}`);
  } catch (error) {
    console.error('Error storing conversation embedding:', error);
    throw error;
  }
}

/**
 * Store workout insight embedding
 */
export async function storeWorkoutInsight(
  userId: number,
  insightText: string,
  insightType: 'pattern' | 'preference' | 'concern' | 'success',
  metadata: any = {}
): Promise<void> {
  try {
    const embedding = await generateEmbedding(insightText);

    // After pgvector migration (021), pass array directly - PostgreSQL handles conversion
    await pool.query(
      `INSERT INTO workout_insights
       (user_id, insight_text, insight_type, embedding, metadata)
       VALUES ($1, $2, $3, $4::vector, $5)`,
      [userId, insightText, insightType, JSON.stringify(embedding), metadata]
    );

    console.log(`✓ Stored ${insightType} insight for user ${userId}`);
  } catch (error) {
    console.error('Error storing workout insight:', error);
    throw error;
  }
}

/**
 * Find similar conversation embeddings for a user
 * Returns top N most similar conversations based on cosine similarity
 *
 * Uses pgvector's native similarity search with HNSW index (after migration 021)
 * The <=> operator computes cosine distance (0 = identical, 2 = opposite)
 * We convert to similarity with: similarity = 1 - distance
 */
export async function findSimilarConversations(
  userId: number,
  queryText: string,
  limit: number = 5
): Promise<Array<{ content: string; similarity: number; metadata: any; created_at: Date }>> {
  try {
    const queryEmbedding = await generateEmbedding(queryText);

    // Use pgvector's <=> operator for database-native cosine distance
    // This is 10x+ faster than in-memory calculation and uses the HNSW index
    const result = await pool.query(
      `SELECT content, metadata, created_at,
              1 - (embedding <=> $1::vector) as similarity
       FROM conversation_embeddings
       WHERE user_id = $2
       ORDER BY embedding <=> $1::vector ASC
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), userId, limit]
    );

    return result.rows.map((row) => ({
      content: row.content,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata,
      created_at: row.created_at,
    }));
  } catch (error) {
    console.error('Error finding similar conversations:', error);
    throw error;
  }
}

/**
 * Find similar workout insights
 *
 * Uses pgvector's native similarity search with HNSW index (after migration 021)
 */
export async function findSimilarInsights(
  userId: number,
  queryText: string,
  insightType?: string,
  limit: number = 5
): Promise<Array<{ insight_text: string; similarity: number; insight_type: string; metadata: any }>> {
  try {
    const queryEmbedding = await generateEmbedding(queryText);

    // Use pgvector's <=> operator for database-native cosine distance
    const query = insightType
      ? `SELECT insight_text, insight_type, metadata,
                1 - (embedding <=> $1::vector) as similarity
         FROM workout_insights
         WHERE user_id = $2 AND insight_type = $3
         ORDER BY embedding <=> $1::vector ASC
         LIMIT $4`
      : `SELECT insight_text, insight_type, metadata,
                1 - (embedding <=> $1::vector) as similarity
         FROM workout_insights
         WHERE user_id = $2
         ORDER BY embedding <=> $1::vector ASC
         LIMIT $3`;

    const params = insightType
      ? [JSON.stringify(queryEmbedding), userId, insightType, limit]
      : [JSON.stringify(queryEmbedding), userId, limit];

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      insight_text: row.insight_text,
      similarity: parseFloat(row.similarity),
      insight_type: row.insight_type,
      metadata: row.metadata,
    }));
  } catch (error) {
    console.error('Error finding similar insights:', error);
    throw error;
  }
}
