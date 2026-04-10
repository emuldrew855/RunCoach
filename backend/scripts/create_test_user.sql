-- Create a test user for experiencing the new user flow
-- Run this with: docker exec -i runcoach-db psql -U runcoach -d runcoach < scripts/create_test_user.sql

-- First, delete any existing test user to start fresh
DELETE FROM users WHERE strava_id = 999999999;

-- Create the test user with dummy Strava credentials
INSERT INTO users (
    strava_id,
    email,
    first_name,
    last_name,
    profile_picture_url,
    access_token,
    refresh_token,
    token_expires_at,
    created_at,
    updated_at,
    last_login_at
) VALUES (
    999999999,                              -- Dummy strava_id
    'testuser@runcoach.test',               -- Test email
    'Test',                                 -- First name
    'Runner',                               -- Last name
    NULL,                                   -- No profile picture
    'test_access_token_not_valid',          -- Dummy access token (won't work with Strava API)
    'test_refresh_token_not_valid',         -- Dummy refresh token
    EXTRACT(EPOCH FROM NOW() + INTERVAL '1 year')::BIGINT,  -- Token expires in 1 year
    NOW(),
    NOW(),
    NOW()
)
RETURNING id, strava_id, email, first_name, last_name;

-- Output confirmation
SELECT 'Test user created successfully!' AS status;
SELECT 'Login will require bypassing Strava OAuth - see instructions below' AS note;
