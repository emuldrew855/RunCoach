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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Analysis Cards */}
        <div className={`lg:col-span-2 space-y-6 ${showChat ? 'hidden lg:block' : ''}`}>
          {/* Execution Analysis Section */}
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <ActivityIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            Execution Analysis
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Execution Score */}
            {insights?.effort && (
              <ExecutionScoreCard
                score={insights.effort.executionScore || 0}
                difficulty={insights.effort.perceivedDifficulty || 'moderate'}
                paceAppropriate={insights.effort.paceAppropriate ?? true}
              />
            )}

            {/* Compliance */}
            <ComplianceCard
              completedAsPlanned={insights?.compliance?.completedAsPlanned ?? false}
              distanceDeviation={insights?.compliance?.distanceDeviation ?? 0}
              paceDeviation={insights?.compliance?.paceDeviation ?? 0}
              modifications={insights?.compliance?.modifications ?? []}
              plannedWorkout={plannedWorkout}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pacing */}
            {insights?.pacing && (
              <PacingAnalysisCard
                paceDelta={insights.pacing.paceDelta || 0}
                consistency={insights.pacing.consistency || 0}
                splitAnalysis={insights.pacing.splitAnalysis || {
                  fastestKm: { km: 1, pace: 0 },
                  slowestKm: { km: 1, pace: 0 },
                }}
              />
            )}

            {/* HR Analysis */}
            {insights?.hrBehavior && (
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

          {/* HR Zone Distribution Chart */}
          {hrZoneData && !hrZoneLoading && (
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

          {/* Show loading state for HR Zone chart */}
          {hrZoneLoading && (
            <div className="card">
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Heart className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3 animate-pulse" />
                  <p className="text-sm text-secondary">Loading HR zone data...</p>
                </div>
              </div>
            </div>
          )}

          {/* Coach's Take */}
          <CoachTakeCard
            strengths={insights?.coachingPoints?.strengths ?? []}
            improvements={insights?.coachingPoints?.improvements ?? []}
            nextWorkoutAdjustment={insights?.coachingPoints?.nextWorkoutAdjustment}
            risks={insights?.risks}
            onDiscussClick={() => setShowChat(true)}
          />

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

        {/* Right Column - Chat */}
        <div className={showChat ? 'block' : 'hidden lg:block'}>
          {showChat ? (
            <div className="h-[calc(100dvh-10rem)] md:h-[calc(100vh-12rem)] flex flex-col bg-white dark:bg-gray-800 border border-neutral-700/50 dark:border-neutral-700/50 shadow-xl overflow-hidden rounded-lg">
              <div className="bg-neutral-900 dark:bg-black border-b border-neutral-700/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ActivityIcon size={20} className="text-cyan-500" strokeWidth={1.5} />
                    <div>
                      <h2 className="text-sm font-semibold text-neutral-100 tracking-tight flex items-center gap-2">
                        Run Analysis
                        <span className="text-[9px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 border border-cyan-500/20 uppercase tracking-wider">
                          ACTIVE
                        </span>
                      </h2>
                      <p className="text-xs text-neutral-400 font-mono">Technical debrief</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowChat(false)}
                    className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded p-1.5 transition-colors"
                  >
                    <X size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto command-center-scroll p-2 sm:p-4">
                <div className="divide-y divide-neutral-200/20 dark:divide-neutral-700/20">
                  {messages.map((message) => (
                    <CommandCenterMessage
                      key={message.id}
                      message={message}
                      conversationTitle={activity?.name}
                    />
                  ))}
                </div>

                {isStreaming && !streamingMessage && (
                  <div className="py-4 border-b border-neutral-200/20 dark:border-neutral-700/20">
                    <div className="flex items-start gap-3">
                      <div className="text-label-xs uppercase tracking-widest font-mono mt-1" style={{ color: '#0891b2' }}>
                        COACH
                      </div>
                      <TypingIndicator />
                    </div>
                  </div>
                )}

                {streamingMessage && (
                  <div className="py-6 border-b border-neutral-200/20 dark:border-neutral-700/20 animate-fade-in">
                    <div className="flex items-start gap-3">
                      <div className="text-label-xs uppercase tracking-widest font-mono mt-1" style={{ color: '#0891b2' }}>
                        COACH
                      </div>
                      <div className="flex-1 prose dark:prose-invert prose-sm max-w-none
                        prose-p:text-neutral-700 dark:prose-p:text-neutral-300 prose-p:leading-relaxed
                        prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100 prose-headings:font-semibold prose-headings:tracking-tight
                        prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100 prose-strong:font-semibold
                        prose-ul:text-neutral-700 dark:prose-ul:text-neutral-300
                        prose-ol:text-neutral-700 dark:prose-ol:text-neutral-300
                        prose-code:text-cyan-600 dark:prose-code:text-cyan-400 prose-code:font-mono prose-code:text-xs
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

              <div
                className="flex gap-2 border-t border-neutral-700/50 p-3 md:p-4 bg-neutral-900/50 dark:bg-black/50"
                style={{ paddingBottom: keyboardHeight > 0 ? `${keyboardHeight + 12}px` : undefined }}
              >
                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={isMobile ? "Ask about this run..." : "Ask your coach... (Shift+Enter for new line)"}
                  className="flex-1 input resize-none overflow-y-auto min-h-[42px] max-h-[200px]"
                  style={{ height: '42px' }}
                  disabled={isStreaming}
                  rows={1}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isStreaming}
                  className="btn btn-primary self-end"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          ) : (
            <div className="card text-center py-8">
              <MessageCircle size={40} className="mx-auto mb-3 text-purple-400" />
              <h3 className="text-lg font-bold mb-2 text-neutral-900 dark:text-neutral-100">
                Have Questions?
              </h3>
              <p className="text-secondary text-sm mb-4">
                Discuss this run with your AI coach for personalized feedback
              </p>
              <button
                onClick={() => setShowChat(true)}
                className="btn btn-primary mx-auto"
              >
                Start Conversation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
