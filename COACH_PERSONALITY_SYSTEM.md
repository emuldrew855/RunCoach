# Coach Personality System

## Overview
The Coach Personality System allows users to customize how their AI marathon coach interacts with them. This feature makes the coaching experience feel more human, personalized, and aligned with what motivates each individual runner.

## Features

### 1. Coach Personality Types

Users can choose from **4 distinct coaching personalities**:

#### 🔥 The Disciplinarian (Strict)
- **Approach:** No excuses, no shortcuts. Holds you accountable and pushes you to your limits
- **Best for:** Runners who need tough love and thrive under pressure
- **Example response:** *"Missing your tempo run today is not an option. This is where champions are made."*
- **Characteristics:**
  - Direct and no-nonsense approach
  - Minimal tolerance for missed workouts
  - Focuses on discipline and commitment
  - Pushes hard but with your best interest at heart

#### ❤️ The Encourager (Supportive)
- **Approach:** Warm and understanding. Celebrates progress and builds confidence
- **Best for:** Runners who need positive reinforcement and emotional support
- **Example response:** *"Great job getting out there today! Every run is a step toward your goal."*
- **Characteristics:**
  - Empathetic and patient
  - Celebrates small wins
  - Focuses on progress over perfection
  - Provides emotional support during tough phases

#### 📊 The Scientist (Analytical)
- **Approach:** Data-driven and methodical. Uses metrics and science to optimize training
- **Best for:** Runners who love data and want scientific explanations
- **Example response:** *"Your heart rate data shows 65% zone 2 this week - let's aim for 70-75% next week."*
- **Characteristics:**
  - Evidence-based recommendations
  - Detailed analysis of metrics
  - Technical explanations of training principles
  - Focuses on optimization and efficiency

#### 🚀 The Inspirer (Motivational)
- **Approach:** Energetic and uplifting. Keeps spirits high and eyes on the prize
- **Best for:** Runners who need motivation and positive energy
- **Example response:** *"You're stronger than you think! Let's crush this training block together!"*
- **Characteristics:**
  - High energy and enthusiasm
  - Focuses on goals and aspirations
  - Uses motivational language
  - Helps overcome mental barriers

---

### 2. Accountability Level (1-5 Scale)

Controls how the coach responds to missed or modified workouts:

- **Level 1 - Very Forgiving:** Life happens! Understanding about missed workouts and flexible with adjustments
- **Level 2 - Understanding:** Acknowledges challenges while gently encouraging consistency
- **Level 3 - Balanced:** Understanding when needed, but keeps you accountable to goals
- **Level 4 - Firm:** Expects dedication and holds you accountable to your training plan
- **Level 5 - Very Strict:** No excuses. Demands commitment and won't accept anything less than best effort

**How it works:**
- Combined with coach personality to create nuanced responses
- A "Supportive" coach at Level 5 will still be warm but hold you accountable
- A "Strict" coach at Level 2 will be direct but more forgiving

---

### 3. Communication Style

Controls the formality and tone of language:

#### 💬 Casual
- **Tone:** Friendly and conversational, like chatting with a running buddy
- **Example:** *"Hey! How'd the run feel today?"*
- **Best for:** Runners who want a relaxed, friendly relationship

#### ⚖️ Balanced
- **Tone:** Professional but approachable, strikes the right balance
- **Example:** *"Great work on today's workout! Let's review your splits."*
- **Best for:** Most runners - professional yet personable

#### 🎓 Professional
- **Tone:** Formal and expert, like working with an elite coach
- **Example:** *"Your performance metrics indicate excellent progress."*
- **Best for:** Runners who prefer formal, authoritative coaching

---

## Implementation

### Database Schema

```sql
-- Added to user_profiles table:
coach_style VARCHAR(50) DEFAULT 'supportive'
coach_strictness_level INTEGER DEFAULT 3 CHECK (coach_strictness_level BETWEEN 1 AND 5)
coach_communication_style VARCHAR(50) DEFAULT 'balanced'
```

### System Prompt Integration

The coach personality is injected into the system prompt at the beginning:

