CREATE SCHEMA IF NOT EXISTS runcoach_mcp;
CREATE TABLE IF NOT EXISTS runcoach_mcp.connections (
  athlete_id BIGINT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Preserve historical values without requiring new connections to store plaintext credentials.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='runcoach_mcp' AND table_name='connections' AND column_name='credentials'
  ) THEN
    ALTER TABLE runcoach_mcp.connections ALTER COLUMN credentials DROP NOT NULL;
  END IF;
END $$;
-- Independent Strava registration credentials; never import or mutate public.users.
-- Envelope: version (1 byte), nonce (12 bytes), GCM authentication tag (16 bytes), ciphertext.
CREATE TABLE IF NOT EXISTS runcoach_mcp.credentials (
  athlete_id BIGINT PRIMARY KEY,
  encrypted_credentials BYTEA NOT NULL CHECK (octet_length(encrypted_credentials) >= 30),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
