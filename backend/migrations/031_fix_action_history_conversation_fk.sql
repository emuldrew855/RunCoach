-- Migration: Fix action_history conversation foreign key
-- Description: Add ON DELETE SET NULL to action_history.agent_conversation_id
-- This allows conversations to be deleted even if they have action history records

-- Drop the existing foreign key constraint and recreate with ON DELETE SET NULL
DO $$
BEGIN
    -- Check if the constraint exists before dropping
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'action_history_agent_conversation_id_fkey'
        AND table_name = 'action_history'
    ) THEN
        ALTER TABLE action_history
        DROP CONSTRAINT action_history_agent_conversation_id_fkey;
    END IF;

    -- Re-add the constraint with ON DELETE SET NULL
    ALTER TABLE action_history
    ADD CONSTRAINT action_history_agent_conversation_id_fkey
    FOREIGN KEY (agent_conversation_id)
    REFERENCES conversations(id)
    ON DELETE SET NULL;

    RAISE NOTICE 'Fixed action_history.agent_conversation_id foreign key constraint';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Error updating constraint: %', SQLERRM;
END $$;
