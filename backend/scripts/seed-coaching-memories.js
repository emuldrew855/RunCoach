/**
 * Seed Coaching Memories Script
 *
 * Populates the memory tables with realistic coaching insights.
 * This demonstrates what the AI coach "remembers" about the athlete.
 *
 * Usage: node scripts/seed-coaching-memories.js [userId]
 *
 * If no userId is provided, it will use user ID 1.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Get user ID from args or default to 1
const userId = parseInt(process.argv[2]) || 1;

const workoutInsights = [
  // Patterns - training behaviors observed
  { type: 'pattern', text: 'Tends to run easy runs 15-20 seconds per km faster than target pace, especially in the first half' },
  { type: 'pattern', text: 'Long runs show consistent negative splits - second half typically 10-15 sec/km faster than first' },
  { type: 'pattern', text: 'HR drift on runs >15km averages 8-10%, indicating good aerobic efficiency' },
  { type: 'pattern', text: 'Best tempo performances occur on Tuesday sessions after Monday rest day' },
  { type: 'pattern', text: 'Interval recovery times are consistently at the shorter end of prescribed ranges' },

  // Preferences - what the athlete likes/prefers
  { type: 'preference', text: 'Prefers early morning runs (6-7am) - performance data shows best paces at this time' },
  { type: 'preference', text: 'Responds well to structured workouts with specific pace targets rather than effort-based' },
  { type: 'preference', text: 'Likes detailed post-run analysis with specific metrics and actionable feedback' },
  { type: 'preference', text: 'Prefers to front-load weekly mileage (heavier Mon-Wed, lighter Thu-Sat)' },

  // Concerns - areas to watch
  { type: 'concern', text: 'Has mentioned right calf tightness after tempo runs - needs monitoring' },
  { type: 'concern', text: 'Sleep quality drops during high-volume weeks (>70km) - may need recovery adjustment' },
  { type: 'concern', text: 'Tends to push through fatigue rather than taking rest - risk of overtraining' },
  { type: 'concern', text: 'Previous IT band issue (6 months ago) - avoid rapid mileage increases' },

  // Successes - achievements and breakthroughs
  { type: 'success', text: 'Successfully completed first 30km long run with even pacing - major milestone' },
  { type: 'success', text: 'Tempo pace improved from 4:45/km to 4:35/km over 8 weeks of consistent training' },
  { type: 'success', text: 'Maintained sub-145bpm HR at 5:30/km pace - aerobic base is building well' },
  { type: 'success', text: 'Recovered well from back-to-back hard sessions - fitness responding to training load' },
];

const activityPatterns = [
  // Pacing patterns
  { category: 'pacing', text: 'Easy run pace: typically 5:20-5:40/km when HR stays in Zone 2', occurrences: 12 },
  { category: 'pacing', text: 'Tempo efforts settle into 4:35-4:45/km range after first km', occurrences: 8 },
  { category: 'pacing', text: 'Long run pace drifts 5-10 sec/km faster in final 5km on good days', occurrences: 6 },
  { category: 'pacing', text: 'Interval 400m splits: 88-92 seconds with consistent pacing', occurrences: 5 },

  // HR behavior patterns
  { category: 'hr_behavior', text: 'Resting HR: 52-55bpm, elevated (>58) indicates insufficient recovery', occurrences: 15 },
  { category: 'hr_behavior', text: 'Easy runs: HR stabilizes at 138-145bpm after first 2km warmup', occurrences: 14 },
  { category: 'hr_behavior', text: 'Threshold HR sits at 168-172bpm during sustained tempo efforts', occurrences: 7 },
  { category: 'hr_behavior', text: 'HR recovery: drops 30-35bpm in first minute post-hard effort', occurrences: 10 },

  // Recovery patterns
  { category: 'recovery', text: 'Optimal recovery after long run: 48-72 hours before quality session', occurrences: 8 },
  { category: 'recovery', text: 'Monday rest days correlate with best Tuesday workout performance', occurrences: 6 },
  { category: 'recovery', text: 'Two consecutive hard days leads to elevated HR on third day', occurrences: 4 },
  { category: 'recovery', text: 'Best adaptation occurs with 3-4 easy days between interval sessions', occurrences: 5 },

  // Performance patterns
  { category: 'performance', text: 'Strongest performances in 10-15°C temperature range', occurrences: 9 },
  { category: 'performance', text: 'Morning runs (6-8am) average 8 sec/km faster than evening runs', occurrences: 11 },
  { category: 'performance', text: 'Performance dips in week 4 of build cycles - needs recovery week', occurrences: 3 },
  { category: 'performance', text: 'Flat courses produce more consistent pacing than hilly routes', occurrences: 7 },
];

const conversationSummaries = [
  {
    summary: 'Discussed marathon pacing strategy. Agreed on conservative first half at 4:55/km to preserve energy for strong finish. Emphasized importance of not getting caught up in race-day adrenaline.',
    insights: ['Target first half at 4:55/km', 'Save effort for final 10km push', 'Practice race-day nutrition in long runs'],
    topics: ['marathon', 'pacing', 'race strategy'],
    sentiment: 'positive',
    daysAgo: 3,
  },
  {
    summary: 'Reviewed last week\'s training. Volume was 72km with good quality sessions. Noted slight calf tightness after tempo - recommended extra stretching and foam rolling.',
    insights: ['Calf tightness needs monitoring', 'Consider sports massage before peak week', 'Foam roll calves after every run'],
    topics: ['weekly review', 'recovery', 'injury prevention'],
    sentiment: 'neutral',
    daysAgo: 7,
  },
  {
    summary: 'Addressed concerns about hitting goal time. Analyzed recent workouts - fitness indicators are on track. Discussed mental preparation and visualization techniques.',
    insights: ['Fitness is progressing well', 'Work on race-day visualization', 'Trust the training'],
    topics: ['goal', 'confidence', 'mental preparation'],
    sentiment: 'positive',
    daysAgo: 10,
  },
  {
    summary: 'Post long run analysis (28km). Excellent execution with negative split. HR drift was only 7% indicating strong aerobic base. Ready for 32km next week.',
    insights: ['Aerobic base is solid', 'Negative splitting becoming natural', 'Ready for final long run build'],
    topics: ['long run', 'aerobic fitness', 'marathon prep'],
    sentiment: 'positive',
    daysAgo: 14,
  },
  {
    summary: 'Discussed nutrition strategy for race week. Carb loading protocol reviewed. Emphasized hydration and avoiding new foods. Pre-race meal plan finalized.',
    insights: ['Start carb loading 3 days before', 'Stick to familiar foods', 'Hydration focus from 5 days out'],
    topics: ['nutrition', 'race week', 'carb loading'],
    sentiment: 'positive',
    daysAgo: 21,
  },
];

async function seedMemories() {
  const client = await pool.connect();

  try {
    console.log(`\n🧠 Seeding coaching memories for user ${userId}...\n`);

    // Check if user exists
    const userCheck = await client.query('SELECT id, first_name FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      console.error(`❌ User with ID ${userId} not found. Please provide a valid user ID.`);
      process.exit(1);
    }

    const userName = userCheck.rows[0].first_name;
    console.log(`📋 Found user: ${userName} (ID: ${userId})\n`);

    await client.query('BEGIN');

    // Clear existing memories for this user (fresh start)
    console.log('🧹 Clearing existing memories...');
    await client.query('DELETE FROM workout_insights WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM activity_patterns WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM conversation_summaries WHERE user_id = $1', [userId]);

    // Insert workout insights
    console.log('💡 Inserting workout insights...');
    for (const insight of workoutInsights) {
      await client.query(
        `INSERT INTO workout_insights (user_id, insight_type, insight_text, metadata, created_at)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days')`,
        [userId, insight.type, insight.text, JSON.stringify({ source: 'seeded' })]
      );
    }
    console.log(`   ✓ Added ${workoutInsights.length} insights`);

    // Insert activity patterns
    console.log('📊 Inserting activity patterns...');
    for (const pattern of activityPatterns) {
      const daysAgo = Math.floor(Math.random() * 60);
      await client.query(
        `INSERT INTO activity_patterns (user_id, pattern_category, pattern_text, occurrence_count, first_seen, last_seen, metadata)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${daysAgo + 30} days', NOW() - INTERVAL '${daysAgo} days', $5)`,
        [userId, pattern.category, pattern.text, pattern.occurrences, JSON.stringify({ source: 'seeded' })]
      );
    }
    console.log(`   ✓ Added ${activityPatterns.length} patterns`);

    // Insert conversation summaries
    console.log('💬 Inserting conversation summaries...');
    for (let i = 0; i < conversationSummaries.length; i++) {
      const summary = conversationSummaries[i];
      const conversationId = `seeded-memory-${userId}-${i}-${Date.now()}`;
      await client.query(
        `INSERT INTO conversation_summaries (user_id, conversation_id, summary_text, key_insights, topics, sentiment, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '${summary.daysAgo} days')`,
        [userId, conversationId, summary.summary, summary.insights, summary.topics, summary.sentiment]
      );
    }
    console.log(`   ✓ Added ${conversationSummaries.length} summaries`);

    await client.query('COMMIT');

    console.log('\n' + '='.repeat(60));
    console.log('✅ COACHING MEMORIES SEEDED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`\nUser: ${userName} (ID: ${userId})`);
    console.log(`\nMemories added:`);
    console.log(`  • ${workoutInsights.length} Workout Insights`);
    console.log(`    - ${workoutInsights.filter(i => i.type === 'pattern').length} patterns`);
    console.log(`    - ${workoutInsights.filter(i => i.type === 'preference').length} preferences`);
    console.log(`    - ${workoutInsights.filter(i => i.type === 'concern').length} concerns`);
    console.log(`    - ${workoutInsights.filter(i => i.type === 'success').length} successes`);
    console.log(`  • ${activityPatterns.length} Activity Patterns`);
    console.log(`    - ${activityPatterns.filter(p => p.category === 'pacing').length} pacing`);
    console.log(`    - ${activityPatterns.filter(p => p.category === 'hr_behavior').length} HR behavior`);
    console.log(`    - ${activityPatterns.filter(p => p.category === 'recovery').length} recovery`);
    console.log(`    - ${activityPatterns.filter(p => p.category === 'performance').length} performance`);
    console.log(`  • ${conversationSummaries.length} Conversation Summaries`);
    console.log('\n📱 Refresh your Profile page to see the coaching memories!\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding memories:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedMemories()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
