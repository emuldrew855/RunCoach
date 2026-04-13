import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { profileAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, MessageCircle, Zap, Heart, BarChart3, TrendingUp } from 'lucide-react';

interface CoachStepProps {
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
}

type CoachStyle = 'strict' | 'supportive' | 'analytical' | 'motivational';
type CommunicationStyle = 'casual' | 'balanced' | 'professional';

const coachStyles = [
  {
    value: 'strict' as const,
    label: 'The Disciplinarian',
    icon: Zap,
    color: 'orange',
    description: 'No excuses. Holds you accountable.',
  },
  {
    value: 'supportive' as const,
    label: 'The Encourager',
    icon: Heart,
    color: 'pink',
    description: 'Warm, understanding, celebrates progress.',
  },
  {
    value: 'analytical' as const,
    label: 'The Scientist',
    icon: BarChart3,
    color: 'blue',
    description: 'Data-driven, metrics-focused.',
  },
  {
    value: 'motivational' as const,
    label: 'The Inspirer',
    icon: TrendingUp,
    color: 'green',
    description: 'Energetic, uplifting, goal-focused.',
  },
];

const communicationStyles = [
  { value: 'casual' as const, label: 'Casual', description: 'Like a running buddy' },
  { value: 'balanced' as const, label: 'Balanced', description: 'Professional but friendly' },
  { value: 'professional' as const, label: 'Professional', description: 'Formal and expert' },
];

export default function CoachStep({ onComplete, onSkip, onBack }: CoachStepProps) {
  const queryClient = useQueryClient();
  const [coachStyle, setCoachStyle] = useState<CoachStyle>('supportive');
  const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyle>('balanced');

  const mutation = useMutation({
    mutationFn: (data: any) => profileAPI.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Coach preferences saved!');
      onComplete();
    },
    onError: () => {
      toast.error('Failed to save preferences');
    },
  });

  const handleSubmit = () => {
    mutation.mutate({
      coach_style: coachStyle,
      coach_strictness_level: 3,
      coach_communication_style: communicationStyle,
    });
  };

  const colorClasses = {
    orange: {
      selected: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20',
      icon: 'bg-orange-500 text-white',
      iconUnselected: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    },
    pink: {
      selected: 'border-pink-500 bg-pink-50 dark:bg-pink-900/20',
      icon: 'bg-pink-500 text-white',
      iconUnselected: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
    },
    blue: {
      selected: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
      icon: 'bg-blue-500 text-white',
      iconUnselected: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    },
    green: {
      selected: 'border-green-500 bg-green-50 dark:bg-green-900/20',
      icon: 'bg-green-500 text-white',
      iconUnselected: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <MessageCircle className="text-orange-600 dark:text-orange-400" size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Customize your AI coach
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Choose the coaching style that works best for you.
          </p>
        </div>
      </div>

      {/* Coach Style Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Coach Personality
        </label>
        <div className="grid grid-cols-2 gap-3">
          {coachStyles.map((style) => {
            const Icon = style.icon;
            const colors = colorClasses[style.color as keyof typeof colorClasses];
            const isSelected = coachStyle === style.value;

            return (
              <button
                key={style.value}
                onClick={() => setCoachStyle(style.value)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? colors.selected
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isSelected ? colors.icon : colors.iconUnselected
                  }`}>
                    <Icon size={16} />
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white text-sm">
                    {style.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {style.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Communication Style */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Communication Style
        </label>
        <div className="flex gap-2">
          {communicationStyles.map((style) => (
            <button
              key={style.value}
              onClick={() => setCommunicationStyle(style.value)}
              className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                communicationStyle === style.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="font-medium text-slate-900 dark:text-white text-sm">
                {style.label}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {style.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
        >
          <ChevronLeft size={18} />
          Back
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 text-sm"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
          >
            {mutation.isPending ? 'Saving...' : 'Save & Continue'}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
