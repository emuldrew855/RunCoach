CREATE SCHEMA IF NOT EXISTS runcoach_mcp;
CREATE TABLE IF NOT EXISTS runcoach_mcp.connections (
  athlete_id BIGINT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE runcoach_mcp.connections DROP COLUMN IF EXISTS credentials;
CREATE TABLE IF NOT EXISTS runcoach_mcp.authorization_requests (
  id TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  data JSONB NOT NULL,
  strava_used BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS runcoach_mcp.grants (
  id TEXT PRIMARY KEY,
  athlete_id BIGINT NOT NULL,
  client_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE runcoach_mcp.grants ADD COLUMN IF NOT EXISTS resource TEXT;
CREATE TABLE IF NOT EXISTS runcoach_mcp.tokens (
  hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES runcoach_mcp.grants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('code', 'access', 'refresh', 'management')),
  data JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS mcp_tokens_grant ON runcoach_mcp.tokens(grant_id);
CREATE INDEX IF NOT EXISTS mcp_grants_athlete ON runcoach_mcp.grants(athlete_id);
CREATE INDEX IF NOT EXISTS mcp_requests_expiry ON runcoach_mcp.authorization_requests(expires_at);
CREATE INDEX IF NOT EXISTS mcp_tokens_expiry ON runcoach_mcp.tokens(expires_at);
