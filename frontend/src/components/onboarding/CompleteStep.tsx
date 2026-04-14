import { CheckCircle, User, Target, Calendar, MessageCircle, ArrowRight, Sparkles, Compass } from 'lucide-react';
import { SetupOption } from './OnboardingWizard';

interface CompleteStepProps {
  completedSteps: SetupOption[];
  selectedOptions: SetupOption[];
  onFinish: () => void;
}

const stepInfo: Record<SetupOption, { label: string; icon: typeof User; color: string }> = {
  intent: { label: 'Running Focus', icon: Compass, color: 'purple' },
  profile: { label: 'Profile', icon: User, color: 'blue' },
  goal: { label: 'Race Goal', icon: Target, color: 'green' },
  plan: { label: 'Training Plan', icon: Calendar, color: 'purple' },
  coach: { label: 'Coach Preferences', icon: MessageCircle, color: 'orange' },
};

const nextSteps = [
  {
    title: 'Sync your activities',
    description: 'Connect with Strava to import your running history',
    link: '/activities',
  },
  {
    title: 'View your calendar',
    description: 'See your upcoming workouts and training schedule',
    link: '/calendar',
  },
  {
    title: 'Chat with your AI coach',
    description: 'Get personalized advice and training insights',
    link: '/chat',
  },
];

export default function CompleteStep({ completedSteps, selectedOptions, onFinish }: CompleteStepProps) {
  const allCompleted = selectedOptions.length === 0 ||
    selectedOptions.every(opt => completedSteps.includes(opt));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="text-green-600 dark:text-green-400" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {allCompleted ? "You're all set!" : "Setup Complete"}
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          {allCompleted
            ? "Your RunCoach is ready to help you reach your goals."
            : "You can always complete more setup later from your profile."}
        </p>
      </div>

      {/* Setup Summary */}
      {selectedOptions.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
          <h3 className="font-medium text-slate-900 dark:text-white mb-3">
            Setup Summary
          </h3>
          <div className="space-y-2">
            {selectedOptions.map((option) => {
              const info = stepInfo[option];
              const Icon = info.icon;
              const isCompleted = completedSteps.includes(option);

              return (
                <div
                  key={option}
                  className="flex items-center gap-3 text-sm"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    isCompleted
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle size={14} />
                    ) : (
                      <Icon size={14} />
                    )}
                  </div>
                  <span className={isCompleted
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                  }>
                    {info.label}
                  </span>
                  {isCompleted && (
                    <span className="text-green-600 dark:text-green-400 text-xs ml-auto">
                      Completed
                    </span>
                  )}
                  {!isCompleted && (
                    <span className="text-slate-400 text-xs ml-auto">
                      Skipped
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Next Steps */}
      <div>
        <h3 className="font-medium text-slate-900 dark:text-white mb-3">
          What's Next?
        </h3>
        <div className="space-y-2">
          {nextSteps.map((step, index) => (
            <div
              key={index}
              className="flex items-center gap-4 p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium text-sm">
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="font-medium text-slate-900 dark:text-white text-sm">
                  {step.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {step.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Finish Button */}
      <div className="pt-4">
        <button
          onClick={onFinish}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Go to Dashboard
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