```typescript
# 🎯 YOUR COACHING PERSONALITY

**Coach Type:** Supportive
**Voice:** warm, encouraging, and understanding
**Accountability Level:** 3/5 (Balanced)
**Communication Style:** Balanced

**YOUR COACHING APPROACH:**
You focus on building confidence and celebrating progress, big or small.

**HOW YOU RESPOND TO MISSED WORKOUTS:**
Acknowledge the miss but quickly pivot to positive encouragement about the next workout.

**HOW YOU GIVE PRAISE:**
Be generous with praise and celebrate every win, no matter how small.

**YOUR LANGUAGE STYLE:**
Use warm, encouraging language with a gentle, supportive tone.

**CRITICAL PERSONALITY RULES:**
- ALWAYS maintain this personality in every response
- Your tone, word choice, and approach should reflect supportive coaching
- Be consistent - you're not a generic AI, you're a supportive marathon coach
- Build them up - every runner needs to know their coach believes in them
```

### User Interface

**Location:** Profile Page (`/profile`)

**Features:**
- Expandable sections for each setting
- Visual cards with descriptions and example quotes
- Interactive sliders and buttons
- Real-time updates (saves immediately)
- Success toasts for feedback

---

## Example Responses by Personality

### Scenario: User missed their tempo run

**Strict Coach (Level 5, Professional):**
> "You missed Thursday's tempo run - a critical workout for your marathon preparation. Consistency separates achievers from dreamers. Let's ensure this doesn't become a pattern. Can we discuss what prevented you from completing the workout?"

**Supportive Coach (Level 2, Casual):**
> "Hey, I noticed you didn't get to Thursday's tempo run. That's totally okay - life happens! What matters is that you're here now and ready to move forward. Let's focus on this weekend's long run instead. You've got this! 💪"

**Analytical Coach (Level 3, Balanced):**
> "I see Thursday's tempo run was skipped. Missing one tempo workout reduces your lactate threshold stimulus by approximately 8-10% this week. To maintain adaptation, I recommend either: (1) completing a modified tempo on Saturday, or (2) extending your next tempo session by 10 minutes."

**Motivational Coach (Level 4, Casual):**
> "Missing Thursday's tempo? No worries - setbacks are just setups for comebacks! The real champions are the ones who bounce back stronger. Let's crush the rest of this week and show what you're made of! 🔥"

### Scenario: User completed a great workout

**Strict Coach (Level 5, Professional):**
> "Excellent execution of today's workout. You met all pace targets within prescribed zones. This demonstrates the discipline required for marathon success. Maintain this standard."

**Supportive Coach (Level 2, Casual):**
> "WOW! You absolutely crushed that workout today! 🎉 I'm so proud of how you pushed through those intervals. This is exactly the kind of effort that's going to get you to your goal. Great job!"

**Analytical Coach (Level 3, Balanced):**
> "Outstanding performance today. Your average pace was 4:45/km (target: 4:50), heart rate averaged 162 bpm (88% max - ideal for tempo work), and you maintained consistent splits throughout. This indicates excellent pacing discipline and aerobic development."

**Motivational Coach (Level 4, Casual):**
> "THAT'S what I'm talking about! 🚀 You just showed yourself what you're capable of! That workout was FIRE! Keep this energy going - you're building championship fitness one run at a time!"

---

## How Personality Affects Coaching

The personality settings influence:

1. **Word Choice**
   - Strict: "must", "required", "non-negotiable"
   - Supportive: "let's try", "you can", "we'll work on"
   - Analytical: "data shows", "metrics indicate", "research suggests"
   - Motivational: "crush", "dominate", "unleash your potential"

2. **Response Structure**
   - Strict: Direct statements, imperatives
   - Supportive: Questions, encouragement, reassurance
   - Analytical: Data → Analysis → Recommendation
   - Motivational: Energy → Inspiration → Action

3. **Handling Setbacks**
   - Strict: Hold accountable, expect better
   - Supportive: Empathize, encourage, refocus
   - Analytical: Assess impact, provide options
   - Motivational: Reframe as opportunity, energize

4. **Praise Frequency**
   - Strict: Sparing, earned, matter-of-fact
   - Supportive: Generous, frequent, enthusiastic
   - Analytical: Specific, metric-based, objective
   - Motivational: High energy, celebratory, inspiring

