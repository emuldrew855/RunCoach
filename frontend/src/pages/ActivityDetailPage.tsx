import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { activitiesAPI, chatAPI } from '../services/api';
import { Activity } from '../types';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, Clock, Heart, Send, MessageCircle, TrendingUp, Mountain, Activity as ActivityIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePreferences } from '../context/PreferencesContext';
import { CollapsibleCard } from '../components/CollapsibleCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { convertDistance, distanceUnit, convertPace, paceUnit } = usePreferences();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: activitiesData } = useQuery({
    queryKey: ['activities'],
    queryFn: async () => {
      const response = await activitiesAPI.getActivities({ limit: 100 });
      return response.data.activities as Activity[];
    },
  });

  const activity = activitiesData?.find(a => a.id === parseInt(id || '0'));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // Create a new conversation when chat is opened
  useEffect(() => {
    if (showChat && !conversationId && activity) {
      createConversation();
    }
  }, [showChat, conversationId, activity]);

  const createConversation = async () => {
    try {
      const formattedDate = format(new Date(activity!.start_date), 'MMM dd, yyyy');
      const distance = convertDistance(Number(activity!.distance_meters), 1);
      const title = `Run: ${activity?.name || 'Activity'} - ${formattedDate} - ${distance}${distanceUnit}`;

      const response = await chatAPI.createConversation(title);
      setConversationId(response.data.conversation.id);
      // Pre-fill with context
      setInput(`I'd like to discuss my run from ${format(new Date(activity!.start_date), 'MMMM dd, yyyy')}. I ran ${convertDistance(Number(activity!.distance_meters), 2)} ${distanceUnit} in ${formatDuration(activity!.moving_time_seconds)} at a pace of ${formatPace(activity!.average_speed)}.${activity!.average_heartrate ? ` My average heart rate was ${Number(activity!.average_heartrate).toFixed(0)} bpm (${getHeartRateZone(Number(activity!.average_heartrate))?.desc} zone).` : ''} How does this run contribute to my sub-3 hour marathon goal?`);
    } catch (error) {
      toast.error('Failed to create conversation');
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
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chat/message`, {
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
      console.error('Send message error:', error);
      toast.error('Failed to send message');
    } finally {
      setIsStreaming(false);
    }
  };

  if (!activity) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Activity not found</p>
        <button onClick={() => navigate('/dashboard')} className="btn btn-primary mt-4">
          Back to Dashboard
        </button>
      </div>
    );
  }

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

  const getHeartRateZone = (avgHR?: number) => {
    if (!avgHR) return null;
    const hr = Number(avgHR);
    if (hr < 120) return { zone: 'Zone 1', color: 'text-blue-600', desc: 'Very Light' };
    if (hr < 140) return { zone: 'Zone 2', color: 'text-green-600', desc: 'Easy' };
    if (hr < 160) return { zone: 'Zone 3', color: 'text-yellow-600', desc: 'Moderate' };
    if (hr < 175) return { zone: 'Zone 4', color: 'text-orange-600', desc: 'Hard' };
    return { zone: 'Zone 5', color: 'text-red-600', desc: 'Maximum' };
  };

  const hrZone = getHeartRateZone(activity.average_heartrate ? Number(activity.average_heartrate) : undefined);

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        <ArrowLeft size={20} />
        Back to Dashboard
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Run Details */}
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{activity.name || 'Run'}</h1>
              {!showChat && (
                <button
                  onClick={() => setShowChat(true)}
                  className="btn btn-primary flex items-center gap-2"
                >
                  <MessageCircle size={20} />
                  Talk to Coach
                </button>
              )}
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                {format(new Date(activity.start_date), 'EEEE, MMMM dd, yyyy')} at{' '}
                {format(new Date(activity.start_date), 'h:mm a')}
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-lg p-4">
                <p className="text-xs opacity-90 mb-1">Distance</p>
                <p className="text-2xl font-bold">
                  {activity.distance_meters ? convertDistance(Number(activity.distance_meters), 2) : '0'} {distanceUnit}
                </p>
              </div>

              <div className="bg-gradient-to-br from-blue-500 to-purple-500 text-white rounded-lg p-4">
                <p className="text-xs opacity-90 mb-1">Duration</p>
                <p className="text-2xl font-bold">{formatDuration(activity.moving_time_seconds)}</p>
              </div>

              <div className="bg-gradient-to-br from-green-500 to-teal-500 text-white rounded-lg p-4">
                <p className="text-xs opacity-90 mb-1">Pace</p>
                <p className="text-2xl font-bold">{formatPace(activity.average_speed)}</p>
              </div>

              <div className="bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-lg p-4">
                <p className="text-xs opacity-90 mb-1">Elevation</p>
                <p className="text-2xl font-bold">
                  {activity.total_elevation_gain_meters ? Number(activity.total_elevation_gain_meters).toFixed(0) : '0'} m
                </p>
              </div>
            </div>

            {/* Detailed Stats */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 mb-2 text-gray-900 dark:text-gray-100">
                  <Clock size={18} />
                  Time & Pace
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Moving Time:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{formatDuration(activity.moving_time_seconds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Average Pace:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{formatPace(activity.average_speed)}</span>
                  </div>
                  {activity.max_speed && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Best Pace:</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{formatPace(activity.max_speed)}</span>
                    </div>
                  )}
                </div>
              </div>

              {activity.average_heartrate && (
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-2 text-gray-900 dark:text-gray-100">
                    <Heart size={18} />
                    Heart Rate
                  </h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Average HR:</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{Number(activity.average_heartrate).toFixed(0)} bpm</span>
                    </div>
                    {activity.max_heartrate && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Max HR:</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{Number(activity.max_heartrate).toFixed(0)} bpm</span>
                      </div>
                    )}
                    {hrZone && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Training Zone:</span>
                        <span className={`font-semibold ${hrZone.color}`}>
                          {hrZone.zone} - {hrZone.desc}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activity.average_cadence && (
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-2 text-gray-900 dark:text-gray-100">
                    <ActivityIcon size={18} />
                    Cadence
                  </h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Average Cadence:</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{Number(activity.average_cadence).toFixed(0)} spm</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Advanced Details - Splits Table */}
          {(() => {
            console.log('Activity splits check:', {
              hasSplits: !!activity.splits_metric,
              splitsLength: activity.splits_metric?.length,
              splits: activity.splits_metric
            });

            if (!activity.splits_metric || activity.splits_metric.length === 0) {
              return (
                <div className="card">
                  <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
                    Advanced Details - Per Kilometer Analysis
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    No per-kilometer split data available for this activity. This data is typically available for activities recorded with a GPS watch or device that tracks splits.
                  </p>
                </div>
              );
            }

            return (() => {
            // Calculate split analysis
            const splitsWithPace = activity.splits_metric.map((split: any) => ({
              ...split,
              paceValue: 1000 / (split.average_speed * 60)
            }));

            const fastestSplit = splitsWithPace.reduce((prev: any, curr: any) =>
              curr.paceValue < prev.paceValue ? curr : prev
            );

            const slowestSplit = splitsWithPace.reduce((prev: any, curr: any) =>
              curr.paceValue > prev.paceValue ? curr : prev
            );

            const hasHR = activity.splits_metric.some((s: any) => s.average_heartrate);
            let avgHRBySplit: number | null = null;
            let minHR: number | null = null;
            let maxHR: number | null = null;

            if (hasHR) {
              const hrSplits = activity.splits_metric.filter((s: any) => s.average_heartrate);
              avgHRBySplit = hrSplits.reduce((sum: number, s: any) => sum + s.average_heartrate, 0) / hrSplits.length;
              minHR = Math.min(...hrSplits.map((s: any) => s.average_heartrate));
              maxHR = Math.max(...hrSplits.map((s: any) => s.average_heartrate));
            }

            return (
              <CollapsibleCard
                id="activity-advanced-details"
                title="Advanced Details - Per Kilometer Analysis"
                defaultCollapsed={false}
              >
                {/* Split Analysis Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <p className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium">Fastest KM</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-300">
                      {convertPace(fastestSplit.paceValue)}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Split {fastestSplit.split}
                    </p>
                  </div>

                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                    <p className="text-xs text-orange-600 dark:text-orange-400 mb-1 font-medium">Slowest KM</p>
                    <p className="text-xl font-bold text-orange-700 dark:text-orange-300">
                      {convertPace(slowestSplit.paceValue)}
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      Split {slowestSplit.split}
                    </p>
                  </div>

                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                    <p className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-medium">Pace Variation</p>
                    <p className="text-xl font-bold text-purple-700 dark:text-purple-300">
                      {(slowestSplit.paceValue - fastestSplit.paceValue).toFixed(2)}
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                      min/{distanceUnit.split(' ')[0]}
                    </p>
                  </div>

                  {hasHR && avgHRBySplit && (
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                      <p className="text-xs text-red-600 dark:text-red-400 mb-1 font-medium">HR Range</p>
                      <p className="text-xl font-bold text-red-700 dark:text-red-300">
                        {minHR?.toFixed(0)} - {maxHR?.toFixed(0)}
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        bpm across splits
                      </p>
                    </div>
                  )}
                </div>

                {/* Splits Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400 font-semibold">KM</th>
                        <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400 font-semibold">Time</th>
                        <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400 font-semibold">Pace</th>
                        {hasHR && (
                          <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400 font-semibold">Avg HR</th>
                        )}
                        {activity.splits_metric?.some((s: any) => s.elevation_difference !== undefined) && (
                          <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400 font-semibold">
                            <Mountain size={14} className="inline mr-1" />
                            Elev
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {activity.splits_metric?.map((split: any, index: number) => {
                        const splitPace = 1000 / (split.average_speed * 60);
                        const formattedPace = convertPace(splitPace);
                        const isFastest = split.split === fastestSplit.split;
                        const isSlowest = split.split === slowestSplit.split;

                        return (
                          <tr
                            key={index}
                            className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                              isFastest ? 'bg-green-50 dark:bg-green-900/10' :
                              isSlowest ? 'bg-orange-50 dark:bg-orange-900/10' : ''
                            }`}
                          >
                            <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">
                              {split.split}
                              {isFastest && <span className="ml-2 text-xs text-green-600">⚡</span>}
                              {isSlowest && <span className="ml-2 text-xs text-orange-600">🐌</span>}
                            </td>
                            <td className="text-right py-2 px-3 text-gray-700 dark:text-gray-300">
                              {Math.floor(split.moving_time / 60)}:{String(Math.floor(split.moving_time % 60)).padStart(2, '0')}
                            </td>
                            <td className={`text-right py-2 px-3 font-medium ${
                              isFastest ? 'text-green-700 dark:text-green-300' :
                              isSlowest ? 'text-orange-700 dark:text-orange-300' :
                              'text-gray-700 dark:text-gray-300'
                            }`}>
                              {formattedPace}
                            </td>
                            {hasHR && (
                              <td className="text-right py-2 px-3 text-gray-700 dark:text-gray-300">
                                {split.average_heartrate ? `${Number(split.average_heartrate).toFixed(0)} bpm` : '-'}
                              </td>
                            )}
                            {activity.splits_metric?.some((s: any) => s.elevation_difference !== undefined) && (
                              <td className="text-right py-2 px-3">
                                {split.elevation_difference !== undefined ? (
                                  <span className={split.elevation_difference > 0 ? 'text-orange-600 font-medium' : split.elevation_difference < 0 ? 'text-blue-600 font-medium' : 'text-gray-600'}>
                                    {split.elevation_difference > 0 ? '+' : ''}{split.elevation_difference.toFixed(1)}m
                                  </span>
                                ) : '-'}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CollapsibleCard>
            );
            })();
          })()}
        </div>

        {/* Right Column - Chat */}
        <div className={showChat ? 'block' : 'hidden lg:block'}>
          {showChat ? (
            <div className="card h-[calc(100vh-12rem)] flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-600">
                <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <MessageCircle size={20} />
                  Coach Chat
                </h2>
                <button
                  onClick={() => setShowChat(false)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 lg:hidden"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto mb-4 space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        message.role === 'user'
                          ? 'bg-strava text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}

                {streamingMessage && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {streamingMessage}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="flex gap-2 border-t border-gray-200 dark:border-gray-600 pt-4">
                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-grow textarea
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask your coach... (Shift+Enter for new line)"
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
            <div className="card text-center py-12">
              <MessageCircle size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-500" />
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">Talk to Your Coach</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Get personalized feedback about this run
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
