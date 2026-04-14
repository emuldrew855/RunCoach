import { useState } from 'react';
import { X } from 'lucide-react';
import WelcomeStep from './WelcomeStep';
import IntentStep from './IntentStep';
import ProfileStep from './ProfileStep';
import GoalStep from './GoalStep';
import PlanStep from './PlanStep';
import CoachStep from './CoachStep';
import CompleteStep from './CompleteStep';

export type SetupOption = 'intent' | 'profile' | 'goal' | 'plan' | 'coach';

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

type Step = 'welcome' | 'intent' | 'profile' | 'goal' | 'plan' | 'coach' | 'complete';

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [selectedOptions, setSelectedOptions] = useState<SetupOption[]>([]);
  const [completedSteps, setCompletedSteps] = useState<SetupOption[]>([]);
  const [stepIndex, setStepIndex] = useState(0);

  // Get the ordered list of steps based on selected options
  const getStepOrder = (): Step[] => {
    const steps: Step[] = ['welcome'];
    if (selectedOptions.includes('intent')) steps.push('intent');
    if (selectedOptions.includes('profile')) steps.push('profile');
    if (selectedOptions.includes('goal')) steps.push('goal');
    if (selectedOptions.includes('plan')) steps.push('plan');
    if (selectedOptions.includes('coach')) steps.push('coach');
    steps.push('complete');
    return steps;
  };

  const handleWelcomeNext = (options: SetupOption[]) => {
    setSelectedOptions(options);
    if (options.length === 0) {
      // No options selected, go straight to complete
      setCurrentStep('complete');
    } else {
      // Go to first selected option
      setCurrentStep(options[0]);
      setStepIndex(1);
    }
  };

  const handleStepComplete = (step: SetupOption) => {
    setCompletedSteps([...completedSteps, step]);

    const steps = getStepOrder();
    const currentIndex = steps.indexOf(step);
    const nextStep = steps[currentIndex + 1];

    if (nextStep) {
      setCurrentStep(nextStep);
      setStepIndex(currentIndex + 1);
    }
  };

  const handleStepSkip = (step: SetupOption) => {
    const steps = getStepOrder();
    const currentIndex = steps.indexOf(step);
    const nextStep = steps[currentIndex + 1];

    if (nextStep) {
      setCurrentStep(nextStep);
      setStepIndex(currentIndex + 1);
    }
  };

  const handleBack = () => {
    const steps = getStepOrder();
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
      setStepIndex(currentIndex - 1);
    }
  };

  const handleClose = () => {
    if (confirm('Are you sure you want to skip the setup? You can always complete it later from your profile.')) {
      onSkip();
    }
  };

  const totalSteps = getStepOrder().length;
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex-1">
            {/* Progress bar */}
            <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button
            onClick={handleClose}
            className="ml-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStep === 'welcome' && (
            <WelcomeStep
              onNext={handleWelcomeNext}
              onSkip={onSkip}
            />
          )}
          {currentStep === 'intent' && (
            <IntentStep
              onComplete={() => handleStepComplete('intent')}
              onSkip={() => handleStepSkip('intent')}
              onBack={handleBack}
            />
          )}
          {currentStep === 'profile' && (
            <ProfileStep
              onComplete={() => handleStepComplete('profile')}
              onSkip={() => handleStepSkip('profile')}
              onBack={handleBack}
            />
          )}
          {currentStep === 'goal' && (
            <GoalStep
              onComplete={() => handleStepComplete('goal')}
              onSkip={() => handleStepSkip('goal')}
              onBack={handleBack}
            />
          )}
          {currentStep === 'plan' && (
            <PlanStep
              onComplete={() => handleStepComplete('plan')}
              onSkip={() => handleStepSkip('plan')}
              onBack={handleBack}
            />
          )}
          {currentStep === 'coach' && (
            <CoachStep
              onComplete={() => handleStepComplete('coach')}
              onSkip={() => handleStepSkip('coach')}
              onBack={handleBack}
            />
          )}
          {currentStep === 'complete' && (
            <CompleteStep
              completedSteps={completedSteps}
              selectedOptions={selectedOptions}
              onFinish={onComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
