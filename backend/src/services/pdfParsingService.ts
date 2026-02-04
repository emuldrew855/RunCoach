import { openai } from '../config/openai';

interface ParsedWorkout {
  date: string;
  type: string;
  name?: string;
  description?: string;
  distance?: number;
  duration?: number;
  pace?: { min?: number; max?: number; avg?: number };
  hrZone?: number;
  intervals?: any[];
}

/**
 * Detect if PDF is a Runna training plan
 */
function isRunnaPDF(text: string): boolean {
  return text.toLowerCase().includes('runna') ||
         (text.includes('PLAN OVERVIEW') && text.includes('YOUR MARATHON PLAN'));
}

/**
 * Parse PDF training plan using AI with improved prompts
 */
export async function parsePDFPlan(buffer: Buffer): Promise<ParsedWorkout[]> {
  // Use older stable version of pdf-parse (1.1.1) with simple API
  const pdfParse = require('pdf-parse');
  const pdfData = await pdfParse(buffer);
  const text = pdfData.text;

  console.log('📄 PDF Text Length:', text.length, 'characters');
  console.log('📄 First 1000 chars:', text.substring(0, 1000));

  // Check if this is a Runna PDF and use specialized prompt
  const isRunna = isRunnaPDF(text);

  let prompt: string;

  if (isRunna) {
    console.log('✓ Detected Runna PDF format');
    prompt = `Role: You are a data extraction specialist focused on converting unstructured Runna training plans into structured workout data.

Task: Parse the provided training plan text into a JSON array. The text represents a calendar grid with weeks and daily workouts.

Grid Logic & Date Calculation:

1. Identify Week Anchors: Look for strings like "WEEK [X]" followed immediately by a date.

2. CRITICAL - The Monday Anchor: The date shown for each week IS the MONDAY start of that training week.
   - The date you see = MONDAY (the start of the week)

3. Sequential Mapping: The 7 workout slots after each week header represent:
   Slot 1 = Monday (the reference date + 0 days)
   Slot 2 = Tuesday (reference date + 1 day)
   Slot 3 = Wednesday (reference date + 2 days)
   Slot 4 = Thursday (reference date + 3 days)
   Slot 5 = Friday (reference date + 4 days)
   Slot 6 = Saturday (reference date + 5 days)
   Slot 7 = Sunday (reference date + 6 days)

4. Date Consistency: Calculate all dates from the WEEK 1 MONDAY:
   - WEEK 1 Monday = the date shown for WEEK 1
   - WEEK 2 Monday = WEEK 1 Monday + 7 days
   - WEEK 3 Monday = WEEK 1 Monday + 14 days
   - Continue adding 7 days for each subsequent week

5. Year Handling: Use ${new Date().getFullYear()} as the default year unless explicitly stated otherwise.

Workout Extraction Rules:

1. Matching Data: Pair the distance (e.g., "4km") with the workout description (e.g., "Easy Run") found in the same day's slot in the grid.

2. Type Mapping (apply in this priority order):
   - ANY run with distance ≥ 10km that contains "Long" OR is on Sunday → type: "long_run"
   - "Long Run", "Progressive Long Run", or any run >12km → type: "long_run"
   - "Tempo", "Threshold" → type: "tempo"
   - "Progressive Run" (if < 10km) → type: "tempo"
   - "Hills", "Hilly", "Hill Repeats" → type: "hills"
   - "Repeats", "Intervals", "Fartlek", "On Off", "Over and Under", "Over and Unders", "Broken" → type: "intervals"
   - "Time Trial", "Race", "Marathon Race" → type: "race"
   - "Recovery", "Recovery Run" → type: "recovery"
   - "Easy Run", "Easy" → type: "easy"
   - Default for anything else → type: "easy"

3. Exclusions: Do not include "Rest" days or blank/empty days in the output.

4. Extract ALL workouts: This is critical - parse every single workout from the entire plan.

Output Format:

Return ONLY a valid JSON object with a "workouts" array. Each workout must have:
- date: YYYY-MM-DD format (calculated using the rules above)
- type: workout type from mapping above
- name: full workout name (e.g., "4.5km Progressive Run", "1km Repeats")
- distance: in meters (convert km to meters by multiplying by 1000)

Example Logic:
If "WEEK 1" is followed by a date, that date = MONDAY start of the week.
The 7 workout slots after the week header represent:
  Slot 1 = Monday (the date shown)
  Slot 2 = Tuesday (date + 1 day)
  Slot 3 = Wednesday (date + 2 days)
  Slot 4 = Thursday (date + 3 days)
  Slot 5 = Friday (date + 4 days)
  Slot 6 = Saturday (date + 5 days)
  Slot 7 = Sunday (date + 6 days)

If WEEK 1 shows "FEB 9TH":
- Monday = Feb 9, Tuesday = Feb 10, Wednesday = Feb 11, Thursday = Feb 12, Friday = Feb 13, Saturday = Feb 14, Sunday = Feb 15

If WEEK 1 shows "JAN 12TH":
- Monday = Jan 12, Tuesday = Jan 13, Wednesday = Jan 14, Thursday = Jan 15, Friday = Jan 16, Saturday = Jan 17, Sunday = Jan 18

IMPORTANT: The date shown IS Monday. Sunday of that week = Monday date + 6 days.

Training Plan Text:
${text}

Extract ALL workouts following the rules above. Return ONLY valid JSON.`;
  } else {
    // Generic PDF parsing prompt
    prompt = `You are a training plan parser. Extract ALL workouts from this running training plan and return them as a JSON array.

CRITICAL: Extract EVERY SINGLE workout from the plan. Do not skip any workouts.

Each workout should have:
- date (YYYY-MM-DD format, if year not specified use ${new Date().getFullYear()})
- type (easy, long_run, tempo, intervals, recovery, race, hills)
- name (workout name as shown)
- description (optional, any workout details)
- distance (in meters - convert km to meters, optional)
- duration (in seconds - convert minutes to seconds, optional)
- pace (optional object with min, max, and avg in decimal min/km, e.g. 5.5 = 5:30/km)
- hrZone (1-5, optional)
- intervals (optional array of objects: { reps, distance, pace, recovery_time, recovery_type })

WORKOUT TYPE RULES:
- Any run labeled "easy" or under 10km at easy pace → "easy"
- Any run over 12km → "long_run"
- Tempo, threshold, or sustained efforts → "tempo"
- Intervals, repeats, fartlek → "intervals"
- Hills or hill repeats → "hills"
- Recovery runs → "recovery"
- Race day or time trial → "race"

Example workout:
{
  "date": "${new Date().getFullYear()}-01-15",
  "type": "intervals",
  "name": "Track Workout",
  "description": "5x1km at threshold pace with 2min jog recovery",
  "distance": 5500,
  "pace": { "min": 3.8, "max": 4.0, "avg": 3.9 },
  "hrZone": 5,
  "intervals": [
    {
      "reps": 5,
      "distance": 1000,
      "pace": 3.9,
      "recovery_time": 120,
      "recovery_type": "jog"
    }
  ]
}

Training Plan Text:
${text}

Return ONLY a valid JSON object with a "workouts" array. Extract ALL workouts - this is critical. No other text.`;
  }

  try {
    console.log('🤖 Calling OpenAI with gpt-4o...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{"workouts": []}');
    const workouts = parsed.workouts || [];

    console.log('✅ Parsed', workouts.length, 'workouts from PDF');

    // Log first few workouts for verification
    if (workouts.length > 0) {
      console.log('📋 First 3 workouts:', JSON.stringify(workouts.slice(0, 3), null, 2));
    }

    return workouts;
  } catch (error) {
    console.error('❌ PDF parsing error:', error);
    throw new Error('Failed to parse PDF training plan. Please check the file format.');
  }
}
