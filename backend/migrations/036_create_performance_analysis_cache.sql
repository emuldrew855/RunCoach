-- Performance Analysis Cache Table
-- Caches the Smart Analysis results to avoid repeated LLM calls

CREATE TABLE IF NOT EXISTS performance_analysis_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  analysis_data JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_performance_analysis_cache_user_id
  ON performance_analysis_cache(user_id);

CREATE INDEX IF NOT EXISTS idx_performance_analysis_cache_generated_at
  ON performance_analysis_cache(generated_at);

COMMENT ON TABLE performance_analysis_cache IS 'Caches Smart Analysis results for dashboard performance (1 hour TTL)';
