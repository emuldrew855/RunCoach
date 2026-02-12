/**
 * MemoryViewer Component
 *
 * Displays what the AI coach remembers about the user:
 * - Key insights (patterns, preferences, concerns, successes)
 * - Activity patterns (pacing, HR behavior, recovery, performance)
 * - Recent conversation context
 *
 * Part of Phase 3: RAG + Vector Search implementation
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, Zap, TrendingUp, MessageCircle, ChevronDown, ChevronUp, Repeat } from 'lucide-react';
import { memoryAPI } from '../services/api';
import type { UserInsights, ActivityPattern, ConversationSummary } from '../types';

export const MemoryViewer: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'insights' | 'patterns' | 'context'>('insights');

  const { data: insightsData, isLoading: insightsLoading, error: insightsError } = useQuery({
    queryKey: ['memories', 'insights'],
    queryFn: async () => {
      try {
        const response = await memoryAPI.getInsights();
        return response.data.insights as UserInsights;
      } catch (error) {
        console.warn('Failed to load insights:', error);
        return null;
      }
    },
    retry: false,
  });

  const { data: patternsData, isLoading: patternsLoading, error: patternsError } = useQuery({
    queryKey: ['memories', 'patterns'],
    queryFn: async () => {
      try {
        const response = await memoryAPI.getPatterns();
        return response.data.patterns as ActivityPattern[];
      } catch (error) {
        console.warn('Failed to load patterns:', error);
        return [];
      }
    },
    retry: false,
  });

  const { data: summariesData, isLoading: summariesLoading, error: summariesError } = useQuery({
    queryKey: ['memories', 'summaries'],
    queryFn: async () => {
      try {
        const response = await memoryAPI.getSummaries();
        return response.data.summaries as ConversationSummary[];
      } catch (error) {
        console.warn('Failed to load summaries:', error);
        return [];
      }
    },
    retry: false,
  });

  const hasMemories =
    (insightsData && Object.values(insightsData).some((arr) => arr.length > 0)) ||
    (patternsData && patternsData.length > 0) ||
    (summariesData && summariesData.length > 0);

  const isLoading = insightsLoading || patternsLoading || summariesLoading;

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-6 h-6 text-purple-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Coaching Memories</h2>
        </div>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-3">Loading memories...</p>
        </div>
      </div>
    );
  }

  if (!hasMemories) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-6 h-6 text-purple-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Coaching Memories</h2>
        </div>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No memories yet. As we train together, I'll remember important insights about you.</p>
        </div>
      </div>
    );
  }

  const totalInsights =
    (insightsData?.patterns.length || 0) +
    (insightsData?.preferences.length || 0) +
    (insightsData?.concerns.length || 0) +
    (insightsData?.successes.length || 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-purple-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            What Your Coach Remembers
          </h2>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="btn-secondary text-sm">
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-1" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-1" />
              Expand
            </>
          )}
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{totalInsights}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Insights</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {patternsData?.length || 0}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Patterns</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {summariesData?.length || 0}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Conversations</div>
        </div>
      </div>

      {expanded && (
        <>
          {/* Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('insights')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'insights'
                  ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <Brain className="w-4 h-4 inline mr-1" />
              Key Insights
            </button>
            <button
              onClick={() => setActiveTab('patterns')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'patterns'
                  ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <Zap className="w-4 h-4 inline mr-1" />
              Patterns
            </button>
            <button
              onClick={() => setActiveTab('context')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'context'
                  ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <MessageCircle className="w-4 h-4 inline mr-1" />
              Recent Context
            </button>
          </div>

          {/* Tab content */}
          <div className="space-y-4">
            {activeTab === 'insights' && insightsData && <InsightsTab insights={insightsData} />}
            {activeTab === 'patterns' && patternsData && <PatternsTab patterns={patternsData} />}
            {activeTab === 'context' && summariesData && <ContextTab summaries={summariesData} />}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Insights Tab - Display categorized insights
 */
