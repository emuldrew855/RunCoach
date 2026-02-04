-- Migration: Create Agent System Tables
-- Description: Add tables for agentic coach system including pending actions, action history, scheduled analyses, and notifications
-- Idempotent: Can be run multiple times safely

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: pending_actions
-- Stores agent-suggested modifications awaiting user approval
CREATE TABLE IF NOT EXISTS pending_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,

    action_type VARCHAR(50) NOT NULL, -- 'shift_workout', 'modify_workout', 'create_workout', 'delete_workout'
    action_payload JSONB NOT NULL, -- Tool call parameters
    agent_reasoning TEXT, -- Why agent suggested this

    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'executed', 'failed'

    approved_at TIMESTAMP,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,

    executed_at TIMESTAMP,
    execution_result JSONB,
    error_message TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_user_status ON pending_actions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_conversation ON pending_actions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_message ON pending_actions(message_id);

-- Table: action_history
-- Audit trail of all executed actions for rollback and analysis
CREATE TABLE IF NOT EXISTS action_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    action_payload JSONB NOT NULL,
    original_state JSONB, -- For potential rollback

    status VARCHAR(20) NOT NULL, -- 'success', 'failed'
    result JSONB,
    error_message TEXT,

    initiated_by VARCHAR(20) NOT NULL, -- 'agent', 'user', 'system'
    agent_conversation_id UUID REFERENCES conversations(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_action_history_user ON action_history(user_id);
CREATE INDEX IF NOT EXISTS idx_action_history_type ON action_history(action_type);
CREATE INDEX IF NOT EXISTS idx_action_history_created ON action_history(created_at);

-- Table: scheduled_analyses
-- Configuration for automated weekly analyses
CREATE TABLE IF NOT EXISTS scheduled_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    schedule_type VARCHAR(20) NOT NULL, -- 'weekly_monday', 'custom'
    schedule_cron VARCHAR(50), -- Cron expression (e.g., '0 6 * * 1' for Monday 6 AM)

    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,

    analysis_config JSONB, -- Configuration for what to analyze
    notification_method VARCHAR(20) DEFAULT 'in_app', -- 'in_app', 'email', 'both'
    is_enabled BOOLEAN DEFAULT true,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_analyses_user ON scheduled_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_analyses_next_run ON scheduled_analyses(next_run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_analyses_enabled ON scheduled_analyses(is_enabled);

-- Table: notifications
-- Simple in-app notification system for Monday analyses and action results
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'weekly_analysis', 'action_executed', 'action_failed', 'general'
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link VARCHAR(255), -- Link to conversation or relevant page
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Enhance chat_messages table with tool calling metadata
-- Check if columns don't exist before adding them
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='chat_messages' AND column_name='tool_calls') THEN
        ALTER TABLE chat_messages ADD COLUMN tool_calls JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='chat_messages' AND column_name='tool_results') THEN
        ALTER TABLE chat_messages ADD COLUMN tool_results JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='chat_messages' AND column_name='pending_actions') THEN
        ALTER TABLE chat_messages ADD COLUMN pending_actions UUID[] DEFAULT ARRAY[]::UUID[];
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='chat_messages' AND column_name='is_agent_initiated') THEN
        ALTER TABLE chat_messages ADD COLUMN is_agent_initiated BOOLEAN DEFAULT false;
    END IF;
END $$;

COMMENT ON COLUMN chat_messages.tool_calls IS 'Array of tool calls made by the agent in this message';
COMMENT ON COLUMN chat_messages.tool_results IS 'Results returned from tool executions';
COMMENT ON COLUMN chat_messages.pending_actions IS 'Array of pending action IDs associated with this message';
COMMENT ON COLUMN chat_messages.is_agent_initiated IS 'True if this message was initiated by scheduled analysis, not user';
