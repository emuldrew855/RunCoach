/**
 * Backfill Script: Process Existing Conversations for Long-Term Memory
 *
 * This script processes all existing conversations to:
 * 1. Generate summaries with key insights
 * 2. Extract patterns, preferences, and concerns
 * 3. Create vector embeddings for semantic search
 *
 * Usage:
 *   npm run backfill:conversations
 *   or
 *   ts-node src/scripts/backfillConversationEmbeddings.ts
 */

import pool from '../config/database';
import { processConversation } from '../services/conversationSummarizationService';

interface ConversationRow {
  id: string;
  user_id: number;
  message_count: number;
}

async function backfillConversations() {
  try {
    console.log('🧠 Starting conversation embeddings backfill...\n');

    // Fetch all conversations with at least 2 messages
    const result = await pool.query<ConversationRow>(
      `SELECT
        c.id,
        c.user_id,
        COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN chat_messages m ON c.id = m.conversation_id
       GROUP BY c.id, c.user_id
       HAVING COUNT(m.id) >= 2
       ORDER BY c.created_at DESC`
    );

    const conversations = result.rows;
    console.log(`📊 Found ${conversations.length} conversations to process\n`);

    if (conversations.length === 0) {
      console.log('✓ No conversations to process');
      return;
    }

    // Process each conversation
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const conversation of conversations) {
      try {
        console.log(
          `Processing conversation ${conversation.id} (user ${conversation.user_id}, ${conversation.message_count} messages)...`
        );

        // Check if already processed
        const existingResult = await pool.query(
          'SELECT id FROM conversation_summaries WHERE conversation_id = $1',
          [conversation.id]
        );

        if (existingResult.rows.length > 0) {
          console.log(`  ⏭️  Skipped (already processed)\n`);
          skipped++;
          continue;
        }

        // Process conversation
        await processConversation(conversation.user_id, conversation.id);

        console.log(`  ✓ Processed successfully\n`);
        processed++;

        // Add small delay to avoid overwhelming OpenAI API
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`  ✗ Failed: ${error.message}\n`);
        failed++;
      }
    }

    // Summary
    console.log('\n📊 Backfill Complete!');
    console.log(`  ✓ Processed: ${processed}`);
    console.log(`  ⏭️  Skipped: ${skipped}`);
    console.log(`  ✗ Failed: ${failed}`);
    console.log(`  📈 Total: ${conversations.length}`);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    throw error;
  } finally {
    // Close database connection
    await pool.end();
  }
}

// Run backfill
backfillConversations()
  .then(() => {
    console.log('\n✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
