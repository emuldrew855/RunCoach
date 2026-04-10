/**
 * Coach Insight Card
 *
 * Displays the AI-generated daily coaching insight at the top of the dashboard.
 * This is the "proactive" coach that tells the athlete what they need to know
 * without being asked.
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, X, ChevronRight, AlertTriangle, CheckCircle, Info, Sparkles } from 'lucide-react';
import { coachingAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';

interface CoachInsight {
  insight: string;
  priority: 'info' | 'action' | 'warning' | 'celebration';
  metrics: {
    volumeStatus: string;
    executionStatus: string;
    daysUntilRace: number | null;
    trainingPhase: string | null;
  };
  generatedAt: string;
}

export const CoachInsightCard: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['coachInsight'],
    queryFn: async () => {
      const response = await coachingAPI.getDailyInsight();
      return response.data;
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
    retry: 1,
  });

  const dismissMutation = useMutation({
    mutationFn: () => coachingAPI.dismissInsight(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachInsight'] });
    },
  });

  // Don't render if dismissed or no insight
  if (data?.dismissed || !data?.insight) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="card bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="h-4 bg-purple-200 dark:bg-purple-800 rounded w-3/4 animate-pulse"></div>
            <div className="h-3 bg-purple-100 dark:bg-purple-900 rounded w-1/2 mt-2 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return null; // Silently fail - don't show error for optional feature
  }

  const insight: CoachInsight = data.insight;

  // Priority-based styling
  const priorityConfig = {
    info: {
      bg: 'from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      icon: Info,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      label: 'INSIGHT',
    },
    action: {
      bg: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20',
      border: 'border-amber-200 dark:border-amber-800',
      icon: AlertTriangle,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      label: 'ACTION NEEDED',
    },
    warning: {
      bg: 'from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20',
      border: 'border-red-200 dark:border-red-800',
      icon: AlertTriangle,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
      label: 'ATTENTION',
    },
    celebration: {
      bg: 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20',
      border: 'border-green-200 dark:border-green-800',
      icon: CheckCircle,
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
      label: 'ON TRACK',
    },
  };

  const config = priorityConfig[insight.priority] || priorityConfig.info;
  const Icon = config.icon;

  return (
    <div className={`card bg-gradient-to-r ${config.bg} border ${config.border} relative overflow-hidden`}>
      {/* Decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 opacity-5">
        <Brain className="w-full h-full" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${config.iconColor}`}>
                  {config.label}
                </span>
                <Sparkles className={`w-3 h-3 ${config.iconColor}`} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Coach's Note
              </p>
            </div>
          </div>

          {/* Dismiss button */}
          <button
            onClick={() => dismissMutation.mutate()}
            className="p-1 rounded-full hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
            title="Dismiss until tomorrow"
          >
            <X className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </button>
        </div>

        {/* Insight text */}
        <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed mb-4">
          {insight.insight}
        </p>

        {/* Metrics row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            {insight.metrics.trainingPhase && (
              <span className="px-2 py-1 bg-white/50 dark:bg-black/20 rounded">
                {insight.metrics.trainingPhase.toUpperCase()} PHASE
              </span>
            )}
            {insight.metrics.daysUntilRace && (
              <span>
                {insight.metrics.daysUntilRace} days to race
              </span>
            )}
            <span>
              Volume: {insight.metrics.volumeStatus}
            </span>
          </div>

          {/* Action button */}
          <button
            onClick={() => navigate('/chat')}
            className="flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 transition-colors"
          >
            Discuss with Coach
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoachInsightCard;
