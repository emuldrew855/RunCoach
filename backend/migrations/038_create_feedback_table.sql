-- Migration: Create Feedback Table
-- Description: Store user feedback submissions for admin review

CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Contact info (for non-logged-in users)
    name VARCHAR(255),
    email VARCHAR(255),

    -- Feedback content
    category VARCHAR(50) NOT NULL DEFAULT 'general', -- 'general', 'bug', 'feature', 'question', 'other'
    subject VARCHAR(255),
    message TEXT NOT NULL,

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'new', -- 'new', 'read', 'responded', 'resolved'
    admin_notes TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    page_url VARCHAR(500), -- Where the feedback was submitted from
    user_agent TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback(category);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

COMMENT ON TABLE feedback IS 'User feedback submissions for admin review';
