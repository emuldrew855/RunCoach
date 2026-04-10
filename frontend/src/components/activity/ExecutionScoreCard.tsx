/**
 * Execution Score Card
 *
 * Displays the overall execution score for an activity.
 * Shows how well the run was executed against the plan.
 */

import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Target } from 'lucide-react';
import { Tooltip, METRIC_TOOLTIPS } from '../common/Tooltip';

interface ExecutionScoreCardProps {
  score: number;
  difficulty: 'easy' | 'moderate' | 'hard' | 'very_hard';
  paceAppropriate: boolean;
}

export const ExecutionScoreCard: React.FC<ExecutionScoreCardProps> = ({
  score,
  difficulty,
  paceAppropriate,
}) => {
  // Determine score category
  const getScoreConfig = (score: number) => {
    if (score >= 85) {
      return {
        label: 'Excellent',
        icon: CheckCircle,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        ringColor: 'ring-green-500',
        progressColor: 'bg-green-500',
      };
    }
    if (score >= 70) {
      return {
        label: 'Good',
        icon: CheckCircle,
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        ringColor: 'ring-blue-500',
        progressColor: 'bg-blue-500',
      };
    }
    if (score >= 50) {
      return {
        label: 'Fair',
        icon: AlertTriangle,
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        ringColor: 'ring-amber-500',
        progressColor: 'bg-amber-500',
      };
    }
    return {
      label: 'Needs Work',
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      ringColor: 'ring-red-500',
      progressColor: 'bg-red-500',
    };
  };

  const config = getScoreConfig(score);
  const Icon = config.icon;

  const difficultyLabels = {
    easy: 'Easy',
    moderate: 'Moderate',
    hard: 'Hard',
    very_hard: 'Very Hard',
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Execution Score
          </h3>
          <Tooltip content={METRIC_TOOLTIPS.executionScore} position="bottom" />
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${config.bgColor}`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${config.color}`}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Score Display */}
      <div className="flex items-center justify-center mb-6">
        <div className={`relative w-32 h-32 rounded-full ring-8 ${config.ringColor} ring-opacity-20`}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className={`text-4xl font-bold ${config.color}`}>{score}</span>
              <span className="text-neutral-400 text-lg">%</span>
            </div>
          </div>
          {/* Circular progress indicator */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-neutral-200 dark:text-neutral-700"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${score * 2.83} 283`}
              className={config.color}
            />
          </svg>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3">
          <p className="text-xs text-secondary uppercase tracking-wide mb-1">Perceived Effort</p>
          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
            {difficultyLabels[difficulty]}
          </p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3">
          <p className="text-xs text-secondary uppercase tracking-wide mb-1">Pace</p>
          <p className={`font-semibold ${paceAppropriate ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {paceAppropriate ? 'Appropriate' : 'Off Target'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExecutionScoreCard;
