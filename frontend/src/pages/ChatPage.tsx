import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatAPI, agentActionsAPI } from '../services/api';
import { Conversation, ChatMessage } from '../types';
import { Send, Plus, Edit2, Trash2, Check, X, Menu, ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ActionConfirmationCard from '../components/ActionConfirmationCard';
import ErrorDisplay, { InlineError, LoadingDisplay } from '../components/ErrorDisplay';
import { TypingIndicator } from '../components/TypingIndicator';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useIsMobile } from '../hooks/useIsMobile';
import { CommandCenterMessage } from '../components/CommandCenterMessage';

export default function ChatPage() {
  const { keyboardHeight } = useKeyboardHeight();
  const isMobile = useIsMobile();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [activityContext, setActivityContext] = useState<any>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingActions, setPendingActions] = useState<Map<string, any>>(new Map());
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<Error | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ show: boolean; convId: string | null; title: string }>({
    show: false,
    convId: null,
    title: '',
  });
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State to track if we need to create a conversation from context
  const [pendingContextConversation, setPendingContextConversation] = useState<{
    title: string;
    input: string;
    context: any;
  } | null>(null);

  // Check for activity context from sessionStorage
  useEffect(() => {
    const contextStr = sessionStorage.getItem('chatContext');
    if (contextStr) {
      const context = JSON.parse(contextStr);
      setActivityContext(context);

      let inputText = '';
      let title = '';

      // Determine input and title based on context type
      if (context.type === 'weekly_analysis') {
        inputText = `Analyze my training week - provide a comprehensive overview of my progress this week, my plan for next week, and key recommendations for training, nutrition, sleep, and recovery to help me prepare for the week ahead.`;
        const startDate = new Date(context.weekStart);
        const endDate = new Date(context.weekEnd);
        const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        title = `Weekly Progress - ${startStr} to ${endStr}`;
      } else if (context.type === 'planned_week_review') {
        inputText = `Review my planned training week - analyze the structure, balance, and quality of my upcoming scheduled workouts. Focus on workout distribution, intensity balance, recovery placement, and suggest specific improvements to the plan itself. Don't focus on my adherence or completed workouts, just review the planned schedule.`;
        const startDate = new Date(context.weekStart);
        const endDate = new Date(context.weekEnd);
        const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        title = `Plan Review - ${startStr} to ${endStr}`;
      } else {
        // Activity context
        inputText = `I'd like to discuss my run from ${context.date}. ${context.distance} km in ${context.duration}.`;
      }

      setInput(inputText);

      // Clear the context so it doesn't persist
      sessionStorage.removeItem('chatContext');

      // For weekly/plan contexts, auto-create a new conversation
      if (title) {
        setPendingContextConversation({ title, input: inputText, context });
      }
    }
  }, []);

  // Create conversation when we have a pending context and the API is ready
  useEffect(() => {
    if (pendingContextConversation) {
      chatAPI.createConversation(pendingContextConversation.title).then(response => {
        const newConvId = response.data.data.conversation.id;
        setSelectedConversation(newConvId);
        setPendingContextConversation(null);
      }).catch(error => {
        console.error('Failed to auto-create conversation:', error);
        setPendingContextConversation(null);
      });
    }
  }, [pendingContextConversation]);

  const {
    data: conversationsRaw,
    refetch: refetchConversations,
    isLoading: conversationsLoading,
    error: conversationsError,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await chatAPI.getConversations();
      return response.data.data.conversations as Conversation[];
    },
    retry: 2,
    retryDelay: 1000,
  });

  // Filter out any duplicate conversations (by ID) as a safety measure
  const conversations = conversationsRaw
    ? conversationsRaw.filter((conv, index, self) =>
        index === self.findIndex(c => c.id === conv.id)
      )
    : undefined;

  // Fetch pending actions
  const {
    data: pendingActionsData,
    refetch: refetchPendingActions,
    error: pendingActionsError,
  } = useQuery({
    queryKey: ['pendingActions'],
    queryFn: async () => {
      const response = await agentActionsAPI.getPendingActions();
      return response.data.data.actions || [];
    },
    refetchInterval: 5000, // Refetch every 5 seconds
    retry: 1,
    retryDelay: 2000,
  });

  // Update pendingActions state when data changes
  // Filter to only show actions for the current conversation
  useEffect(() => {
    if (pendingActionsData && selectedConversation) {
      const actionsMap = new Map();
      pendingActionsData.forEach((action: any) => {
        // Only include actions for the current conversation
        if (action.conversation_id === selectedConversation) {
          actionsMap.set(action.id, action);
        }
      });
      setPendingActions(actionsMap);
    } else if (!selectedConversation) {
      // Clear pending actions if no conversation is selected
      setPendingActions(new Map());
    }
  }, [pendingActionsData, selectedConversation]);

  useEffect(() => {
    if (conversations && conversations.length > 0 && !selectedConversation) {
      setSelectedConversation(conversations[0].id);
    }
  }, [conversations, selectedConversation]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation);
    }
  }, [selectedConversation]);

  // Reload messages when tab becomes visible to prevent stale/duplicate state
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && selectedConversation && !isStreaming) {
        loadMessages(selectedConversation);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [selectedConversation, isStreaming]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const loadMessages = async (conversationId: string) => {
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const response = await chatAPI.getConversationHistory(conversationId);
      const fetchedMessages = response.data.data.messages;

      // Deduplicate messages - by ID first, then by content+role as fallback
      // This handles optimistic messages that have temporary IDs
      const seen = new Set<string>();
      const uniqueMessages = fetchedMessages.filter((msg: ChatMessage) => {
        // Primary key: database ID
        const idKey = `id:${msg.id}`;
        if (seen.has(idKey)) return false;
        seen.add(idKey);

        // Secondary key: content + role (catches optimistic duplicates)
        const contentKey = `${msg.role}:${msg.content.substring(0, 100)}`;
        if (seen.has(contentKey)) return false;
        seen.add(contentKey);

        return true;
      });

      setMessages(uniqueMessages);
    } catch (error: any) {
      console.error('Failed to load messages:', error);
      setMessagesError(error);
      const errorMessage = error.response?.status === 503
        ? 'Server is temporarily unavailable'
        : error.message?.includes('Network')
        ? 'Connection lost. Check your internet.'
        : 'Failed to load messages';
      toast.error(errorMessage);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleNewConversation = async () => {
    try {
      const response = await chatAPI.createConversation();
      await refetchConversations(); // Await to ensure list updates before selecting
      setSelectedConversation(response.data.data.conversation.id);
    } catch (error: any) {
      console.error('Failed to create conversation:', error);
      const errorMessage = error.response?.status === 503
        ? 'Server is currently unavailable'
        : 'Failed to create conversation. Please try again.';
      toast.error(errorMessage);
    }
  };

  const handleEditConversation = (conv: Conversation) => {
    setEditingConvId(conv.id);
    setEditingTitle(conv.title || '');
  };

  const handleSaveTitle = async (convId: string) => {
    try {
      await chatAPI.updateConversation(convId, editingTitle);
      await refetchConversations(); // Await to ensure UI updates immediately
      setEditingConvId(null);
      toast.success('Conversation renamed');
    } catch (error) {
      toast.error('Failed to update conversation');
    }
  };

  const handleCancelEdit = () => {
    setEditingConvId(null);
    setEditingTitle('');
  };

  const handleDeleteConversation = (convId: string, title: string) => {
    setDeleteConfirmation({ show: true, convId, title });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation.convId) return;

    try {
      await chatAPI.deleteConversation(deleteConfirmation.convId);
      if (selectedConversation === deleteConfirmation.convId) {
        setSelectedConversation(null);
      }
      refetchConversations();
      toast.success('Conversation deleted');
      setDeleteConfirmation({ show: false, convId: null, title: '' });
    } catch (error) {
      toast.error('Failed to delete conversation');
      setDeleteConfirmation({ show: false, convId: null, title: '' });
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmation({ show: false, convId: null, title: '' });
  };

  const handleDeleteAll = () => {
    setDeleteAllConfirmation(true);
  };

  const confirmDeleteAll = async () => {
    if (!conversations || conversations.length === 0) return;

    try {
      // Delete all conversations
      await Promise.all(
        conversations.map(conv => chatAPI.deleteConversation(conv.id))
      );

      setSelectedConversation(null);
      await refetchConversations();
      toast.success(`Deleted ${conversations.length} conversation${conversations.length > 1 ? 's' : ''}`);
      setDeleteAllConfirmation(false);
    } catch (error) {
      toast.error('Failed to delete all conversations');
      setDeleteAllConfirmation(false);
    }
  };

  const cancelDeleteAll = () => {
    setDeleteAllConfirmation(false);
  };

  // Group conversations by date
  const groupConversationsByDate = (convs: Conversation[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(lastWeekStart.getDate() - 14);

    const groups: { [key: string]: Conversation[] } = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Last Week': [],
      'Older': []
    };

    convs.forEach(conv => {
      const convDate = new Date(conv.created_at);
      const convDay = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate());

      if (convDay.getTime() === today.getTime()) {
        groups['Today'].push(conv);
      } else if (convDay.getTime() === yesterday.getTime()) {
        groups['Yesterday'].push(conv);
      } else if (convDate >= thisWeekStart) {
        groups['This Week'].push(conv);
      } else if (convDate >= lastWeekStart) {
        groups['Last Week'].push(conv);
      } else {
        groups['Older'].push(conv);
      }
    });

    // Filter out empty groups
    return Object.entries(groups).filter(([_, convs]) => convs.length > 0);
  };

  // Handle ESC key to close delete modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteConfirmation.show) {
          cancelDelete();
        } else if (deleteAllConfirmation) {
          cancelDeleteAll();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [deleteConfirmation.show, deleteAllConfirmation]);

  const generateSmartTitle = (message: string, context?: any): string => {
    // Detect patterns in the first message to generate a meaningful title
    const lowerMessage = message.toLowerCase();
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Use context if available for more specific titles
    if (context?.type === 'weekly_analysis' && context.weekStart && context.weekEnd) {
      const startDate = new Date(context.weekStart);
      const endDate = new Date(context.weekEnd);
      const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `Weekly Progress - ${startStr} to ${endStr}`;
    }

    if (context?.type === 'planned_week_review' && context.weekStart && context.weekEnd) {
      const startDate = new Date(context.weekStart);
      const endDate = new Date(context.weekEnd);
      const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `Plan Review - ${startStr} to ${endStr}`;
    }

    // Pattern matching for common topics
    if (lowerMessage.includes('weekly analysis') || lowerMessage.includes('analyze my training week') || lowerMessage.includes('my week')) {
      return `Weekly Analysis - ${dateStr}`;
    }

    if (lowerMessage.includes('review my plan') || lowerMessage.includes('planned training week') || lowerMessage.includes('upcoming week')) {
      return `Plan Review - ${dateStr}`;
    }

    if (lowerMessage.includes('run from') || lowerMessage.includes('discuss my run') || lowerMessage.includes('about my run')) {
      return `Run Discussion - ${dateStr}`;
    }

    if (lowerMessage.includes('marathon')) {
      return `Marathon Training - ${dateStr}`;
    }

    if (lowerMessage.includes('half marathon') || lowerMessage.includes('half-marathon')) {
      return `Half Marathon - ${dateStr}`;
    }

    if (lowerMessage.includes('5k') || lowerMessage.includes('5 k')) {
      return `5K Training - ${dateStr}`;
    }

    if (lowerMessage.includes('10k') || lowerMessage.includes('10 k')) {
      return `10K Training - ${dateStr}`;
    }

    if (lowerMessage.includes('goal') || lowerMessage.includes('race')) {
      return `Goal Planning - ${dateStr}`;
    }

    if (lowerMessage.includes('injury') || lowerMessage.includes('pain') || lowerMessage.includes('hurt') || lowerMessage.includes('sore')) {
      return `Injury/Recovery - ${dateStr}`;
    }

    if (lowerMessage.includes('training plan') || lowerMessage.includes('plan')) {
      return `Training Plan - ${dateStr}`;
    }

    if (lowerMessage.includes('workout') || lowerMessage.includes('session')) {
      return `Workout Help - ${dateStr}`;
    }

    if (lowerMessage.includes('nutrition') || lowerMessage.includes('diet') || lowerMessage.includes('fuel') || lowerMessage.includes('eat')) {
      return `Nutrition Advice - ${dateStr}`;
    }

    if (lowerMessage.includes('recovery') || lowerMessage.includes('rest') || lowerMessage.includes('sleep')) {
      return `Recovery Tips - ${dateStr}`;
    }

    if (lowerMessage.includes('pace') || lowerMessage.includes('speed') || lowerMessage.includes('faster')) {
      return `Pace/Speed - ${dateStr}`;
    }

    if (lowerMessage.includes('heart rate') || lowerMessage.includes('hr zone') || lowerMessage.includes('zone')) {
      return `HR Zones - ${dateStr}`;
    }

    if (lowerMessage.includes('taper') || lowerMessage.includes('before race')) {
      return `Race Prep - ${dateStr}`;
    }

    if (lowerMessage.includes('strength') || lowerMessage.includes('cross train')) {
      return `Cross Training - ${dateStr}`;
    }

    // Extract key words from the message for a more specific title
    const keyWords = message.match(/\b(tempo|interval|long run|easy run|fartlek|hill|track)\b/i);
    if (keyWords) {
      const workoutType = keyWords[1].charAt(0).toUpperCase() + keyWords[1].slice(1).toLowerCase();
      return `${workoutType} Discussion - ${dateStr}`;
    }

    // Default: first 35 characters of message + date
    const truncated = message.length > 35 ? message.substring(0, 35).trim() + '...' : message;
    return `${truncated} - ${dateStr}`;
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    // Auto-create a conversation if none is selected
    let conversationId = selectedConversation;
    if (!conversationId) {
      try {
        const response = await chatAPI.createConversation();
        conversationId = response.data.data.conversation.id;

        if (!conversationId) {
          throw new Error('No conversation ID returned from server');
        }

        setSelectedConversation(conversationId);

        // Wait for conversations list to refresh to ensure DB consistency
        await refetchConversations();

        // Small delay to ensure database transaction is committed
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        console.error('Failed to create conversation:', error);
        toast.error('Failed to create conversation. Please try again.');
        return;
      }
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      user_id: 0,
      conversation_id: conversationId,
      role: 'user',
      content: input,
      created_at: new Date().toISOString(),
    };

    const messageText = input;
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setStreamingMessage('');

    // Auto-generate title for conversations that don't have one yet
    // Check if this is the first message by looking at current messages state
    const isFirstMessage = messages.length === 0;
    const currentConv = conversations?.find(c => c.id === conversationId);
    const hasNoTitle = !currentConv?.title || currentConv.title === 'New conversation';

    if (isFirstMessage || hasNoTitle) {
      const smartTitle = generateSmartTitle(messageText, activityContext);
      try {
        await chatAPI.updateConversation(conversationId, smartTitle);
        await refetchConversations(); // Await to ensure UI updates immediately
      } catch (error) {
        console.error('Failed to auto-generate title:', error);
      }
    }

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
          message: messageText,
        }),
      });

      // Check for conversation not found (404) - conversation was deleted or never created
      if (response.status === 404) {
        setIsStreaming(false);
        setSelectedConversation(null);
        toast.error('Conversation not found. Please create a new conversation and try again.');
        return;
      }

      // Check for token limit error (429)
      if (response.status === 429) {
        const errorData = await response.json();
        if (errorData.code === 'TOKEN_LIMIT_EXCEEDED') {
          toast.error(
            `Daily Token Limit Reached!\n\n${errorData.details.message}\n\nUsed: ${errorData.details.used.toLocaleString()} / ${errorData.details.limit.toLocaleString()} tokens\n\nYour limit will reset in 24 hours.`,
            {
              duration: 10000,
              style: {
                maxWidth: '500px',
              },
            }
          );
          setIsStreaming(false);
          return;
        }
      }

      // Check for other non-OK responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'An error occurred' }));
        toast.error(errorData.error || `Server error: ${response.status}`);
        setIsStreaming(false);
        return;
      }

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

              // Handle content streaming
              if (parsed.type === 'content' && parsed.content) {
                fullResponse += parsed.content;
                setStreamingMessage(fullResponse);
              }
              // Legacy format support (no type field)
              else if (parsed.content && !parsed.type) {
                fullResponse += parsed.content;
                setStreamingMessage(fullResponse);
              }
              // Handle pending action events
              else if (parsed.type === 'pending_action') {
                setPendingActions(prev => {
                  const newMap = new Map(prev);
                  newMap.set(parsed.action_id, {
                    action_id: parsed.action_id,
                    action_type: parsed.action_type,
                    action_payload: parsed.action_payload,
                    description: parsed.description,
                  });
                  return newMap;
                });
              }
              // Handle error events
              else if (parsed.type === 'error') {
                toast.error(parsed.error || 'An error occurred');
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      // Clear streaming message
      setStreamingMessage('');

      // Reload messages from backend to ensure we have the latest state
      // This prevents duplicates and ensures single source of truth
      await loadMessages(conversationId);
    } catch (error) {
      console.error('Send message error:', error);
      toast.error('Failed to send message');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleApproveAction = async (actionId: string) => {
    try {
      await agentActionsAPI.approveAction(actionId);

      // Refetch pending actions to update the list
      await refetchPendingActions();

      // Reload messages to show updated plan
      if (selectedConversation) {
        await loadMessages(selectedConversation);
      }

      toast.success('Action approved and executed');
    } catch (error: any) {
      console.error('Approve action error:', error);
      toast.error(error.response?.data?.error || 'Failed to approve action');
    }
  };

  const handleRejectAction = async (actionId: string, reason?: string) => {
    try {
      await agentActionsAPI.rejectAction(actionId, reason);

      // Refetch pending actions to update the list
      await refetchPendingActions();

      toast.success('Action rejected');
    } catch (error: any) {
      console.error('Reject action error:', error);
      toast.error(error.response?.data?.error || 'Failed to reject action');
    }
  };

  return (
    <div className="flex h-[calc(100dvh-8rem)] md:h-[calc(100vh-8rem)] gap-2 md:gap-4 max-w-full mx-auto w-full relative overflow-hidden">
      {/* Mobile sidebar backdrop */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Conversations sidebar - Minimalist Timeline */}
      <div className={`${showSidebar ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'md:hidden' : 'md:translate-x-0'} fixed md:relative top-0 left-0 h-full md:h-auto w-64 md:w-56 lg:w-64 bg-neutral-900 dark:bg-black rounded-lg shadow-xl md:shadow border border-neutral-700/50 p-3 flex flex-col flex-shrink-0 transition-all duration-300 z-50 md:z-auto`}>
        {/* Close button for mobile */}
        <button
          onClick={() => setShowSidebar(false)}
          className="md:hidden absolute top-3 right-3 p-1.5 hover:bg-neutral-800 dark:hover:bg-neutral-900 rounded text-neutral-400 hover:text-neutral-200"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        {/* Collapse button for desktop */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 p-1.5 bg-neutral-900 dark:bg-black border border-neutral-700/50 rounded-full hover:bg-neutral-800 dark:hover:bg-neutral-900 shadow-lg transition-colors z-10"
          title={sidebarCollapsed ? "Show conversations" : "Hide conversations"}
        >
          <ChevronLeft size={14} strokeWidth={1.5} className="text-neutral-400" />
        </button>

        {/* New Session button - Technical */}
        <button
          onClick={handleNewConversation}
          className="w-full mb-3 px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 text-xs font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={14} strokeWidth={2} />
          NEW SESSION
        </button>

        {/* Delete All button - only show if there are conversations */}
        {conversations && conversations.length > 0 && (
          <button
            onClick={handleDeleteAll}
            className="w-full mb-5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded text-red-400 text-[10px] font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
          >
            <Trash2 size={12} strokeWidth={2} />
            DELETE ALL ({conversations.length})
          </button>
        )}

        {/* Session History - Timeline */}
        <div className="flex-1 overflow-y-auto command-center-scroll">
          {conversationsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b border-cyan-500"></div>
            </div>
          ) : conversationsError ? (
            <div className="p-3 text-center">
              <InlineError
                message="Failed to load conversations"
                onRetry={() => refetchConversations()}
              />
            </div>
          ) : conversations && conversations.length === 0 ? (
            <div className="text-center text-neutral-500 text-xs font-mono py-8">
              NO SESSIONS
              <br />
              <span className="text-[10px] text-neutral-600">START NEW SESSION</span>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline vertical line */}
              <div className="absolute left-[7px] top-0 bottom-0 w-px bg-neutral-700/50" />

              {groupConversationsByDate(conversations || []).map(([dateLabel, groupConvs]) => (
                <div key={dateLabel} className="mb-6">
                  {/* Date separator */}
                  <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 dark:text-neutral-500 mb-3 pl-6">
                    {dateLabel}
                  </div>

                  {groupConvs.map((conv, index) => (
                <div
                  key={conv.id}
                  className="relative pl-6 pb-4 group"
                >
                  {editingConvId === conv.id ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="px-2 py-1 text-xs bg-neutral-800 text-neutral-100 border border-neutral-600 rounded font-mono"
                        autoFocus
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveTitle(conv.id)}
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSaveTitle(conv.id)}
                          className="flex-1 p-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded text-green-400 text-xs"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="flex-1 p-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded text-red-400 text-xs"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Timeline dot */}
                      <div className={`absolute left-0 top-1 w-[15px] h-[15px] rounded-full border-2 transition-all ${
                        selectedConversation === conv.id
                          ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                          : 'bg-neutral-900 border-neutral-600 group-hover:border-cyan-500/50'
                      }`} />

                      <button
                        onClick={() => setSelectedConversation(conv.id)}
                        className="w-full text-left"
                      >
                        {/* Date in monospace */}
                        <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-0.5">
                          {new Date(conv.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase()}
                        </div>

                        {/* Title */}
                        <div className={`text-xs leading-tight transition-colors ${
                          selectedConversation === conv.id
                            ? 'text-neutral-100 font-medium'
                            : 'text-neutral-400 group-hover:text-neutral-300'
                        }`}>
                          {conv.title || <span className="italic opacity-60">Untitled Session</span>}
                        </div>
                      </button>

                      {/* Action buttons - minimal */}
                      <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditConversation(conv)}
                          className="p-1 hover:bg-neutral-800 rounded text-neutral-500 hover:text-cyan-400"
                          title="Rename"
                        >
                          <Edit2 size={11} strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => handleDeleteConversation(conv.id, conv.title || 'New Session')}
                          className="p-1 hover:bg-neutral-800 rounded text-neutral-500 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={11} strokeWidth={1.5} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl dark:shadow-gray-900/50 flex flex-col border border-gray-200 dark:border-gray-700">
        <div className="p-4 md:p-5 bg-neutral-900 dark:bg-black border-b border-neutral-700/50">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setShowSidebar(true)}
              className="md:hidden p-1.5 hover:bg-neutral-800 rounded transition-colors"
            >
              <Menu size={18} className="text-neutral-400" strokeWidth={1.5} />
            </button>

            {/* Desktop expand sidebar button (when collapsed) */}
            {sidebarCollapsed && !isMobile && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="hidden md:flex p-1.5 hover:bg-neutral-800 rounded transition-colors"
                title="Show conversations"
              >
                <ChevronRight size={18} className="text-neutral-400" strokeWidth={1.5} />
              </button>
            )}

            <Activity size={20} className="text-cyan-500" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm md:text-base font-semibold text-neutral-100 tracking-tight flex items-center gap-2">
                <span className="truncate">Performance Command Center</span>
                <span className="text-[9px] md:text-[10px] font-mono font-normal bg-cyan-500/10 text-cyan-400 px-2 py-0.5 border border-cyan-500/20 whitespace-nowrap uppercase tracking-wider">
                  ACTIVE
                </span>
              </h2>
              <p className="text-[10px] md:text-xs text-neutral-500 font-mono hidden sm:block">Real-time coaching & analysis</p>
            </div>
          </div>
          {activityContext && (
            <div className="mt-3 p-3 bg-neutral-800/50 border border-neutral-700/50 text-xs font-mono">
              <p className="text-cyan-400 mb-1 uppercase tracking-wider text-[10px]">Context Loaded</p>
              <p className="text-neutral-300">
                {activityContext.activityName} • {activityContext.distance} km • {activityContext.pace}
                {activityContext.heartRate && ` • ${Number(activityContext.heartRate).toFixed(0)} bpm`}
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto command-center-scroll p-2 sm:p-4 space-y-3 sm:space-y-4">
          {messagesLoading ? (
            <LoadingDisplay message="Loading conversation..." />
          ) : messagesError ? (
            <ErrorDisplay
              error={messagesError}
              title="Failed to Load Messages"
              message="Unable to load conversation history. Please try again."
              onRetry={() => selectedConversation && loadMessages(selectedConversation)}
              type={messagesError.message?.includes('Network') || messagesError.message?.includes('fetch') ? 'network' : 'general'}
            />
          ) : messages.length === 0 && !isStreaming ? (
            <div className="flex items-center justify-center h-full">
              <div className="max-w-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <Activity size={32} className="text-cyan-500" strokeWidth={1.5} />
                  <div>
                    <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
                      System Ready
                    </h3>
                    <p className="text-sm text-neutral-500 font-mono">Awaiting your input</p>
                  </div>
                </div>
                <div className="border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 p-6">
                  <p className="text-label-xs uppercase tracking-widest text-tertiary font-mono mb-4">Available Modules</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <div className="w-1 h-full bg-cyan-500 mt-1"></div>
                      <div>
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100">Training Analysis</p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">Plans, workouts, periodization</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1 h-full bg-cyan-500 mt-1"></div>
                      <div>
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100">Performance Metrics</p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">Pace, HR, load analysis</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1 h-full bg-cyan-500 mt-1"></div>
                      <div>
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100">Nutrition Strategy</p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">Fueling, hydration, recovery</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1 h-full bg-cyan-500 mt-1"></div>
                      <div>
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100">Race Preparation</p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">Taper, strategy, execution</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200/20 dark:divide-neutral-700/20">
              {messages.map((message) => {
                const currentConv = conversations?.find(c => c.id === selectedConversation);
                return (
                  <CommandCenterMessage
                    key={message.id}
                    message={message}
                    conversationTitle={currentConv?.title}
                  />
                );
              })}
            </div>
          )}

          {/* Show typing indicator while waiting for response to start */}
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

          {/* Pending Actions */}
          {pendingActionsError && (
            <div className="flex justify-center">
              <div className="w-full max-w-[85%]">
                <InlineError
                  message="Failed to load pending actions"
                  onRetry={() => refetchPendingActions()}
                />
              </div>
            </div>
          )}
          {Array.from(pendingActions.values()).map((action) => (
            <div key={action.action_id} className="flex justify-center">
              <div className="w-full max-w-[85%]">
                <ActionConfirmationCard
                  action={action}
                  onApprove={handleApproveAction}
                  onReject={handleRejectAction}
                />
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        <div
          className="p-3 md:p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          style={{ paddingBottom: keyboardHeight > 0 ? `${keyboardHeight + 12}px` : undefined }}
        >
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={isMobile ? "Ask your coach..." : "Ask your coach anything... (Shift+Enter for new line)"}
              className="flex-1 input resize-none min-h-[44px] max-h-[200px] overflow-y-auto"
              rows={1}
              disabled={isStreaming}
              style={{
                height: 'auto',
                minHeight: '44px',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 200) + 'px';
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isStreaming}
              className="btn btn-primary shrink-0"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.show && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={cancelDelete}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="text-red-600 dark:text-red-400" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Delete Conversation?
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                You're about to delete:
              </p>
              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                "{deleteConfirmation.title}"
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelDelete}
                className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {deleteAllConfirmation && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={cancelDeleteAll}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="text-red-600 dark:text-red-400" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Delete All Conversations?
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800 dark:text-red-300 font-medium">
                ⚠️ You're about to permanently delete all {conversations?.length || 0} conversation{conversations && conversations.length > 1 ? 's' : ''}.
              </p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                All messages and conversation history will be lost forever.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelDeleteAll}
                className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAll}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
