# Frontend Documentation

## Overview

The frontend is a React single-page application built with Vite and TypeScript, styled with Tailwind CSS.

**Location**: `frontend/`
**Port**: 5173 (dev)
**Entry Point**: `src/main.tsx`

## Directory Structure

```
frontend/src/
├── components/       # Reusable UI components
│   ├── activity/     # Activity-related components
│   ├── chat/         # Chat interface components
│   ├── coaching/     # Coaching insight cards
│   ├── common/       # Shared components
│   ├── dashboard/    # Dashboard widgets
│   ├── goals/        # Race goal components
│   └── training/     # Training plan components
├── contexts/         # React contexts
├── hooks/            # Custom hooks
├── pages/            # Route components
├── services/         # API client
├── types/            # TypeScript interfaces
└── utils/            # Helper functions
```

## Pages (16 total)

### DashboardPage.tsx
Main landing page after login.
- Coach's Note (top priority)
- Training Status Card
- Weekly Load Analysis
- Recent Activities
- Upcoming Workouts
- Race Goal (compact)

### ActivityDetailPage.tsx
Detailed view of a single activity (debrief format).
- Activity stats (distance, duration, pace, HR)
- Execution Analysis with score
- Pacing Analysis Card
- HR Analysis Card
- Compliance Card
- Coach's Take with AI feedback
- "Discuss with Coach" button

### ChatPage.tsx
AI coaching conversation interface.
- Conversation list sidebar
- Message thread with markdown rendering
- Streaming response display
- Context-aware conversations
- Smart title generation

### CalendarPage.tsx
Full training calendar view.
- Monthly calendar grid
- Drag-and-drop workout rescheduling
- Color-coded workout types
- Execution indicators
- Weekly totals
- Peak/taper week highlighting

### ProfilePage.tsx
User settings and preferences.
- Coach personality selection
- Unit preferences (metric/imperial)
- HR zone customization
- Week start preference
- Strava connection status

### ActivitiesPage.tsx
List of all synced activities.
- Sortable/filterable table
- Activity type icons
- Quick stats display
- Link to detail pages

### GoalsPage.tsx
Race goal management.
- Active goal card
- Goal progress tracking
- Past goals history
- Create/edit goal form

### TrainingPlanPage.tsx
Training plan management.
- Plan overview
- Import CSV/PDF
- Plan progress stats
- Workout list view

### LoginPage.tsx
Strava OAuth login.
- Connect with Strava button
- OAuth redirect handling
- JWT token storage

## Key Components (37 total)

### Activity Components

#### ExecutionScoreCard.tsx
Displays workout execution score with visual gauge.
```tsx
<ExecutionScoreCard
  score={87}
  verdict="Good"
  breakdown={{
    pace: 92,
    distance: 100,
    hrZone: 65,
    consistency: 88
  }}
/>
```

#### PacingAnalysisCard.tsx
Shows pace consistency and split analysis.
- Pace consistency percentage
- Negative/positive split indicator
- Per-km pace chart
- Target vs actual comparison

#### HRAnalysisCard.tsx
Heart rate behavior analysis.
- Average HR and zone
- Zone drift percentage
- Zone stability score
- Time in each zone

#### ComplianceCard.tsx
Plan compliance summary.
- Distance completion
- Pace deviation
- HR zone accuracy
- Overall compliance status

#### CoachTakeCard.tsx
AI-generated coaching feedback.
- Strengths identified
- Areas for improvement
- Personality-adjusted tone
- "Discuss with Coach" link

### Coaching Components

#### CoachInsightCard.tsx
Daily proactive coaching insight (top of dashboard).
```tsx
<CoachInsightCard
  insight="You're 2% behind on volume this week..."
  priority="medium"
  actions={['View Details', 'Dismiss']}
/>
```

#### TrainingStatusCard.tsx
Overall training status indicator.
- ON_TRACK / CAUTION / AT_RISK status
- Current training phase
- Volume progress bar
- Execution accuracy bar

#### WeeklyLoadCard.tsx
Combined weekly volume and intensity analysis.
- Volume vs plan comparison
- Intensity distribution
- HR zone breakdown
- Week-over-week change

### Training Components

#### WorkoutCalendar.tsx
Interactive training calendar.
- react-big-calendar integration
- Drag-and-drop rescheduling
- Color-coded workout types
- Execution indicators
- Weekly totals calculation
- Peak/taper week highlighting
- Carb-loading indicators

#### WorkoutCard.tsx
Individual workout display.
- Workout type badge
- Target metrics
- Completion status
- Execution score (if completed)

#### WeeklyExecutionCard.tsx
Week's execution summary.
- Workout list with scores
- Average execution score
- Issue highlighting
- Quick feedback per workout

### Chat Components

#### ChatMessage.tsx
Individual message display.
- User vs assistant styling
- Markdown rendering
- Timestamp display
- Loading state

#### ChatInput.tsx
Message input field.
- Auto-resize textarea
- Send button
- Loading state
- Enter to send

#### ConversationList.tsx
Sidebar conversation list.
- Conversation titles
- Last message preview
- Active conversation highlight
- Delete conversation option

### Common Components

| Component | Purpose |
|-----------|---------|
| Header.tsx | Navigation header |
| Sidebar.tsx | Main navigation |
| LoadingSpinner.tsx | Loading indicator |
| ErrorBoundary.tsx | Error handling |
| ProtectedRoute.tsx | Auth guard |
| Modal.tsx | Modal dialogs |
| Button.tsx | Styled buttons |
| Card.tsx | Card container |
| Badge.tsx | Status badges |
| Tooltip.tsx | Hover tooltips |

