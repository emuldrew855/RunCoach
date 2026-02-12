import db from '../src/config/database';
import * as fs from 'fs';
import * as path from 'path';

async function applyMigration() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/020_fix_pending_actions_message_id.sql'),
      'utf-8'
    );

    await db.query(sql);
    console.log('✅ Migration 020 applied successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
