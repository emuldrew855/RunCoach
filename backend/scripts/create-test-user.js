/**
 * Create Test User Script
 *
 * Creates a fresh test user with no data (new user experience)
 * and generates a JWT token for direct login.
 *
 * Usage: node scripts/create-test-user.js
 *
 * Then copy the JWT and use it in the browser:
 * 1. Open the app in browser
 * 2. Open Developer Tools > Console
 * 3. Run: localStorage.setItem('token', 'YOUR_JWT_HERE')
 * 4. Refresh the page
 */

require('dotenv').config();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const TEST_USER = {
  strava_id: 999999999,
  email: 'testuser@runcoach.test',
  first_name: 'Test',
  last_name: 'Runner',
};

async function createTestUser() {
  const client = await pool.connect();

  try {
    console.log('\n🧹 Cleaning up existing test user data...\n');

    // Start transaction
    await client.query('BEGIN');

    // Check if test user exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE strava_id = $1',
      [TEST_USER.strava_id]
    );

    if (existingUser.rows.length > 0) {
      const userId = existingUser.rows[0].id;
      console.log(`Found existing test user (id: ${userId}), deleting all data...`);

      // Delete all related data (cascades will handle most, but be explicit)
      await client.query('DELETE FROM action_history WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = $1)', [userId]);
      await client.query('DELETE FROM conversations WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM planned_workouts WHERE training_plan_id IN (SELECT id FROM training_plans WHERE user_id = $1)', [userId]);
      await client.query('DELETE FROM training_plans WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM goals WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM activities WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_profiles WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      console.log('✅ Existing test user data deleted\n');
    }

    // Create fresh test user
    console.log('👤 Creating fresh test user...');
    const result = await client.query(`
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
      ) VALUES ($1, $2, $3, $4, NULL, 'test_token', 'test_refresh', $5, NOW(), NOW(), NOW())
      RETURNING id, strava_id, email, first_name, last_name
    `, [
      TEST_USER.strava_id,
      TEST_USER.email,
      TEST_USER.first_name,
      TEST_USER.last_name,
      Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year from now
    ]);

    await client.query('COMMIT');

    const user = result.rows[0];
    console.log('✅ Test user created:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.first_name} ${user.last_name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Strava ID: ${user.strava_id}`);

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        stravaId: user.strava_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('\n' + '='.repeat(60));
    console.log('🔑 JWT TOKEN (valid for 7 days):');
    console.log('='.repeat(60));
    console.log('\n' + token + '\n');
    console.log('='.repeat(60));

    console.log('\n📋 TO LOGIN AS TEST USER:\n');
    console.log('1. Open the app in your browser: http://localhost:5173');
    console.log('2. Open Developer Tools (F12) > Console tab');
    console.log('3. Run this command:\n');
    console.log(`   localStorage.setItem('token', '${token}')\n`);
    console.log('4. Refresh the page (F5)\n');
    console.log('You should now be logged in as "Test Runner" with a fresh account!\n');

    return user;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating test user:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createTestUser()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
