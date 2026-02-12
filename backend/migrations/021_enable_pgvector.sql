-- Migration 021: Enable pgvector Extension and Migrate to Native Vector Type
--
-- This migration converts the existing JSONB-based embedding storage to native
-- pgvector format with HNSW indexes for fast similarity search.
--
-- Benefits:
-- - 10x+ faster similarity search (database-native vs in-memory)
-- - Scales to millions of embeddings
-- - Lower memory usage (no need to load embeddings into application)
-- - HNSW indexes provide logarithmic search time
--
-- Note: Requires pgvector extension (already included in pgvector/pgvector:pg15 Docker image)

-- Step 1: Enable pgvector extension
-- Note: This requires superuser privileges. If already created manually, this will be skipped.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN insufficient_privilege THEN
  -- Extension already exists or was created manually by superuser
  RAISE NOTICE 'pgvector extension already exists or was created by superuser';
END $$;

-- Step 2: Add new vector columns to existing tables
-- Using vector(1536) to match OpenAI's text-embedding-3-small dimensions

ALTER TABLE conversation_embeddings
  ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

ALTER TABLE workout_insights
  ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

ALTER TABLE activity_patterns
  ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

-- Step 3: Migrate existing JSONB data to vector format
-- The embedding column stores JSON arrays like '[0.1, 0.2, ...]'
-- We convert these to native vector type

-- Migrate conversation_embeddings
UPDATE conversation_embeddings
SET embedding_vector = embedding::text::vector
WHERE embedding IS NOT NULL AND embedding_vector IS NULL;

-- Migrate workout_insights
UPDATE workout_insights
SET embedding_vector = embedding::text::vector
WHERE embedding IS NOT NULL AND embedding_vector IS NULL;

-- Migrate activity_patterns
UPDATE activity_patterns
SET embedding_vector = embedding::text::vector
WHERE embedding IS NOT NULL AND embedding_vector IS NULL;

-- Step 4: Drop old JSONB columns and rename vector columns
-- This is a breaking change, so ensure all code is updated to use the new format

ALTER TABLE conversation_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE conversation_embeddings RENAME COLUMN embedding_vector TO embedding;

ALTER TABLE workout_insights DROP COLUMN IF EXISTS embedding;
ALTER TABLE workout_insights RENAME COLUMN embedding_vector TO embedding;

ALTER TABLE activity_patterns DROP COLUMN IF EXISTS embedding;
ALTER TABLE activity_patterns RENAME COLUMN embedding_vector TO embedding;

-- Step 5: Create HNSW indexes for fast similarity search
-- Using balanced parameters for medium-scale datasets (100k-1M embeddings)
--
-- Parameters:
--   m = 32: Max connections per layer (higher = better recall, more memory)
--   ef_construction = 128: Size of dynamic candidate list (higher = better index quality, slower build)
--
-- Operator class: vector_cosine_ops (cosine distance, recommended for embeddings)
-- Alternatives: vector_l2_ops (L2 distance), vector_ip_ops (inner product)

CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_embedding_hnsw
ON conversation_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 128);

CREATE INDEX IF NOT EXISTS idx_workout_insights_embedding_hnsw
ON workout_insights USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 128);

CREATE INDEX IF NOT EXISTS idx_activity_patterns_embedding_hnsw
ON activity_patterns USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 128);

-- Step 6: Update table comments
COMMENT ON COLUMN conversation_embeddings.embedding IS 'OpenAI text-embedding-3-small (1536 dimensions) in native pgvector format';
COMMENT ON COLUMN workout_insights.embedding IS 'OpenAI text-embedding-3-small (1536 dimensions) in native pgvector format';
COMMENT ON COLUMN activity_patterns.embedding IS 'OpenAI text-embedding-3-small (1536 dimensions) in native pgvector format';

-- Verification queries (uncomment to test):
-- SELECT id, array_length(embedding, 1) as dimensions FROM conversation_embeddings LIMIT 5;
-- Expected output: dimensions = 1536 for all rows

-- Performance test (replace with actual embedding):
-- EXPLAIN ANALYZE
-- SELECT content, 1 - (embedding <=> '[0.1, 0.2, ...]'::vector) as similarity
-- FROM conversation_embeddings
-- WHERE user_id = 1
-- ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector ASC
-- LIMIT 5;
-- Should use HNSW index and complete in <50ms