## Contexts

### AuthContext.tsx
Manages authentication state.
```typescript
interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}
```

### PreferencesContext.tsx
User preferences with unit conversion.
```typescript
interface PreferencesContextValue {
  units: 'metric' | 'imperial';
  weekStart: 'sunday' | 'monday';
  convertDistance: (meters: number) => number;
  convertPace: (minPerKm: number) => number;
  formatDistance: (meters: number) => string;
  formatPace: (minPerKm: number) => string;
}
```

### ThemeContext.tsx
Dark mode toggle.
```typescript
interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
}
```

## API Service (`services/api.ts`)

Centralized API client with typed functions:

```typescript
// Activities
export const activitiesAPI = {
  getAll: () => api.get<Activity[]>('/activities'),
  getById: (id: number) => api.get<Activity>(`/activities/${id}`),
  sync: () => api.post('/activities/sync'),
  getInsights: (id: number) => api.get<DailyInsight>(`/activities/${id}/insights`),
  recomputeInsights: (id: number) => api.post(`/activities/${id}/recompute-insights`),
};

// Workouts
export const workoutsAPI = {
  getAll: (params?: WorkoutParams) => api.get<Workout[]>('/workouts', { params }),
  create: (data: CreateWorkout) => api.post<Workout>('/workouts', data),
  update: (id: number, data: UpdateWorkout) => api.put(`/workouts/${id}`, data),
  delete: (id: number) => api.delete(`/workouts/${id}`),
  shift: (id: number, newDate: string) => api.post(`/workouts/${id}/shift`, { newDate }),
};

// Chat
export const chatAPI = {
  getConversations: () => api.get<Conversation[]>('/chat/conversations'),
  createConversation: (data: CreateConversation) => api.post('/chat/conversations', data),
  sendMessage: (conversationId: number, message: string) => {
    // Returns SSE stream
  },
};

// Coaching
export const coachingAPI = {
  getDailyInsight: () => api.get<CoachInsight>('/coaching/daily-insight'),
  getWeeklySummary: () => api.get<WeeklySummary>('/coaching/weekly-summary'),
  getAlerts: () => api.get<Alert[]>('/coaching/alerts'),
};
```

## State Management

### React Query
Used for server state (data fetching):
```typescript
// Example usage
const { data: activities, isLoading } = useQuery({
  queryKey: ['activities'],
  queryFn: () => activitiesAPI.getAll(),
});

const mutation = useMutation({
  mutationFn: (data) => workoutsAPI.create(data),
  onSuccess: () => queryClient.invalidateQueries(['workouts']),
});
```

### Context API
Used for client state:
- Authentication (AuthContext)
- User preferences (PreferencesContext)
- Theme (ThemeContext)

### Session Storage
Used for temporary context passing:
- Weekly analysis context (calendar → chat)
- Activity context (detail → chat)

## Routing

React Router v6 with protected routes:

```typescript
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/auth/callback" element={<AuthCallback />} />

  <Route element={<ProtectedRoute />}>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/activities" element={<ActivitiesPage />} />
    <Route path="/activities/:id" element={<ActivityDetailPage />} />
    <Route path="/calendar" element={<CalendarPage />} />
    <Route path="/chat" element={<ChatPage />} />
    <Route path="/chat/:conversationId" element={<ChatPage />} />
    <Route path="/goals" element={<GoalsPage />} />
    <Route path="/training-plan" element={<TrainingPlanPage />} />
    <Route path="/profile" element={<ProfilePage />} />
  </Route>
</Routes>
```

## Styling

### Tailwind CSS
Utility-first CSS framework with custom configuration:
- Custom color palette
- Dark mode support
- Responsive breakpoints
- Typography plugin for markdown

### Dark Mode
Implemented via CSS classes:
```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
```

### Markdown Rendering
react-markdown with prose classes:
```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  className="prose prose-sm dark:prose-invert max-w-none"
>
  {content}
</ReactMarkdown>
```

## Key Patterns

### Loading States
```tsx
if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorDisplay error={error} />;
return <Content data={data} />;
```

### Form Handling
```tsx
const [formData, setFormData] = useState(initialState);

const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  await mutation.mutateAsync(formData);
};
```

### SSE Streaming
Manual handling for chat responses:
```typescript
const eventSource = new EventSource(`${API_URL}/chat/stream?...`);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  setMessages(prev => [...prev, data]);
};
```

## Types (`types/index.ts`)

Key interfaces shared with backend:

```typescript
interface Activity {
  id: number;
  name: string;
  type: string;
  distance: number;
  moving_time: number;
  average_speed: number;
  average_heartrate: number;
  start_date: string;
  splits_metric?: Split[];
}

interface Workout {
  id: number;
  scheduled_date: string;
  workout_type: WorkoutType;
  target_distance: number;
  target_pace_min: number;
  target_pace_max: number;
  target_hr_zone: number;
  completion_status: CompletionStatus;
}

interface DailyInsight {
  pacing: PacingAnalysis;
  hrBehavior: HRBehavior;
  effort: EffortAnalysis;
  compliance: ComplianceAnalysis;
  coachingPoints: CoachingPoints;
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| VITE_API_URL | Backend API URL |
| VITE_STRAVA_CLIENT_ID | Strava OAuth client ID |

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production
npm run lint     # Run ESLint
```

## Performance Optimizations

1. **Code Splitting**: Route-based lazy loading
2. **React Query Caching**: Reduces API calls
3. **Memoization**: useMemo/useCallback for expensive operations
4. **Virtual Lists**: For long activity lists
5. **Image Optimization**: Lazy loading for images
