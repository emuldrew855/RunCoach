-- Migration 016: Prepare for LangGraph Checkpoint Tables
-- Drop existing tables and let PostgresSaver.setup() create the correct schema

-- Drop all checkpoint-related tables
DROP TABLE IF EXISTS checkpoint_writes CASCADE;
DROP TABLE IF EXISTS checkpoints CASCADE;
DROP TABLE IF EXISTS checkpoint_blobs CASCADE;
DROP TABLE IF EXISTS checkpoint_migrations CASCADE;

-- Note: The actual checkpoint tables will be auto-created by PostgresSaver.setup()
-- when the agent service starts up. This ensures the schema matches the exact
-- version of @langchain/langgraph-checkpoint-postgres being used.

COMMENT ON SCHEMA public IS 'LangGraph checkpoint tables will be auto-created by PostgresSaver.setup()';
