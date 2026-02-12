-- Migration 017: Create Vector Embeddings for Long-Term Semantic Memory (Phase 2)
-- This enables RAG-based retrieval of historical patterns, insights, and coaching moments
--
-- NOTE: This version uses JSONB for embeddings instead of the vector type
-- It's compatible with standard PostgreSQL without requiring pgvector extension
-- Similarity search will be done in application code for now

-- Conversation embeddings: Coach advice + user questions for finding similar coaching moments
CREATE TABLE IF NOT EXISTS conversation_embeddings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  message_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding JSONB, -- Stored as JSON array [0.1, 0.2, ...] instead of vector type
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_user_id ON conversation_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_conversation_id ON conversation_embeddings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_created_at ON conversation_embeddings(created_at DESC);

-- Workout insights: Key patterns and reflections from training
CREATE TABLE IF NOT EXISTS workout_insights (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id INTEGER REFERENCES planned_workouts(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  insight_text TEXT NOT NULL,
  insight_type TEXT NOT NULL, -- 'pattern', 'preference', 'concern', 'success'
  embedding JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workout_insights_user_id ON workout_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_insights_type ON workout_insights(insight_type);

-- Activity patterns: Performance summaries for pattern recognition
CREATE TABLE IF NOT EXISTS activity_patterns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern_text TEXT NOT NULL,
  pattern_category TEXT NOT NULL, -- 'pacing', 'hr_behavior', 'recovery', 'performance'
  occurrence_count INTEGER DEFAULT 1,
  embedding JSONB,
  metadata JSONB DEFAULT '{}',
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_patterns_user_id ON activity_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_patterns_category ON activity_patterns(pattern_category);

-- Conversation summaries: Key insights extracted after each conversation
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  key_insights TEXT[], -- Array of key insights from the conversation
  topics TEXT[], -- Topics discussed (e.g., 'tempo_pace', 'recovery', 'race_strategy')
  sentiment TEXT, -- 'positive', 'neutral', 'concerned'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_user_id ON conversation_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_created_at ON conversation_summaries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_topics ON conversation_summaries USING GIN (topics);

-- Comments for documentation
COMMENT ON TABLE conversation_embeddings IS 'Vector embeddings of conversation messages for semantic search (JSONB format)';
COMMENT ON TABLE workout_insights IS 'Key insights and patterns extracted from workouts and activities';
COMMENT ON TABLE activity_patterns IS 'Recurring performance patterns identified across activities';
COMMENT ON TABLE conversation_summaries IS 'High-level summaries of coaching conversations';

COMMENT ON COLUMN conversation_embeddings.embedding IS 'OpenAI text-embedding-3-small (1536 dimensions) stored as JSONB array';
COMMENT ON COLUMN conversation_embeddings.metadata IS 'Additional context: workout_type, training_phase, date, etc.';
COMMENT ON COLUMN workout_insights.insight_type IS 'pattern: recurring behavior, preference: stated preference, concern: issue raised, success: achievement noted';
COMMENT ON COLUMN activity_patterns.pattern_category IS 'pacing: pacing behavior, hr_behavior: heart rate patterns, recovery: recovery observations, performance: performance trends';

-- Note: For production use with large datasets, consider:
-- 1. Installing pgvector extension for native vector similarity search
-- 2. Converting embedding column from JSONB to vector(1536) type
-- 3. Adding HNSW index: CREATE INDEX ON conversation_embeddings USING hnsw (embedding vector_cosine_ops);
