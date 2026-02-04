const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkColumns() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'training_plans'
      AND column_name IN ('peak_weeks_count', 'peak_week_numbers', 'identify_peaks', 'taper_weeks', 'taper_start_date')
      ORDER BY column_name
    `);

    console.log('Migration columns found:');
    console.log(result.rows);

    // Check if there's any training plan data
    const planResult = await pool.query(`
      SELECT id, name, identify_peaks, peak_weeks_count, peak_week_numbers, taper_weeks
      FROM training_plans
      LIMIT 1
    `);

    console.log('\nSample training plan data:');
    console.log(planResult.rows);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkColumns();
