-- Migration 016: Create LangGraph Checkpoint Tables
-- These tables are required by @langchain/langgraph-checkpoint-postgres
-- Creating them via migration ensures they exist before the agent service starts

-- Preserve existing checkpoint data, extra columns, and saver schema versions.

-- Checkpoints table - stores conversation state snapshots
CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,
  checkpoint JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON checkpoints(thread_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_parent ON checkpoints(parent_checkpoint_id);

-- Checkpoint writes table - stores pending writes for a checkpoint
CREATE TABLE IF NOT EXISTS checkpoint_writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  blob BYTEA,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_writes_thread ON checkpoint_writes(thread_id);

-- Checkpoint blobs table - stores large binary data
CREATE TABLE IF NOT EXISTS checkpoint_blobs (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL,
  blob BYTEA,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_blobs_thread ON checkpoint_blobs(thread_id);

-- Checkpoint migrations table - tracks schema version
CREATE TABLE IF NOT EXISTS checkpoint_migrations (
  v INTEGER PRIMARY KEY
);

-- Insert initial migration version
INSERT INTO checkpoint_migrations (v) VALUES (1) ON CONFLICT (v) DO NOTHING;

COMMENT ON TABLE checkpoints IS 'LangGraph conversation state checkpoints';
COMMENT ON TABLE checkpoint_writes IS 'LangGraph pending checkpoint writes';
COMMENT ON TABLE checkpoint_blobs IS 'LangGraph binary blob storage';
COMMENT ON TABLE checkpoint_migrations IS 'LangGraph checkpoint schema version tracking';
