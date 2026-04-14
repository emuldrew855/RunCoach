/**
 * Coach's Take Card
 *
 * Displays AI-generated coaching feedback for the activity.
 * Shows strengths, improvements, and next workout adjustments.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, ThumbsUp, AlertCircle, Lightbulb, ChevronRight, MessageCircle } from 'lucide-react';

interface CoachTakeProps {
  strengths: string[];
  improvements: string[];
  nextWorkoutAdjustment?: string;
  risks?: {
    injuryRisk: 'low' | 'moderate' | 'high';
    overtrainingSignals: string[];
    recoveryNeeded: boolean;
  };
  // Data availability flags
  hasHRData?: boolean;
  hasSplitsData?: boolean;
  hadPlannedWorkout?: boolean;
  onDiscussClick?: () => void;
}

export const CoachTakeCard: React.FC<CoachTakeProps> = ({
  strengths,
  improvements,
  nextWorkoutAdjustment,
  risks,
  hasHRData = true,
  hasSplitsData = true,
  hadPlannedWorkout = true,
  onDiscussClick,
}) => {
  const navigate = useNavigate();

  // Generate contextual messages based on missing data
  const missingDataMessages: string[] = [];
  if (!hasHRData) {
    missingDataMessages.push('No heart rate data available for this activity');
  }
  if (!hadPlannedWorkout) {
    missingDataMessages.push('No planned workout to compare against');
  }
  if (!hasSplitsData) {
    missingDataMessages.push('No per-kilometer split data available');
  }

  // Risk badge config
  const getRiskConfig = (level: 'low' | 'moderate' | 'high') => {
    if (level === 'high') {
      return {
        label: 'High Risk',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        textColor: 'text-red-700 dark:text-red-300',
      };
    }
    if (level === 'moderate') {
      return {
        label: 'Moderate Risk',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        textColor: 'text-amber-700 dark:text-amber-300',
      };
    }
    return {
      label: 'Low Risk',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-700 dark:text-green-300',
    };
  };

  const hasContent = strengths.length > 0 || improvements.length > 0 || nextWorkoutAdjustment;
  const hasMissingData = missingDataMessages.length > 0;

  if (!hasContent) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Coach's Take
          </h3>
        </div>

        <div className="py-4">
          {hasMissingData ? (
            <div className="space-y-3">
              <p className="text-sm text-secondary text-center">
                Limited analysis available due to missing data:
              </p>
              <ul className="space-y-1">
                {missingDataMessages.map((msg, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                    <span className="text-neutral-400 mt-1">-</span>
                    <span>{msg}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-tertiary text-center mt-3">
                Connect a HR monitor or create a training plan for more detailed insights
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center text-center">
              <div>
                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-3">
                  <Brain className="w-6 h-6 text-purple-500" />
                </div>
                <p className="text-sm text-secondary">No analysis available</p>
                <p className="text-xs text-tertiary mt-1">Insights will be generated after more data</p>
              </div>
            </div>
          )}
        </div>

        {/* Discuss with Coach Button */}
        <button
          onClick={onDiscussClick || (() => navigate('/chat'))}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded-lg text-purple-700 dark:text-purple-300 font-medium text-sm transition-colors mt-4"
        >
          <MessageCircle className="w-4 h-4" />
          Discuss with Coach
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="card border-l-4 border-purple-500">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Coach's Take
          </h3>
        </div>
        {risks && risks.injuryRisk !== 'low' && (
          <span className={`text-xs px-2 py-1 rounded-full ${getRiskConfig(risks.injuryRisk).bgColor} ${getRiskConfig(risks.injuryRisk).textColor}`}>
            {getRiskConfig(risks.injuryRisk).label}
          </span>
        )}
      </div>

      {/* Strengths */}
      {strengths.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <ThumbsUp className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-green-600 dark:text-green-400">What went well</span>
          </div>
          <ul className="space-y-1.5">
            {strengths.map((strength, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <span className="text-green-500 mt-1">+</span>
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvements */}
      {improvements.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Areas to improve</span>
          </div>
          <ul className="space-y-1.5">
            {improvements.map((improvement, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <span className="text-amber-500 mt-1">!</span>
                <span>{improvement}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next Workout Adjustment */}
      {nextWorkoutAdjustment && (
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg mb-4 border border-purple-200 dark:border-purple-800">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">
                For your next workout
              </p>
              <p className="text-sm text-purple-700 dark:text-purple-300">
                {nextWorkoutAdjustment}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Warning */}
      {risks?.recoveryNeeded && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg mb-4 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              Additional recovery recommended before your next hard effort
            </span>
          </div>
        </div>
      )}

      {/* Overtraining Signals */}
      {risks?.overtrainingSignals && risks.overtrainingSignals.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-secondary uppercase tracking-wide mb-2">Signals detected</p>
          <div className="flex flex-wrap gap-2">
            {risks.overtrainingSignals.map((signal, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-1 rounded text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
              >
                {signal}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Missing Data Notice */}
      {hasMissingData && (
        <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg mb-4 border border-neutral-200 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">Limited data available:</p>
          <ul className="space-y-0.5">
            {missingDataMessages.map((msg, idx) => (
              <li key={idx} className="text-xs text-neutral-400 dark:text-neutral-500 flex items-start gap-1.5">
                <span>-</span>
                <span>{msg}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Discuss with Coach Button */}
      <button
        onClick={onDiscussClick || (() => navigate('/chat'))}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded-lg text-purple-700 dark:text-purple-300 font-medium text-sm transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        Discuss with Coach
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default CoachTakeCard;
