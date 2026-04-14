import { useState } from 'react';
import { User, Target, Calendar, MessageCircle, ChevronRight, Compass } from 'lucide-react';
import { SetupOption } from './OnboardingWizard';

interface WelcomeStepProps {
  onNext: (selectedOptions: SetupOption[]) => void;
  onSkip: () => void;
}

interface SetupOptionConfig {
  id: SetupOption;
  icon: typeof User;
  title: string;
  description: string;
  color: string;
}

const setupOptions: SetupOptionConfig[] = [
  {
    id: 'intent',
    icon: Compass,
    title: 'Define your running focus',
    description: 'Help your AI coach understand your goals',
    color: 'purple',
  },
  {
    id: 'profile',
    icon: User,
    title: 'Set up your profile',
    description: 'Age, weight, running experience & heart rate zones',
    color: 'blue',
  },
  {
    id: 'goal',
    icon: Target,
    title: 'Set a race goal',
    description: 'Target race, finish time & race date',
    color: 'green',
  },
  {
    id: 'plan',
    icon: Calendar,
    title: 'Create a training plan',
    description: 'Import from CSV/PDF or start fresh',
    color: 'purple',
  },
  {
    id: 'coach',
    icon: MessageCircle,
    title: 'Customize your AI coach',
    description: 'Choose coaching style & communication preferences',
    color: 'orange',
  },
];

export default function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  const [selected, setSelected] = useState<SetupOption[]>(['intent', 'profile', 'goal']);

  const toggleOption = (option: SetupOption) => {
    setSelected((prev) =>
      prev.includes(option)
        ? prev.filter((o) => o !== option)
        : [...prev, option]
    );
  };

  const handleSelectAll = () => {
    setSelected(['intent', 'profile', 'goal', 'plan', 'coach']);
  };

  const handleSelectNone = () => {
    setSelected([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Welcome to RunCoach!
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Your AI-powered running coach. Let's get you set up for success.
        </p>
      </div>

      {/* What is RunCoach */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-4">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-2">
          What can RunCoach do for you?
        </h2>
        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
          <li>• Sync and analyze your Strava activities</li>
          <li>• Create and manage personalized training plans</li>
          <li>• Get AI-powered coaching insights and advice</li>
          <li>• Track progress toward your race goals</li>
        </ul>
      </div>

      {/* Setup Options */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            What would you like to set up?
          </h2>
          <div className="flex gap-2 text-xs">
            <button
              onClick={handleSelectAll}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Select all
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={handleSelectNone}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {setupOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = selected.includes(option.id);

            return (
              <button
                key={option.id}
                onClick={() => toggleOption(option.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isSelected
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icon size={20} />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-slate-900 dark:text-white">
                    {option.title}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {option.description}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={onSkip}
          className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 text-sm"
        >
          Skip for now
        </button>
        <button
          onClick={() => onNext(selected)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          {selected.length > 0 ? "Let's go" : 'Continue'}
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
