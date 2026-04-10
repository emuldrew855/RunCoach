-- Migration 030: Add Last Activity Sync Timestamp
--
-- Adds last_activity_sync_at column to users table to enable incremental syncing.
-- This prevents re-syncing all activities on every sync request and significantly
-- improves performance for users with many activities.
--
-- The timestamp is updated after each successful sync to the start_date of the
-- most recent activity processed, ensuring we only fetch new activities going forward.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_activity_sync_at TIMESTAMP;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_users_last_activity_sync
ON users(last_activity_sync_at);

-- Add comment for documentation
COMMENT ON COLUMN users.last_activity_sync_at IS 'Timestamp of the most recent activity synced from Strava. Used to fetch only new activities on subsequent syncs (incremental sync). NULL means full sync needed.';