const InsightsTab: React.FC<{ insights: UserInsights }> = ({ insights }) => {
  const categories = [
    { key: 'patterns' as const, label: 'Patterns', color: 'blue', icon: Repeat },
    { key: 'preferences' as const, label: 'Preferences', color: 'purple', icon: Brain },
    { key: 'concerns' as const, label: 'Concerns', color: 'orange', icon: TrendingUp },
    { key: 'successes' as const, label: 'Successes', color: 'green', icon: TrendingUp },
  ];

  const hasAnyInsights = Object.values(insights).some((arr) => arr.length > 0);

  if (!hasAnyInsights) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No insights recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {categories.map(({ key, label, color, icon: Icon }) => {
        const items = insights[key];
        if (!items || items.length === 0) return null;

        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              <Icon className="w-4 h-4" />
              {label} ({items.length})
            </div>
            <div className="space-y-2">
              {items.map((insight, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg bg-${color}-50 dark:bg-${color}-900/20 border border-${color}-200 dark:border-${color}-800`}
                >
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${color}-100 dark:bg-${color}-900/30 text-${color}-700 dark:text-${color}-300 mr-2`}>
                    {label.slice(0, -1).toUpperCase()}
                  </span>
                  <span className="text-gray-900 dark:text-gray-100">{insight}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Patterns Tab - Display activity patterns grouped by category
 */
const PatternsTab: React.FC<{ patterns: ActivityPattern[] }> = ({ patterns }) => {
  const groupedPatterns = patterns.reduce((acc, pattern) => {
    if (!acc[pattern.pattern_category]) {
      acc[pattern.pattern_category] = [];
    }
    acc[pattern.pattern_category].push(pattern);
    return acc;
  }, {} as Record<string, ActivityPattern[]>);

  const categoryInfo: Record<string, { label: string; color: string }> = {
    pacing: { label: 'Pacing Patterns', color: 'blue' },
    hr_behavior: { label: 'Heart Rate Behavior', color: 'red' },
    recovery: { label: 'Recovery Patterns', color: 'green' },
    performance: { label: 'Performance Trends', color: 'purple' },
  };

  if (patterns.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No patterns detected yet. Patterns will appear after analyzing your activities.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(groupedPatterns).map(([category, categoryPatterns]) => {
        const info = categoryInfo[category] || { label: category, color: 'gray' };

        return (
          <div key={category} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              <Zap className="w-4 h-4" />
              {info.label} ({categoryPatterns.length})
            </div>
            <div className="space-y-2">
              {categoryPatterns.map((pattern, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <p className="text-gray-900 dark:text-gray-100 text-sm flex-1">{pattern.pattern_text}</p>
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {pattern.occurrence_count}x
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Last seen: {new Date(pattern.last_seen).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Context Tab - Display recent conversation summaries
 */
const ContextTab: React.FC<{ summaries: ConversationSummary[] }> = ({ summaries }) => {
  if (summaries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No conversation history yet.</p>
      </div>
    );
  }

  const sentimentColors = {
    positive: 'green',
    neutral: 'gray',
    concerned: 'orange',
  };

  return (
    <div className="space-y-4">
      {summaries.map((summary, idx) => (
        <div
          key={idx}
          className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-start justify-between mb-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${sentimentColors[summary.sentiment]}-100 dark:bg-${sentimentColors[summary.sentiment]}-900/30 text-${sentimentColors[summary.sentiment]}-700 dark:text-${sentimentColors[summary.sentiment]}-300`}
            >
              {summary.sentiment}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(summary.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="text-gray-900 dark:text-gray-100 text-sm mb-2">{summary.summary_text}</p>
          {summary.key_insights && summary.key_insights.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Key insights:</p>
              <ul className="space-y-1">
                {summary.key_insights.slice(0, 3).map((insight, insightIdx) => (
                  <li key={insightIdx} className="text-xs text-gray-600 dark:text-gray-400 pl-2">
                    • {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.topics && summary.topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {summary.topics.slice(0, 5).map((topic, topicIdx) => (
                <span
                  key={topicIdx}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
