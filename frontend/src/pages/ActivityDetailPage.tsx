/**
 * Activity Detail Page - "Debrief" View
 *
 * Displays comprehensive analysis of a single activity with AI coaching insights.
 * Answers: "How did this run go? What should I do differently?"
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { activitiesAPI, chatAPI, profileAPI } from '../services/api';
import type { Activity, UserProfile } from '../types/index';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, Clock, Heart, Send, MessageCircle, MapPin, Zap, Activity as ActivityIcon, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePreferences } from '../context/PreferencesContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ErrorDisplay, { LoadingDisplay } from '../components/ErrorDisplay';
import { TypingIndicator } from '../components/TypingIndicator';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useIsMobile } from '../hooks/useIsMobile';
import { ExecutionScoreCard } from '../components/activity/ExecutionScoreCard';
import { PacingAnalysisCard } from '../components/activity/PacingAnalysisCard';
import { HRAnalysisCard } from '../components/activity/HRAnalysisCard';
import { ComplianceCard } from '../components/activity/ComplianceCard';
import { CoachTakeCard } from '../components/activity/CoachTakeCard';
import { SplitsAnalysisCard } from '../components/activity/SplitsAnalysisCard';
import { CommandCenterMessage } from '../components/CommandCenterMessage';
import { HRZoneStackedChart } from '../components/charts/HRZoneStackedChart';
import { useHRZoneDistributionData } from '../hooks/useChartData';

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { convertDistance, distanceUnit, convertPace, paceUnit } = usePreferences();
  const { keyboardHeight } = useKeyboardHeight();
  const isMobile = useIsMobile();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch activity with insights
  const { data: activityData, isLoading, error, refetch } = useQuery({
    queryKey: ['activity', id],
    queryFn: async () => {
      const response = await activitiesAPI.getActivity(parseInt(id || '0'));
      return response.data as {
        activity: Activity;
        insights: any;
        plannedWorkout: any;
      };
    },
    retry: 2,
    retryDelay: 1000,
    enabled: !!id,
  });

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await profileAPI.getProfile();
      return response.data.profile as UserProfile | null;
    },
  });

  // Fetch HR Zone Distribution data for the chart
  const { data: hrZoneData, isLoading: hrZoneLoading } = useHRZoneDistributionData(parseInt(id || '0'));

  const activity = activityData?.activity;

  // Fetch processed splits data (only when activity is loaded)
  const { data: splitsData, isLoading: splitsLoading, refetch: refetchSplits } = useQuery({
    queryKey: ['activity-splits', id],
    queryFn: async () => {
      const response = await activitiesAPI.getProcessedSplits(parseInt(id || '0'));
      return response.data || null;
    },
    enabled: !!id && !!activity,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1, // Only retry once on failure
  });
  const insights = activityData?.insights;
  const plannedWorkout = activityData?.plannedWorkout;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  useEffect(() => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea && input) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const createConversation = async () => {
    try {
      if (!activity) {
        toast.error('Activity data not available');
        return;
      }

      const formattedDate = format(new Date(activity.start_date), 'MMM dd, yyyy');
      const distance = convertDistance(Number(activity.distance_meters), 1);
      const title = `Run: ${activity?.name || 'Activity'} - ${formattedDate} - ${distance}${distanceUnit}`;

      const response = await chatAPI.createConversation(title);
      setConversationId(response.data.data.conversation.id);

      const prefillText = `I'd like to discuss my run from ${format(new Date(activity.start_date), 'MMMM dd, yyyy')}. I ran ${convertDistance(Number(activity.distance_meters), 2)} ${distanceUnit} in ${formatDuration(activity.moving_time_seconds)} at a pace of ${formatPace(activity.average_speed)}.${activity.average_heartrate ? ` My average heart rate was ${Number(activity.average_heartrate).toFixed(0)} bpm.` : ''} How does this run contribute to my training goal?`;

      setInput(prefillText);
    } catch (error: any) {
      toast.error(`Failed to create conversation: ${error.message || 'Unknown error'}`);
    }
  };

  useEffect(() => {
    if (showChat && !conversationId && activity) {
      createConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChat, conversationId, activity?.id]);

  // Refresh insights (recalculate based on current planned workout data)
  const handleRefreshInsights = async () => {
    if (!id || isRefreshing) return;

    setIsRefreshing(true);
    try {
      await activitiesAPI.recomputeInsights(parseInt(id));
      await refetch();
      toast.success('Insights refreshed successfully');
    } catch (error: any) {
      console.error('Failed to refresh insights:', error);
      toast.error(`Failed to refresh insights: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !conversationId || isStreaming) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: input,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setStreamingMessage('');

    try {
      const token = localStorage.getItem('jwt');
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
      const response = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: conversationId,
          message: userMessage.content,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader');

      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullResponse += parsed.content;
                setStreamingMessage(fullResponse);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: fullResponse,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingMessage('');
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setIsStreaming(false);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hours > 0 ? `${hours}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
  };

  const formatPace = (avgSpeed?: number) => {
    if (!avgSpeed) return 'N/A';
    const speed = Number(avgSpeed);
    const paceMinPerKm = 1000 / (speed * 60);
    return `${convertPace(paceMinPerKm)} /${paceUnit.replace('min/', '')}`;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/training')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ArrowLeft size={20} />
          Back to Training
        </button>
        <LoadingDisplay message="Loading activity details..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/training')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ArrowLeft size={20} />
          Back to Training
        </button>
        <ErrorDisplay
          error={error as Error}
          title="Failed to Load Activity"
          message="Unable to load activity details. Please check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  // Not found state
  if (!activity) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/training')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ArrowLeft size={20} />
          Back to Training
        </button>
        <ErrorDisplay
          title="Activity Not Found"
          message="The requested activity could not be found."
          onRetry={() => navigate('/training')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/training')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ArrowLeft size={20} />
          Back to Training
        </button>
        {!showChat && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshInsights}
              disabled={isRefreshing}
              className="btn btn-secondary flex items-center gap-2"
              title="Recalculate execution score based on current workout targets"
            >
              <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Insights'}
            </button>
            <button
              onClick={() => setShowChat(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <MessageCircle size={18} />
              Discuss with Coach
            </button>
          </div>
        )}
      </div>

      {/* Activity Title */}
      <div className="card border-l-4 border-strava">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {activity.name || 'Run'} Debrief
            </h1>
            <div className="flex items-center gap-2 text-sm text-secondary mt-1">
              <Calendar size={14} />
              {format(new Date(activity.start_date), 'EEEE, MMMM dd, yyyy')} at{' '}
              {format(new Date(activity.start_date), 'h:mm a')}
            </div>
          </div>
          {insights?.effort?.executionScore !== undefined && (
            <div className={`px-3 py-1.5 rounded-full ${
              insights.effort.executionScore >= 85 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
              insights.effort.executionScore >= 70 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
              insights.effort.executionScore >= 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
              'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              <span className="text-sm font-semibold">Score: {insights.effort.executionScore}%</span>
            </div>
          )}
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 opacity-80" />
              <p className="text-xs opacity-90">Distance</p>
            </div>
            <p className="text-2xl font-bold">
              {activity.distance_meters ? convertDistance(Number(activity.distance_meters), 2) : '0'}
              <span className="text-sm font-normal ml-1">{distanceUnit}</span>
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-purple-500 text-white rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 opacity-80" />
              <p className="text-xs opacity-90">Duration</p>
            </div>
            <p className="text-2xl font-bold">{formatDuration(activity.moving_time_seconds)}</p>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-teal-500 text-white rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 opacity-80" />
              <p className="text-xs opacity-90">Pace</p>
            </div>
            <p className="text-2xl font-bold">{formatPace(activity.average_speed)}</p>
          </div>

          <div className="bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-4 h-4 opacity-80" />
              <p className="text-xs opacity-90">Avg HR</p>
            </div>
            <p className="text-2xl font-bold">
              {activity.average_heartrate ? Number(activity.average_heartrate).toFixed(0) : '--'}
              <span className="text-sm font-normal ml-1">bpm</span>
            </p>
          </div>
        </div>
      </div>

      {/* Full-width Analysis Cards (no sidebar taking space) */}
      <div className="space-y-6">
        {/* Coach's Take - FIRST for new runners (the "Story" before the "Data") */}
        <CoachTakeCard
          strengths={insights?.coachingPoints?.strengths ?? []}
          improvements={insights?.coachingPoints?.improvements ?? []}
          nextWorkoutAdjustment={insights?.coachingPoints?.nextWorkoutAdjustment}
          risks={insights?.risks}
          hasHRData={insights?.hrBehavior?.hasData ?? false}
          hasSplitsData={insights?.pacing?.hasSplitsData ?? false}
          hadPlannedWorkout={insights?.compliance?.hadPlannedWorkout ?? false}
          onDiscussClick={() => setShowChat(true)}
        />

        {/* Execution Analysis Section */}
        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
          <ActivityIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          Execution Analysis
        </h2>

        {/* 3-column layout: Execution Score, Plan Compliance, HR Analysis - now has room to breathe */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Execution Score */}
          {insights?.effort && (
            <ExecutionScoreCard
              score={insights.effort.executionScore || 0}
              difficulty={insights.effort.perceivedDifficulty || 'moderate'}
              paceAppropriate={insights.effort.paceAppropriate ?? true}
              hrZoneCompliance={insights.hrBehavior?.avgZone}
              targetZone={plannedWorkout?.target_hr_zone}
            />
          )}

          {/* Compliance */}
          <ComplianceCard
            completedAsPlanned={insights?.compliance?.completedAsPlanned ?? false}
            distanceDeviation={insights?.compliance?.distanceDeviation ?? 0}
            paceDeviation={insights?.compliance?.paceDeviation ?? 0}
            modifications={insights?.compliance?.modifications ?? []}
            plannedWorkout={plannedWorkout}
            actualDistanceMeters={activity.distance_meters ? Number(activity.distance_meters) : undefined}
            actualPaceSecondsPerKm={activity.average_speed ? 1000 / Number(activity.average_speed) : undefined}
          />

          {/* HR Analysis - only show if we have HR data */}
          {insights?.hrBehavior?.hasData && (
            <HRAnalysisCard
              avgZone={insights.hrBehavior.avgZone || 2}
              zoneDrift={insights.hrBehavior.zoneDrift || 0}
              effortMismatch={insights.hrBehavior.effortMismatch || false}
              driftRate={insights.hrBehavior.driftRate || 0}
              avgHR={insights.hrBehavior.avgHR || Number(activity.average_heartrate) || 0}
              maxHR={insights.hrBehavior.maxHR || Number(activity.max_heartrate) || 0}
            />
          )}
        </div>

        {/* Pacing Analysis - only show if we have splits data */}
        {insights?.pacing?.hasSplitsData && (
          <PacingAnalysisCard
            paceDelta={insights.pacing.paceDelta || 0}
            consistency={insights.pacing.consistency || 0}
            splitAnalysis={insights.pacing.splitAnalysis || {
              fastestKm: { km: 1, pace: 0 },
              slowestKm: { km: 1, pace: 0 },
            }}
          />
        )}

        {/* HR Zone Distribution Chart - only show if we have HR data */}
        {hrZoneData && !hrZoneLoading && insights?.hrBehavior?.hasData && (
          <div className="card">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-500" />
                Heart Rate Zone Distribution
              </h3>
              <p className="text-sm text-secondary mt-1">
                Time spent in each HR zone during this run
              </p>
            </div>
            <HRZoneStackedChart
              data={hrZoneData}
              config={{ height: 300, showGrid: true, showLegend: true }}
            />
          </div>
        )}

        {/* Show loading state for HR Zone chart - only if we expect HR data */}
        {hrZoneLoading && insights?.hrBehavior?.hasData && (
          <div className="card">
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Heart className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3 animate-pulse" />
                <p className="text-sm text-secondary">Loading HR zone data...</p>
              </div>
            </div>
          </div>
        )}

        {/* Per-KM Splits Analysis */}
        {(splitsData?.splits?.length > 0 || splitsLoading) && (
          <SplitsAnalysisCard
            splits={splitsData?.splits || []}
            analysis={splitsData?.analysis || {
              fastest_km: null,
              slowest_km: null,
              avg_pace: '0:00',
              avg_pace_seconds: 0,
              positive_split: false,
              negative_split: false,
              pace_consistency: 0,
              hr_drift_percent: null,
              fade_point_km: null,
            }}
            isLoading={splitsLoading}
            onRecompute={async () => {
              try {
                await activitiesAPI.getProcessedSplits(parseInt(id || '0'), true);
                refetchSplits();
                toast.success('Splits data refreshed');
              } catch (error) {
                toast.error('Failed to refresh splits');
              }
            }}
          />
        )}

        {/* Show placeholder cards if no insights */}
        {!insights && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <div className="flex items-center justify-center py-8 text-center">
                <div>
                  <ActivityIcon className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                  <p className="text-sm text-secondary">Analysis in progress</p>
                  <p className="text-xs text-tertiary mt-1">Insights will appear after processing</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-center py-8 text-center">
                <div>
                  <Heart className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                  <p className="text-sm text-secondary">HR analysis pending</p>
                  <p className="text-xs text-tertiary mt-1">Check back after data processing</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Chat Button - bottom right corner */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 group"
        >
          <MessageCircle size={20} className="group-hover:scale-110 transition-transform" />
          <span className="font-medium hidden sm:inline">Ask Coach</span>
        </button>
      )}

      {/* Centered Chat Modal */}
      {showChat && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
            onClick={() => setShowChat(false)}
          />

          {/* Chat Modal - larger and mobile-friendly */}
          <div className="fixed inset-2 sm:inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 md:w-[800px] lg:w-[900px] md:max-w-[95vw] md:h-[85vh] md:max-h-[900px] flex flex-col bg-white dark:bg-gray-900 shadow-2xl rounded-xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <MessageCircle size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      Ask Your Coach
                    </h2>
                    <p className="text-xs text-white/70">{activity.name || 'Run'} debrief</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  className="text-white/70 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors"
                  title="Minimize"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-neutral-50 dark:bg-neutral-950">
              {messages.length === 0 && !isStreaming && (
                <div className="text-center py-8">
                  <MessageCircle size={40} className="mx-auto mb-3 text-neutral-300 dark:text-neutral-600" />
                  <p className="text-sm text-secondary mb-1">Ask about this run</p>
                  <p className="text-xs text-tertiary">Get personalized feedback on your performance</p>
                </div>
              )}

              <div className="space-y-4">
                {messages.map((message) => (
                  <CommandCenterMessage
                    key={message.id}
                    message={message}
                    conversationTitle={activity?.name}
                    skipCharts={true}  // Charts already visible on Activity Detail page
                  />
                ))}
              </div>

              {isStreaming && !streamingMessage && (
                <div className="py-4">
                  <div className="flex items-start gap-3">
                    <div className="text-xs uppercase tracking-wider font-medium text-purple-600 dark:text-purple-400 mt-1">
                      Coach
                    </div>
                    <TypingIndicator />
                  </div>
                </div>
              )}

              {streamingMessage && (
                <div className="py-4 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="text-xs uppercase tracking-wider font-medium text-purple-600 dark:text-purple-400 mt-1">
                      Coach
                    </div>
                    <div className="flex-1 prose dark:prose-invert prose-sm max-w-none
                      prose-p:text-neutral-700 dark:prose-p:text-neutral-300 prose-p:leading-relaxed
                      prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100
                      prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100
                      prose-ul:text-neutral-700 dark:prose-ul:text-neutral-300
                      prose-ol:text-neutral-700 dark:prose-ol:text-neutral-300
                    ">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingMessage}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input - responsive sizing for mobile and desktop */}
            <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 sm:p-4 bg-white dark:bg-gray-900 flex-shrink-0">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask about this run..."
                className="w-full input resize-none min-h-[80px] sm:min-h-[100px] max-h-[120px] sm:max-h-[150px] mb-3 text-base"
                disabled={isStreaming}
                rows={3}
              />
              <div className="flex justify-between items-center gap-2">
                <p className="text-xs text-tertiary hidden sm:block">Press Enter to send, Shift+Enter for new line</p>
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isStreaming}
                  className="btn btn-primary px-4 sm:px-5 py-2.5 text-base flex-shrink-0 min-h-[44px]"
                >
                  <Send size={18} className="mr-2" />
                  Send
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
