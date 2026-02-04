import React from 'react';
import { X } from 'lucide-react';

interface CarbLoadingModalProps {
  date: Date;
  userWeight?: number;
  daysBeforeEvent: number;
  eventDistance?: number;
  onClose: () => void;
}

export const CarbLoadingModal: React.FC<CarbLoadingModalProps> = ({
  date,
  userWeight = 70, // Default 70kg if not set
  daysBeforeEvent,
  eventDistance = 30,
  onClose,
}) => {
  // Calculate carb targets based on loading phase
  const getCarbTarget = () => {
    if (daysBeforeEvent === 1) {
      // Day -1: Peak load (10-12 g/kg)
      return {
        min: userWeight * 10,
        max: userWeight * 12,
        phase: 'Peak Load',
        description: 'Maximize glycogen stores',
      };
    } else if (daysBeforeEvent === 2) {
      // Day -2: Building load (8-10 g/kg)
      return {
        min: userWeight * 8,
        max: userWeight * 10,
        phase: 'Building Load',
        description: 'Start increasing carb intake',
      };
    } else {
      // Day -3: Early load (7-8 g/kg)
      return {
        min: userWeight * 7,
        max: userWeight * 8,
        phase: 'Early Load',
        description: 'Begin carb-loading phase',
      };
    }
  };

  const carbTarget = getCarbTarget();
  const targetAvg = Math.round((carbTarget.min + carbTarget.max) / 2);

  // Meal examples based on phase
  const getMealGuidance = () => {
    if (daysBeforeEvent === 1) {
      return {
        focus: 'Simple, low-fiber carbs to avoid GI distress',
        examples: [
          'White rice, white pasta, white bread',
          'Bananas, honey, sports drinks',
          'Avoid: whole grains, beans, cruciferous vegetables',
        ],
        timing: 'Last large meal 12-15 hours before race',
      };
    } else if (daysBeforeEvent === 2) {
      return {
        focus: 'Mix of complex and simple carbs',
        examples: [
          'Pasta, rice, potatoes, oatmeal',
          'Bagels, pancakes, rice cakes',
          'Start reducing fiber gradually',
        ],
        timing: 'Spread carbs across 4-5 meals',
      };
    } else {
      return {
        focus: 'Complex carbs with good hydration',
        examples: [
          'Whole grain pasta, brown rice, quinoa',
          'Sweet potatoes, oats, bread',
          'Include familiar foods you know work',
        ],
        timing: 'Normal meal schedule, increase portions',
      };
    }
  };

  const mealGuidance = getMealGuidance();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-yellow-400 to-orange-400 dark:from-yellow-600 dark:to-orange-600 p-6 rounded-t-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">🍝</span>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Carb-Loading Strategy
                </h3>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200">
                {date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Phase Badge */}
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-bold text-orange-900 dark:text-orange-100">
                  {carbTarget.phase}
                </h4>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  {daysBeforeEvent} {daysBeforeEvent === 1 ? 'day' : 'days'} before {eventDistance}km event
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                  {targetAvg}g
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  Target carbs
                </p>
              </div>
            </div>
          </div>

          {/* Carb Target Breakdown */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-bold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
              <span>🎯</span>
              Your Carb Target
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-700 dark:text-blue-300">Body Weight:</span>
                <span className="font-semibold text-blue-900 dark:text-blue-100">
                  {userWeight} kg
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-700 dark:text-blue-300">g/kg Target:</span>
                <span className="font-semibold text-blue-900 dark:text-blue-100">
                  {carbTarget.min / userWeight} - {carbTarget.max / userWeight} g/kg
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-blue-200 dark:border-blue-700 pt-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Carbs Needed:</span>
                <span className="text-lg font-bold text-blue-900 dark:text-blue-100">
                  {carbTarget.min} - {carbTarget.max}g
                </span>
              </div>
            </div>
          </div>

          {/* Meal Strategy */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="font-bold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2">
              <span>🥗</span>
              Meal Strategy
            </h4>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                  Focus:
                </p>
                <p className="text-green-900 dark:text-green-100">
                  {mealGuidance.focus}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                  Recommended Foods:
                </p>
                <ul className="list-disc list-inside space-y-1 text-green-900 dark:text-green-100">
                  {mealGuidance.examples.map((example, idx) => (
                    <li key={idx} className="text-sm">{example}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                  Timing:
                </p>
                <p className="text-green-900 dark:text-green-100">
                  {mealGuidance.timing}
                </p>
              </div>
            </div>
          </div>

          {/* Hydration */}
          <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg p-4">
            <h4 className="font-bold text-cyan-900 dark:text-cyan-100 mb-2 flex items-center gap-2">
              <span>💧</span>
              Hydration Strategy
            </h4>
            <p className="text-sm text-cyan-800 dark:text-cyan-200">
              Carbs need water to be stored as glycogen. Aim for 3-4 liters of fluids throughout the day.
              Urine should be pale yellow. Include electrolyte drinks if sweating heavily.
            </p>
          </div>

          {/* Pro Tips */}
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
              <span>💡</span>
              Pro Tips
            </h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-purple-800 dark:text-purple-200">
              <li>Reduce training volume to allow glycogen storage</li>
              <li>Stick to familiar foods - no experiments before race day</li>
              <li>Monitor weight gain (2-3 pounds is normal from glycogen + water)</li>
              <li>Split carbs across multiple meals to avoid GI distress</li>
            </ul>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-medium rounded-lg transition-all"
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
};
