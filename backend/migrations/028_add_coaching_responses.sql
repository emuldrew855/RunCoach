-- Migration 028: Add Coaching Responses Tracking Table
--
-- Tracks what coaching advice was given and whether it was effective.
-- Enables learning what coaching approaches work for each runner.

CREATE TABLE IF NOT EXISTS coaching_responses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID, -- Specific message containing the coaching point

  -- The coaching advice given
  coaching_point TEXT NOT NULL,
  coaching_category VARCHAR(50), -- 'pacing', 'recovery', 'volume', 'hr_management', 'compliance', etc.

  -- Context when advice was given
  context_snapshot JSONB, -- Relevant metrics at time of advice
  -- Schema:
  -- {
  --   "weeklyVolume": 45,
  --   "adherenceRate": 85,
  --   "avgPace": 5.2,
  --   "avgHR": 145,
  --   "trainingPhase": "build"
  -- }

  -- Effectiveness tracking
  user_response VARCHAR(20), -- 'acknowledged', 'questioned', 'rejected', 'ignored'
  behavior_changed BOOLEAN DEFAULT NULL, -- NULL = too early to tell
  follow_up_date DATE, -- When to check if advice was followed
  effectiveness_score INTEGER, -- 1-5 rating (NULL until measurable)
  effectiveness_notes TEXT, -- Why it worked/didn't work

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coaching_responses_user ON coaching_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_coaching_responses_conversation ON coaching_responses(conversation_id);
CREATE INDEX IF NOT EXISTS idx_coaching_responses_category ON coaching_responses(coaching_category);
CREATE INDEX IF NOT EXISTS idx_coaching_responses_effective ON coaching_responses(behavior_changed) WHERE behavior_changed IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coaching_responses_followup ON coaching_responses(follow_up_date) WHERE follow_up_date IS NOT NULL;

COMMENT ON TABLE coaching_responses IS 'Tracks coaching advice effectiveness. Learn what works for each runner.';
COMMENT ON COLUMN coaching_responses.coaching_point IS 'The specific advice given (e.g., "Slow down your easy runs to 5:30/km")';
COMMENT ON COLUMN coaching_responses.user_response IS 'How user reacted: acknowledged, questioned, rejected, ignored';
COMMENT ON COLUMN coaching_responses.behavior_changed IS 'Did runner actually change behavior? (NULL = too early, TRUE/FALSE after follow-up)';
COMMENT ON COLUMN coaching_responses.effectiveness_score IS '1-5 rating of advice effectiveness (1=made things worse, 5=very helpful)';
