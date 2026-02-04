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

    const prompt = `You are an AI running coach analyzing training data. Based on the athlete's context below, generate 0-3 proactive alerts about their training.

CONTEXT:
${JSON.stringify(context, null, 2)}

Generate alerts for issues like:
1. **Volume changes**: Sudden weekly mileage increases/decreases (>15% change)
2. **Intensity distribution**: Too much time in Zone 4-5 (should be <20% for marathon training)
3. **Missed planned workouts**: Poor adherence to training plan (<70%)
4. **Insufficient easy running**: Not enough Zone 1-2 training (should be ~80%)
5. **Back-to-back hard days**: Zone 4-5 on consecutive days without recovery
6. **Long run progression**: Longest run insufficient for goal distance/date

IMPORTANT RULES:
- Only alert on REAL issues, not hypothetical concerns
- Be specific with data (mention actual numbers, dates, distances)
- If no significant issues exist, return empty array
- Maximum 3 alerts (prioritize most critical)
- For marathon training, 80% of volume should be in Zone 1-2

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

Return ONLY valid JSON with "alerts" array. No other text.`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{"alerts": []}');
    const alerts = (parsed.alerts || []).map((alert: any) => ({
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    }));

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
