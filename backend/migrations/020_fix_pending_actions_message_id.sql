-- Migration: Fix pending_actions message_id to allow NULL
-- Description: Allow message_id to be NULL since we sometimes create pending actions before message is saved
-- Idempotent: Can be run multiple times safely

-- Drop the NOT NULL constraint on message_id
ALTER TABLE pending_actions
ALTER COLUMN message_id DROP NOT NULL;

COMMENT ON COLUMN pending_actions.message_id IS 'Optional reference to the chat message that created this action (may be NULL if action created before message saved)';
