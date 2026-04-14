import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { profileAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Trophy, TrendingUp, Heart, Compass } from 'lucide-react';
import { RunnerType } from '../../types';

interface IntentStepProps {
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
}

interface RunnerTypeOption {
  type: RunnerType;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const runnerTypeOptions: RunnerTypeOption[] = [
  {
    type: 'architect',
    title: 'Architect',
    subtitle: 'Race-Focused',
    description: "I'm training for a specific race with a time goal. I want structured plans and targeted feedback.",
    icon: <Trophy size={24} />,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  {
    type: 'builder',
    title: 'Builder',
    subtitle: 'Improvement-Focused',
    description: "I want to improve my running - faster, farther, stronger. I'm building my fitness progressively.",
    icon: <TrendingUp size={24} />,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    type: 'maintainer',
    title: 'Maintainer',
    subtitle: 'Fitness-Focused',
    description: "I run to stay fit and healthy. No specific goals - I just want to keep moving and enjoy it.",
    icon: <Heart size={24} />,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
];

export default function IntentStep({ onComplete, onSkip, onBack }: IntentStepProps) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<RunnerType | null>(null);

  const mutation = useMutation({
    mutationFn: (runnerType: RunnerType) => profileAPI.updateProfile({ runner_type: runnerType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Running focus saved!');
      onComplete();
    },
    onError: () => {
      toast.error('Failed to save preference');
    },
  });

  const handleSubmit = () => {
    if (!selectedType) {
      toast.error('Please select your running focus');
      return;
    }
    mutation.mutate(selectedType);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Compass className="text-purple-600 dark:text-purple-400" size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            What's your running focus?
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            This helps your AI coach give you the right guidance
          </p>
        </div>
      </div>

      {/* Runner Type Cards */}
      <div className="space-y-3">
        {runnerTypeOptions.map((option) => (
          <button
            key={option.type}
            onClick={() => setSelectedType(option.type)}
            className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
              selectedType === option.type
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-lg ${option.bgColor} flex items-center justify-center flex-shrink-0`}>
                <span className={option.color}>{option.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {option.title}
                  </h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${option.bgColor} ${option.color}`}>
                    {option.subtitle}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {option.description}
                </p>
              </div>
              {selectedType === option.type && (
                <div className="flex-shrink-0">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Info Note */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-sm text-slate-600 dark:text-slate-400">
        <strong>Don't worry</strong> - you can change this anytime from your profile settings.
        Your AI coach will adapt its guidance based on your focus.
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
            Skip (auto-detect)
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !selectedType}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {mutation.isPending ? 'Saving...' : 'Save & Continue'}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