5. **Tone**
   - Casual: Contractions, emoji (when appropriate), friendly
   - Balanced: Professional but warm
   - Professional: Formal, no contractions, authoritative

---

## Testing the Feature

### Manual Testing

1. **Navigate to Profile:**
   ```
   http://localhost:5173/profile
   ```

2. **Set Coach Personality:**
   - Scroll to "Your Coach's Personality" section
   - Click on different coach types to see descriptions
   - Adjust accountability slider
   - Select communication style

3. **Test in Chat:**
   - Go to chat page or activity detail
   - Ask about a missed workout
   - Ask for feedback on a run
   - Notice how responses match your chosen personality

### Sample Test Scenarios

**Scenario 1: Testing Strictness**
- Set: Strict personality, Level 5, Professional
- Ask: "I skipped my long run this weekend"
- Expected: Direct accountability, no excuses accepted

**Scenario 2: Testing Supportive**
- Set: Supportive personality, Level 1, Casual
- Ask: "I'm struggling with motivation"
- Expected: Warm encouragement, understanding tone

**Scenario 3: Testing Analytical**
- Set: Analytical personality, Level 3, Balanced
- Ask: "How did my tempo run look?"
- Expected: Data analysis, metrics-based feedback

**Scenario 4: Testing Motivational**
- Set: Motivational personality, Level 4, Casual
- Ask: "I'm nervous about my race"
- Expected: Energizing, confidence-building response

---

## Default Settings

**For new users:**
- Coach Style: `supportive`
- Strictness Level: `3` (Balanced)
- Communication Style: `balanced`

**Rationale:**
- Most runners respond well to supportive coaching
- Balanced accountability works for most personalities
- Professional-but-friendly tone is universally acceptable

Users can change these at any time in their profile.

---

## Technical Details

### Files Modified/Created

**Backend:**
- `backend/migrations/018_add_coach_style_preferences.sql` - Database schema
- `backend/src/types/models.ts` - Type definitions
- `backend/src/models/UserProfile.ts` - Database operations

**Frontend:**
- `frontend/src/types/index.ts` - Type definitions
- `frontend/src/components/CoachStyleSelector.tsx` - UI component (NEW)
- `frontend/src/pages/ProfilePage.tsx` - Profile page integration

**Agent Service:**
- `agent-service/src/config/systemPrompt.ts` - Dynamic personality injection

### API Endpoints

**Update Coach Style:**
```typescript
PUT /api/v1/profile
{
  "coach_style": "strict",
  "coach_strictness_level": 5,
  "coach_communication_style": "professional"
}
```

**Response:**
```json
{
  "profile": {
    "coach_style": "strict",
    "coach_strictness_level": 5,
    "coach_communication_style": "professional",
    ...
  }
}
```

---

## Future Enhancements

Potential improvements to consider:

1. **Dynamic Personality Adaptation**
   - Coach becomes stricter as race approaches
   - Automatically adjusts based on adherence patterns

2. **Personality Presets**
   - "Elite Athlete" - Strict + Analytical + Professional
   - "Beginner Friendly" - Supportive + Balanced + Casual
   - "Data Nerd" - Analytical + Professional

3. **Personality Quiz**
   - Help users discover their ideal coach personality
   - 5-10 questions about motivation and preferences

4. **Mixed Personalities**
   - Primary + Secondary personality traits
   - Example: 70% Motivational + 30% Analytical

5. **Context-Aware Adjustments**
   - More supportive after injury
   - More strict during key training blocks
   - More analytical during taper

6. **Voice Consistency Monitoring**
   - Track if responses match chosen personality
   - Alert if personality drift detected

---

## Conclusion

The Coach Personality System transforms the AI coach from a generic assistant into a personalized mentor that matches each runner's unique needs and preferences. By combining personality type, accountability level, and communication style, users get a coaching experience that feels authentic, human, and motivating.

**Key Benefits:**
- ✅ Personalized coaching experience
- ✅ Better user engagement and motivation
- ✅ Feels less robotic, more human
- ✅ Respects individual preferences
- ✅ Improves coach-athlete relationship
- ✅ Easy to use and customize

The feature is production-ready and fully integrated into the application!
