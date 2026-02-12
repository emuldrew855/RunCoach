/**
 * Make Admin Script
 *
 * CLI tool to grant or revoke admin privileges for a user.
 *
 * Usage:
 *   npm run make-admin <email> [--revoke]
 *
 * Examples:
 *   npm run make-admin john@example.com
 *   npm run make-admin john@example.com --revoke
 */

import dotenv from 'dotenv';
dotenv.config();

import { query } from '../config/database';

async function makeAdmin(email: string, revoke: boolean = false): Promise<void> {
  try {
    // Find user by email
    const result = await query(
      'SELECT id, first_name, last_name, email, is_admin FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length === 0) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    const user = result.rows[0];

    if (revoke) {
      // Revoke admin privileges
      if (!user.is_admin) {
        console.log(`ℹ️  User ${email} is already not an admin`);
        process.exit(0);
      }

      await query(
        'UPDATE users SET is_admin = false, admin_notes = NULL WHERE id = $1',
        [user.id]
      );

      console.log(`✓ Admin privileges revoked from ${user.first_name} ${user.last_name} (${email})`);
    } else {
      // Grant admin privileges
      if (user.is_admin) {
        console.log(`ℹ️  User ${email} is already an admin`);
        process.exit(0);
      }

      await query(
        `UPDATE users
         SET is_admin = true,
             admin_notes = 'Admin granted via CLI script on ' || NOW()::TEXT
         WHERE id = $1`,
        [user.id]
      );

      console.log(`✓ Admin privileges granted to ${user.first_name} ${user.last_name} (${email})`);
      console.log(`  User ID: ${user.id}`);
      console.log(`  You can now login and access /admin routes`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage: npm run make-admin <email> [--revoke]

Examples:
  npm run make-admin john@example.com           # Grant admin
  npm run make-admin john@example.com --revoke  # Revoke admin

This script will grant or revoke admin privileges for the specified user.
`);
  process.exit(1);
}

const email = args[0];
const revoke = args.includes('--revoke');

makeAdmin(email, revoke);
