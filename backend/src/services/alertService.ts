import { openai } from '../config/openai';
import { buildUserContext } from '../utils/contextBuilder';

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'volume' | 'intensity' | 'adherence' | 'recovery' | 'progression';
  title: string;
  message: string;
  actionable: boolean;
  action?: string;
  createdAt: Date;
}

/**
 * Generate proactive alerts based on training data using AI analysis
 */
export async function generateProactiveAlerts(userId: number): Promise<Alert[]> {
  try {
    const context = await buildUserContext(userId);

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Get current date in local timezone (not UTC) to match database CURRENT_DATE behavior
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const currentDate = `${year}-${month}-${day}`;

    // Filter out "missed workouts" if user has activities nearby
    // This prevents false alerts when users move workouts around
    const missedWorkouts: any[] = [];
    const notMissedWorkouts: any[] = [];

    if (context.thisWeekPlan?.workouts) {
      console.log('🔔 Alert Service - Current Date:', currentDate);
      console.log('🔔 Alert Service - Before filtering:', {
        thisWeekWorkoutsCount: context.thisWeekPlan.workouts.length,
        workouts: context.thisWeekPlan.workouts.map((w: any) => ({
          date: w.date,
          name: w.name,
          distance: w.distance
        }))
      });

      const activityDates = new Set(
        context.recentActivities?.map((a: any) => {
          const actDate = new Date(a.start_date);
          const actYear = actDate.getFullYear();
          const actMonth = String(actDate.getMonth() + 1).padStart(2, '0');
          const actDay = String(actDate.getDate()).padStart(2, '0');
          return `${actYear}-${actMonth}-${actDay}`;
        }) || []
      );

      console.log('🔔 Alert Service - Activity dates found:', Array.from(activityDates));

      // Categorize workouts as missed or not missed
      for (const w of context.thisWeekPlan.workouts) {
        // Handle both Date objects and strings
        let workoutDate: string;
        if (w.date instanceof Date) {
          const wYear = w.date.getFullYear();
          const wMonth = String(w.date.getMonth() + 1).padStart(2, '0');
          const wDay = String(w.date.getDate()).padStart(2, '0');
          workoutDate = `${wYear}-${wMonth}-${wDay}`;
        } else {
          // Parse as string (could be ISO format or YYYY-MM-DD)
          const workoutDateObj = new Date(w.date);
          const wYear = workoutDateObj.getFullYear();
          const wMonth = String(workoutDateObj.getMonth() + 1).padStart(2, '0');
          const wDay = String(workoutDateObj.getDate()).padStart(2, '0');
          workoutDate = `${wYear}-${wMonth}-${wDay}`;
        }

        console.log(`🔔 Checking workout: ${w.name} on ${workoutDate} vs currentDate ${currentDate}`);

        // NOT MISSED: Scheduled for today or in the future
        if (workoutDate >= currentDate) {
          console.log(`   → NOT MISSED (today or future)`);
          notMissedWorkouts.push({ ...w, dateStr: workoutDate, reason: 'today_or_future' });
          continue;
        }

        // NOT MISSED: User ran on that date
        if (activityDates.has(workoutDate)) {
          console.log(`   → NOT MISSED (activity on same date)`);
          notMissedWorkouts.push({ ...w, dateStr: workoutDate, reason: 'activity_same_day' });
          continue;
        }

        // NOT MISSED: User ran within +/- 2 days (moved workout)
        const workoutTime = new Date(workoutDate).getTime();
        const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
        let hasNearbyActivity = false;
        for (const actDateStr of activityDates) {
          const actTime = new Date(actDateStr).getTime();
          if (Math.abs(actTime - workoutTime) <= twoDaysMs) {
            hasNearbyActivity = true;
            break;
          }
        }
        if (hasNearbyActivity) {
          console.log(`   → NOT MISSED (activity within 2 days)`);
          notMissedWorkouts.push({ ...w, dateStr: workoutDate, reason: 'activity_nearby' });
          continue;
        }

        // MISSED: Past date with no nearby activity
        console.log(`   → MISSED`);
        missedWorkouts.push({ ...w, dateStr: workoutDate });
      }

      // Only include truly missed workouts
      context.thisWeekPlan.workouts = missedWorkouts;

      console.log('🔔 Alert Service - After filtering:', {
        missedWorkouts: missedWorkouts.length,
        notMissedWorkouts: notMissedWorkouts.length,
        missed: missedWorkouts.map((w: any) => ({ date: w.dateStr, name: w.name })),
        notMissed: notMissedWorkouts.map((w: any) => ({ date: w.dateStr, name: w.name, reason: w.reason }))
      });
    }

    // Build a clear list of workouts that should NOT be flagged as missed
    const notMissedList = notMissedWorkouts
      .filter(w => w.reason === 'today_or_future')
      .map(w => `- ${w.name} on ${w.dateStr} (${w.reason === 'today_or_future' ? 'scheduled for today/future' : 'already completed'})`)
      .join('\n');

    const prompt = `You are an AI running coach analyzing training data. Based on the athlete's context below, generate 0-3 proactive alerts about their training.

CONTEXT:
${JSON.stringify(context, null, 2)}

CURRENT DAY: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]}
CURRENT DATE: ${currentDate}

⚠️ DO NOT FLAG THESE WORKOUTS AS MISSED (they are scheduled for today or later):
${notMissedList || '(none)'}

VERIFIED MISSED WORKOUTS (in thisWeekPlan.workouts array): ${missedWorkouts.length > 0 ? missedWorkouts.map(w => `${w.name} on ${w.dateStr}`).join(', ') : 'NONE - do NOT generate missed workout alerts'}

Generate alerts for issues like:
1. **Volume changes**: Sudden weekly mileage increases/decreases (>15% change)
2. **Intensity distribution**: Too much time in Zone 4-5 (should be <20% for marathon training)
3. **Missed planned workouts**: ONLY if in thisWeekPlan.workouts AND scheduled before today
4. **Insufficient easy running**: Not enough Zone 1-2 training (should be ~80%)
5. **Back-to-back hard days**: Zone 4-5 on consecutive days without recovery
6. **Long run progression**: Longest run insufficient for goal distance/date

🚨 CRITICAL RULES FOR MISSED WORKOUTS - READ CAREFULLY:

✅ **ONLY SOURCE OF TRUTH**: The ONLY way to identify missed workouts is by checking thisWeekPlan.workouts array
✅ **Pre-filtered data**: thisWeekPlan.workouts has been filtered to ONLY include workouts that are:
   - Scheduled in the PAST (before ${currentDate})
   - NOT completed on that date or within +/- 2 days

🚫 **DO NOT use upcomingWorkouts for missed workout analysis** - that array contains FUTURE scheduled workouts
🚫 **DO NOT flag workouts scheduled for today (${currentDate}) or later as missed** - they haven't happened yet!
🚫 **If thisWeekPlan.workouts is EMPTY, there are NO missed workouts** - do not generate missed workout alerts!

How to identify missed workouts:
1. Check if thisWeekPlan.workouts array is empty
2. If empty → NO missed workouts → DO NOT generate missed workout alert
3. If not empty → Every workout in this array is verified as missed → Report them

Example:
- thisWeekPlan.workouts = [] → NO missed workout alert
- thisWeekPlan.workouts = [{date: "2026-02-28", name: "Easy Run"}] → Alert about missed Easy Run on Feb 28

NOTE: Today's date is ${currentDate}. Any workout on or after this date is NOT missed yet.

IMPORTANT RULES:
- Only alert on REAL issues with supporting data, not hypothetical concerns
- Be specific with data (mention actual numbers, dates, distances)
- If no significant issues exist, return empty array (but don't be overly cautious)
- Maximum 3 alerts (prioritize most critical)
- For marathon training, 80% of volume should be in Zone 1-2
- Don't flag 0% adherence on Monday/Tuesday if all planned workouts are later in the week

Return a JSON object with an "alerts" array. Each alert must have:
- severity: 'info' | 'warning' | 'critical'
- category: 'volume' | 'intensity' | 'adherence' | 'recovery' | 'progression'
- title: Brief title (max 50 chars)
- message: Detailed explanation with specific data
- actionable: true/false
- action: Specific recommended action (if actionable is true)

Example alert:
{
  "severity": "warning",
  "category": "intensity",
  "title": "Too much high-intensity training",
  "message": "Last 30 days: You spent 18% of training time in Zone 4-5 (5.3 hours). For marathon training, this should be closer to 10-15%. Your easy runs are averaging 148 bpm (Zone 3) when they should be Zone 2 (120-140 bpm).",
  "actionable": true,
  "action": "Slow down on easy days. Target Zone 2 (120-140 bpm) by reducing your easy pace from 5:20/km to 5:50-6:10/km."
}

MISSED WORKOUT EXAMPLES (Today is ${currentDate}):

✅ CORRECT - thisWeekPlan.workouts = [] → Return NO missed workout alert
✅ CORRECT - thisWeekPlan.workouts = [{date: "2026-02-28", name: "Long Run"}] → Alert: "You missed Long Run on Feb 28"
✅ CORRECT - If thisWeekPlan.workouts is empty, DO NOT mention missed workouts at all

❌ WRONG - Alerting about any workout on or after ${currentDate} (they haven't occurred yet!)
❌ WRONG - Alerting about workouts in upcomingWorkouts array (those are FUTURE scheduled workouts, not missed!)
❌ WRONG - "0% adherence" alerts when all workouts are scheduled for later in the week
❌ WRONG - Saying "you missed your Tempo Run on March 10" when March 10 is TODAY or in the future

🚫 ABSOLUTE RULE: A workout can ONLY be missed if its date is BEFORE ${currentDate}. Any workout on ${currentDate} or later CANNOT be missed because it hasn't happened yet!

🔍 DEBUGGING - If you see these values:
- thisWeekPlan.workouts = [] → means NO missed workouts this week
- upcomingWorkouts = [...] → these are FUTURE planned workouts, ignore for missed workout analysis

OTHER ALERT EXAMPLES:
✅ Alert: Last 4 weeks adherence rate is below 60%
✅ Alert: Too much high-intensity training (18% in Zone 4-5)
✅ Alert: Weekly mileage jumped 25% (too aggressive)

CRITICAL NOTES:
- You should still generate alerts for OTHER categories (intensity, volume, progression, recovery) regardless of day of week!
- Missed workouts have been pre-filtered: EVERY workout in thisWeekPlan.workouts is truly missed (past date + no nearby activity)
- Today's workouts and future workouts have been removed: you will NOT see them in thisWeekPlan.workouts
- Flexible scheduling is already accounted for: workouts where user ran within +/- 2 days have been removed from the list

Return ONLY valid JSON with "alerts" array. No other text.`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{"alerts": []}';
    console.log('🔔 Alert generation response:', content);

    const parsed = JSON.parse(content);
    const alerts = (parsed.alerts || []).map((alert: any) => ({
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    }));

    console.log(`🔔 Generated ${alerts.length} alerts for user ${userId}`);
    return alerts;
  } catch (error) {
    console.error('Alert generation error:', error);
    // Return empty array on error rather than failing
    return [];
  }
}

/**
 * Get cached alerts for a user (optional future enhancement)
 * For now, alerts are generated on-demand
 */
export async function getCachedAlerts(userId: number): Promise<Alert[]> {
  // Placeholder for future caching implementation
  // Could store alerts in database or Redis with expiration
  return generateProactiveAlerts(userId);
}
