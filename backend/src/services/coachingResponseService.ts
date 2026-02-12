/**
 * Coaching Response Service
 *
 * Tracks coaching advice effectiveness.
 * Records what advice was given and monitors if behavior changed.
 *
 * Examples:
 * - Advice: "Slow down easy runs to 5:30/km"
 * - Follow-up 1 week later: Did runner actually slow down?
 * - Effectiveness: Did it help (improved consistency, better recovery)?
 */

import pool from '../config/database';

export interface CoachingResponse {
  userId: number;
  conversationId?: string;
  messageId?: string;
  coachingPoint: string;
  coachingCategory: string;
  contextSnapshot?: any;
  userResponse?: 'acknowledged' | 'questioned' | 'rejected' | 'ignored';
  behaviorChanged?: boolean;
  followUpDate?: Date;
  effectivenessScore?: number; // 1-5
  effectivenessNotes?: string;
}

/**
 * Record coaching advice when given
 */
export async function recordCoachingAdvice(
  userId: number,
  conversationId: string,
  messageId: string,
  coachingPoint: string,
  category: string,
  context?: any
): Promise<number> {
  console.log(`📝 Recording coaching advice for user ${userId}: ${category}`);

  // Set follow-up date based on category
  const followUpDate = new Date();
  if (category === 'pacing' || category === 'hr_management') {
    followUpDate.setDate(followUpDate.getDate() + 7); // Check in 1 week
  } else if (category === 'volume') {
    followUpDate.setDate(followUpDate.getDate() + 14); // Check in 2 weeks
  } else {
    followUpDate.setDate(followUpDate.getDate() + 7);
  }

  try {
    const result = await pool.query(
      `INSERT INTO coaching_responses
       (user_id, conversation_id, message_id, coaching_point, coaching_category,
        context_snapshot, follow_up_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        userId,
        conversationId,
        messageId,
        coachingPoint,
        category,
        JSON.stringify(context || {}),
        followUpDate
      ]
    );

    const responseId = result.rows[0].id;
    console.log(`✓ Coaching advice recorded (ID: ${responseId})`);
    return responseId;

  } catch (error) {
    console.error('Error recording coaching advice:', error);
    throw error;
  }
}

/**
 * Update user's response to coaching advice
 */
export async function updateUserResponse(
  responseId: number,
  userResponse: 'acknowledged' | 'questioned' | 'rejected' | 'ignored'
): Promise<void> {
  await pool.query(
    `UPDATE coaching_responses
     SET user_response = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [userResponse, responseId]
  );
}

/**
 * Check follow-up items and assess effectiveness
 * Should run daily via cron
 */
export async function checkFollowUpItems(): Promise<void> {
  console.log('🔄 Checking coaching response follow-ups...');

  try {
    // Get responses due for follow-up
    const result = await pool.query(
      `SELECT
         cr.id,
         cr.user_id,
         cr.coaching_category,
         cr.coaching_point,
         cr.context_snapshot,
         cr.follow_up_date
       FROM coaching_responses cr
       WHERE cr.follow_up_date <= CURRENT_DATE
         AND cr.behavior_changed IS NULL
       ORDER BY cr.follow_up_date ASC
       LIMIT 50`
    );

    console.log(`Found ${result.rows.length} responses to check`);

    for (const response of result.rows) {
      try {
        await assessEffectiveness(response);
      } catch (error) {
        console.error(`Failed to assess response ${response.id}:`, error);
      }
    }

    console.log('✓ Follow-up check completed');

  } catch (error) {
    console.error('Error checking follow-ups:', error);
    throw error;
  }
}

/**
 * Assess if coaching advice was effective
 */
async function assessEffectiveness(response: any): Promise<void> {
  const userId = response.user_id;
  const category = response.coaching_category;
  const followUpDate = new Date(response.follow_up_date);
  const checkStart = new Date(followUpDate);
  checkStart.setDate(checkStart.getDate() - 7); // Week before follow-up

  let behaviorChanged = false;
  let effectivenessScore = 3; // Default neutral
  let effectivenessNotes = '';

  // Check based on category
  if (category === 'pacing') {
    // Check if pacing improved after advice
    const beforeResult = await pool.query(
      `SELECT AVG((pacing_analysis->>'paceDelta')::numeric) as avg_fade
       FROM daily_run_insights
       WHERE user_id = $1
         AND run_date < $2
         AND run_date >= $2 - INTERVAL '7 days'`,
      [userId, followUpDate]
    );

    const afterResult = await pool.query(
      `SELECT AVG((pacing_analysis->>'paceDelta')::numeric) as avg_fade
       FROM daily_run_insights
       WHERE user_id = $1
         AND run_date >= $2
         AND run_date < $2 + INTERVAL '7 days'`,
      [userId, followUpDate]
    );

    const beforeFade = parseFloat(beforeResult.rows[0]?.avg_fade || '0');
    const afterFade = parseFloat(afterResult.rows[0]?.avg_fade || '0');

    if (afterFade > beforeFade + 2) {
      behaviorChanged = true;
      effectivenessScore = 5;
      effectivenessNotes = `Pacing improved: fade reduced from ${Math.abs(beforeFade).toFixed(1)}% to ${Math.abs(afterFade).toFixed(1)}%`;
    } else if (Math.abs(afterFade - beforeFade) < 1) {
      behaviorChanged = false;
      effectivenessScore = 2;
      effectivenessNotes = 'No change in pacing pattern observed';
    }

  } else if (category === 'hr_management') {
    // Check if HR behavior improved
    const beforeResult = await pool.query(
      `SELECT AVG((hr_behavior->>'avgZone')::numeric) as avg_zone
       FROM daily_run_insights
       WHERE user_id = $1
         AND run_date < $2
         AND run_date >= $2 - INTERVAL '7 days'
         AND (effort_analysis->>'perceivedDifficulty') = 'easy'`,
      [userId, followUpDate]
    );

    const afterResult = await pool.query(
      `SELECT AVG((hr_behavior->>'avgZone')::numeric) as avg_zone
       FROM daily_run_insights
       WHERE user_id = $1
         AND run_date >= $2
         AND run_date < $2 + INTERVAL '7 days'
         AND (effort_analysis->>'perceivedDifficulty') = 'easy'`,
      [userId, followUpDate]
    );

    const beforeZone = parseFloat(beforeResult.rows[0]?.avg_zone || '0');
    const afterZone = parseFloat(afterResult.rows[0]?.avg_zone || '0');

    if (beforeZone > 2.5 && afterZone <= 2.3) {
      behaviorChanged = true;
      effectivenessScore = 5;
      effectivenessNotes = `Easy run HR improved: Zone ${beforeZone.toFixed(1)} → ${afterZone.toFixed(1)}`;
    } else if (Math.abs(afterZone - beforeZone) < 0.2) {
      behaviorChanged = false;
      effectivenessScore = 2;
      effectivenessNotes = 'No change in HR behavior observed';
    }

  } else if (category === 'volume') {
    // Check if volume management improved
    const beforeResult = await pool.query(
      `SELECT volume_analysis->>'weekOverWeekChange' as change
       FROM weekly_insights
       WHERE user_id = $1
         AND week_start < $2
       ORDER BY week_start DESC
       LIMIT 1`,
      [userId, followUpDate]
    );

    const afterResult = await pool.query(
      `SELECT volume_analysis->>'weekOverWeekChange' as change
       FROM weekly_insights
       WHERE user_id = $1
         AND week_start >= $2
       ORDER BY week_start ASC
       LIMIT 1`,
      [userId, followUpDate]
    );

    const beforeChange = parseFloat(beforeResult.rows[0]?.change || '0');
    const afterChange = parseFloat(afterResult.rows[0]?.change || '0');

    if (beforeChange > 10 && afterChange <= 10) {
      behaviorChanged = true;
      effectivenessScore = 5;
      effectivenessNotes = `Volume increase moderated: ${beforeChange.toFixed(0)}% → ${afterChange.toFixed(0)}%`;
    } else if (afterChange > 15) {
      behaviorChanged = false;
      effectivenessScore = 1;
      effectivenessNotes = 'Volume increases still too aggressive';
    }

  } else if (category === 'compliance') {
    // Check if adherence improved
    const beforeResult = await pool.query(
      `SELECT adherence_tracking->>'adherenceRate' as rate
       FROM weekly_insights
       WHERE user_id = $1
         AND week_start < $2
       ORDER BY week_start DESC
       LIMIT 1`,
      [userId, followUpDate]
    );

    const afterResult = await pool.query(
      `SELECT adherence_tracking->>'adherenceRate' as rate
       FROM weekly_insights
       WHERE user_id = $1
         AND week_start >= $2
       ORDER BY week_start ASC
       LIMIT 1`,
      [userId, followUpDate]
    );

    const beforeRate = parseFloat(beforeResult.rows[0]?.rate || '0');
    const afterRate = parseFloat(afterResult.rows[0]?.rate || '0');

    if (afterRate > beforeRate + 10) {
      behaviorChanged = true;
      effectivenessScore = 5;
      effectivenessNotes = `Adherence improved: ${beforeRate.toFixed(0)}% → ${afterRate.toFixed(0)}%`;
    } else if (Math.abs(afterRate - beforeRate) < 5) {
      behaviorChanged = false;
      effectivenessScore = 3;
      effectivenessNotes = 'Adherence unchanged';
    }
  }

  // Update the response record
  await pool.query(
    `UPDATE coaching_responses
     SET behavior_changed = $1,
         effectiveness_score = $2,
         effectiveness_notes = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [behaviorChanged, effectivenessScore, effectivenessNotes, response.id]
  );

  console.log(`  ✓ Assessed response ${response.id}: ${behaviorChanged ? 'Changed' : 'No change'} (score: ${effectivenessScore})`);
}

/**
 * Get effectiveness summary for a user
 */
export async function getEffectivenessSummary(userId: number): Promise<any> {
  const result = await pool.query(
    `SELECT
       coaching_category,
       COUNT(*) as total_advice,
       COUNT(*) FILTER (WHERE behavior_changed = true) as successful,
       AVG(effectiveness_score) FILTER (WHERE effectiveness_score IS NOT NULL) as avg_score
     FROM coaching_responses
     WHERE user_id = $1
       AND behavior_changed IS NOT NULL
     GROUP BY coaching_category`,
    [userId]
  );

  return result.rows.reduce((acc: any, row: any) => {
    acc[row.coaching_category] = {
      totalAdvice: parseInt(row.total_advice),
      successful: parseInt(row.successful),
      successRate: (parseInt(row.successful) / parseInt(row.total_advice) * 100).toFixed(0),
      avgScore: parseFloat(row.avg_score || '0').toFixed(1)
    };
    return acc;
  }, {});
}
