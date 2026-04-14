import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingPlanAPI, SmartPlanParams, SmartPlanPreview } from '../../services/api';
import { profileAPI } from '../../services/api';
import toast from 'react-hot-toast';
import {
  ChevronLeft,
  ChevronRight,
  Target,
  Calendar,
  Clock,
  Zap,
  Trophy,
  TrendingUp,
  Heart,
  Activity,
  CheckCircle,
  Loader2,
  Info,
} from 'lucide-react';

interface SmartPlanWizardProps {
  onComplete: () => void;
  onBack?: () => void;
  compact?: boolean;  // For onboarding vs dedicated page
}

type GoalType = '5k' | '10k' | 'half_marathon' | 'marathon' | 'general';

interface WizardState {
  step: 1 | 2 | 3 | 4;
  goalType: GoalType | null;
  targetWeeklyKm: number | 'baseline';
  daysPerWeek: 3 | 4 | 5 | 6;
  raceDate: string;
  targetTimeSeconds: number | null;
  longRunDay: 'saturday' | 'sunday';
  planName: string;
}

const goalOptions: { value: GoalType; label: string; description: string; icon: typeof Trophy; color: string; bgColor: string }[] = [
  { value: '5k', label: '5K', description: 'Train for a 5 kilometer race', icon: Zap, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  { value: '10k', label: '10K', description: 'Train for a 10 kilometer race', icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  { value: 'half_marathon', label: 'Half Marathon', description: '21.1km race preparation', icon: Trophy, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  { value: 'marathon', label: 'Marathon', description: 'Full 42.2km marathon training', icon: Trophy, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  { value: 'general', label: 'General Fitness', description: 'Maintain fitness without a race', icon: Heart, color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
];

const daysOptions = [3, 4, 5, 6] as const;

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseTimeToSeconds(timeStr: string): number | null {
  const parts = timeStr.split(':').map(Number);
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

function formatPace(paceMinKm: number): string {
  const minutes = Math.floor(paceMinKm);
  const seconds = Math.round((paceMinKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

export default function SmartPlanWizard({ onComplete, onBack, compact = false }: SmartPlanWizardProps) {
  const queryClient = useQueryClient();

  const [state, setState] = useState<WizardState>({
    step: 1,
    goalType: null,
    targetWeeklyKm: 'baseline',
    daysPerWeek: 4,
    raceDate: '',
    targetTimeSeconds: null,
    longRunDay: 'sunday',
    planName: '',
  });

  const [targetTimeInput, setTargetTimeInput] = useState('');
  const [preview, setPreview] = useState<SmartPlanPreview | null>(null);

  // Get user profile for baseline data
  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await profileAPI.getProfile();
      return response.data;
    },
  });

  const typicalWeeklyMileage = profileData?.profile?.typical_weekly_mileage;

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async (params: SmartPlanParams) => {
      const response = await trainingPlanAPI.previewSmartPlan(params);
      return response.data;
    },
    onSuccess: (data) => {
      setPreview(data);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to preview plan');
    },
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async (params: SmartPlanParams) => {
      const response = await trainingPlanAPI.generateSmartPlan(params);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trainingPlans'] });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      toast.success(`Created "${data.plan.name}" with ${data.workoutCount} workouts!`);
      onComplete();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate plan');
    },
  });

  // Fetch preview when entering step 4
  useEffect(() => {
    if (state.step === 4 && state.goalType) {
      const params: SmartPlanParams = {
        goalType: state.goalType,
        targetWeeklyKm: state.targetWeeklyKm,
        daysPerWeek: state.daysPerWeek,
        raceDate: state.raceDate || undefined,
        targetTimeSeconds: state.targetTimeSeconds || undefined,
        longRunDay: state.longRunDay,
      };
      previewMutation.mutate(params);
    }
  }, [state.step]);

  const handleNext = () => {
    if (state.step < 4) {
      setState(prev => ({ ...prev, step: (prev.step + 1) as 1 | 2 | 3 | 4 }));
    }
  };

  const handleBack = () => {
    if (state.step > 1) {
      setState(prev => ({ ...prev, step: (prev.step - 1) as 1 | 2 | 3 | 4 }));
    } else if (onBack) {
      onBack();
    }
  };

  const handleGenerate = () => {
    if (!state.goalType) return;

    const params: SmartPlanParams = {
      goalType: state.goalType,
      targetWeeklyKm: state.targetWeeklyKm,
      daysPerWeek: state.daysPerWeek,
      raceDate: state.raceDate || undefined,
      targetTimeSeconds: state.targetTimeSeconds || undefined,
      longRunDay: state.longRunDay,
      planName: state.planName || undefined,
    };
    generateMutation.mutate(params);
  };

  const handleTargetTimeChange = (value: string) => {
    setTargetTimeInput(value);
    const seconds = parseTimeToSeconds(value);
    setState(prev => ({ ...prev, targetTimeSeconds: seconds }));
  };

  const canProceed = () => {
    switch (state.step) {
      case 1: return state.goalType !== null;
      case 2: return state.daysPerWeek >= 3 && state.daysPerWeek <= 6;
      case 3: return true; // Race details are optional
      case 4: return preview !== null;
      default: return false;
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3, 4].map((step) => (
        <div
          key={step}
          className={`w-2 h-2 rounded-full transition-colors ${
            step === state.step
              ? 'bg-purple-600 dark:bg-purple-400'
              : step < state.step
              ? 'bg-purple-300 dark:bg-purple-600'
              : 'bg-slate-200 dark:bg-slate-700'
          }`}
        />
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">What's your goal?</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Select the type of training you want</p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {goalOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = state.goalType === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setState(prev => ({ ...prev, goalType: option.value }))}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                isSelected
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${option.bgColor} flex items-center justify-center`}>
                  <Icon size={20} className={option.color} />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900 dark:text-white">{option.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{option.description}</div>
                </div>
                {isSelected && (
                  <CheckCircle className="text-purple-500" size={20} />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Training Volume</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">How much and how often?</p>
      </div>

      {/* Days per week */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Days per week
        </label>
        <div className="grid grid-cols-4 gap-2">
          {daysOptions.map((days) => (
            <button
              key={days}
              onClick={() => setState(prev => ({ ...prev, daysPerWeek: days }))}
              className={`py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                state.daysPerWeek === days
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
              }`}
            >
              {days}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {state.daysPerWeek === 3 && 'Minimal commitment, great for beginners'}
          {state.daysPerWeek === 4 && 'Balanced approach, most popular choice'}
          {state.daysPerWeek === 5 && 'Solid training load for intermediate runners'}
          {state.daysPerWeek === 6 && 'High volume for experienced runners'}
        </p>
      </div>

      {/* Target weekly km */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Target weekly volume
        </label>
        <div className="space-y-2">
          <button
            onClick={() => setState(prev => ({ ...prev, targetWeeklyKm: 'baseline' }))}
            className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
              state.targetWeeklyKm === 'baseline'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">Use my current baseline</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {typicalWeeklyMileage
                    ? `Based on your profile: ~${typicalWeeklyMileage}km/week`
                    : 'We\'ll calculate based on your activity history'}
                </div>
              </div>
              {state.targetWeeklyKm === 'baseline' && <CheckCircle className="text-purple-500" size={20} />}
            </div>
          </button>

          <div className="relative">
            <input
              type="number"
              min={10}
              max={200}
              placeholder="Or enter target km/week"
              value={state.targetWeeklyKm === 'baseline' ? '' : state.targetWeeklyKm}
              onChange={(e) => setState(prev => ({
                ...prev,
                targetWeeklyKm: e.target.value ? Number(e.target.value) : 'baseline'
              }))}
              className={`w-full px-3 py-3 border-2 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                state.targetWeeklyKm !== 'baseline'
                  ? 'border-purple-500'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">km/week</span>
          </div>
        </div>
      </div>

      {/* Long run day */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Preferred long run day
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['saturday', 'sunday'] as const).map((day) => (
            <button
              key={day}
              onClick={() => setState(prev => ({ ...prev, longRunDay: day }))}
              className={`py-2 px-4 rounded-lg border-2 font-medium capitalize transition-all ${
                state.longRunDay === day
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Race Details</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Optional - helps with taper and pacing</p>
      </div>

      {/* Race date */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          <Calendar size={14} className="inline mr-1" />
          Race date (optional)
        </label>
        <input
          type="date"
          value={state.raceDate}
          onChange={(e) => setState(prev => ({ ...prev, raceDate: e.target.value }))}
          min={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          If set, we'll include a taper period before race day
        </p>
      </div>

      {/* Target time */}
      {state.goalType !== 'general' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            <Clock size={14} className="inline mr-1" />
            Target finish time (optional)
          </label>
          <input
            type="text"
            value={targetTimeInput}
            onChange={(e) => handleTargetTimeChange(e.target.value)}
            placeholder={state.goalType === 'marathon' || state.goalType === 'half_marathon' ? 'H:MM:SS' : 'MM:SS'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            If set, we'll calculate pace targets for each workout type
          </p>
        </div>
      )}

      {/* Plan name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          <Target size={14} className="inline mr-1" />
          Plan name (optional)
        </label>
        <input
          type="text"
          value={state.planName}
          onChange={(e) => setState(prev => ({ ...prev, planName: e.target.value }))}
          placeholder={`My ${state.goalType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || ''} Plan`}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Info size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            All fields on this page are optional. Skip if you're not training for a specific race.
          </p>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Review Your Plan</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Here's what we'll create for you</p>
      </div>

      {previewMutation.isPending ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-purple-500" size={32} />
        </div>
      ) : preview ? (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="text-xs text-slate-500 dark:text-slate-400">Duration</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">
                {preview.summary.totalWeeks} weeks
              </div>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Workouts</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">
                {preview.summary.totalWorkouts}
              </div>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="text-xs text-slate-500 dark:text-slate-400">Starting Volume</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">
                {preview.summary.startingWeeklyKm || 0} km/wk
              </div>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="text-xs text-slate-500 dark:text-slate-400">Peak Volume</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">
                {preview.summary.peakWeeklyKm || 0} km/wk
              </div>
            </div>
          </div>

          {/* Pace targets if available */}
          {preview.summary.paceTargets && (
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">Pace Targets & HR Zones</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-purple-600 dark:text-purple-400">Easy (Z2):</span>{' '}
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatPace(preview.summary.paceTargets.easy.min)} - {formatPace(preview.summary.paceTargets.easy.max)}
                  </span>
                </div>
                <div>
                  <span className="text-purple-600 dark:text-purple-400">Tempo (Z3):</span>{' '}
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatPace(preview.summary.paceTargets.tempo.min)} - {formatPace(preview.summary.paceTargets.tempo.max)}
                  </span>
                </div>
                <div>
                  <span className="text-purple-600 dark:text-purple-400">Intervals (Z4):</span>{' '}
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatPace(preview.summary.paceTargets.interval.min)} - {formatPace(preview.summary.paceTargets.interval.max)}
                  </span>
                </div>
                <div>
                  <span className="text-purple-600 dark:text-purple-400">Long Run (Z2):</span>{' '}
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatPace(preview.summary.paceTargets.longRun.min)} - {formatPace(preview.summary.paceTargets.longRun.max)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* HR Zone legend when no pace targets */}
          {!preview.summary.paceTargets && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">HR Zone Targets</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                <div>Easy/Long: Zone 2 (aerobic)</div>
                <div>Tempo: Zone 3 (threshold)</div>
                <div>Intervals: Zone 4 (VO2max)</div>
                <div>Recovery: Zone 1</div>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                Add a target finish time in Step 3 for personalized pace targets.
              </p>
            </div>
          )}

          {/* Week preview (first 3 weeks) */}
          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sample Weeks</div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {preview.weeks.slice(0, 3).map((week) => (
                <div key={week.weekNumber} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Week {week.weekNumber}
                      {week.isStepBack && <span className="ml-1 text-blue-500">(Recovery)</span>}
                      {week.isTaper && <span className="ml-1 text-purple-500">(Taper)</span>}
                    </span>
                    <span className="text-xs text-slate-500">{week.totalKm || 0} km</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {week.workouts.map((workout, idx) => (
                      <span
                        key={idx}
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          workout.type === 'long' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                          workout.type === 'tempo' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                          workout.type === 'intervals' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                          'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                        title={`${workout.name}${workout.hrZone ? ` • Z${workout.hrZone}` : ''}${workout.paceTarget ? ` • ${workout.paceTarget}` : ''}`}
                      >
                        {workout.dayOfWeek}: {isNaN(workout.distanceKm) ? '?' : workout.distanceKm}km
                        {workout.hrZone && <span className="ml-0.5 opacity-70">Z{workout.hrZone}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {preview.summary.hasTaper && (
            <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Includes {preview.summary.taperWeeks}-week taper before race day
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          Failed to generate preview. Please go back and try again.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Activity className="text-purple-600 dark:text-purple-400" size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Smart Plan Generator
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Creates a personalized plan based on your fitness
          </p>
        </div>
      </div>

      {renderStepIndicator()}

      {/* Step content */}
      <div className="min-h-[300px]">
        {state.step === 1 && renderStep1()}
        {state.step === 2 && renderStep2()}
        {state.step === 3 && renderStep3()}
        {state.step === 4 && renderStep4()}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
        >
          <ChevronLeft size={18} />
          Back
        </button>
        {state.step < 4 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            Continue
            <ChevronRight size={18} />
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!canProceed() || generateMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Creating...
              </>
            ) : (
              <>
                Create Plan
                <CheckCircle size={18} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
