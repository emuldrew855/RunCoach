import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatAPI, agentActionsAPI } from '../services/api';
import { Conversation, ChatMessage } from '../types';
import { Send, Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ActionConfirmationCard from '../components/ActionConfirmationCard';

export default function ChatPage() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [activityContext, setActivityContext] = useState<any>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingActions, setPendingActions] = useState<Map<string, any>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check for activity context from sessionStorage
  useEffect(() => {
    const contextStr = sessionStorage.getItem('chatContext');
    if (contextStr) {
      const context = JSON.parse(contextStr);
      setActivityContext(context);

      // Pre-fill the input based on context type
      if (context.type === 'weekly_analysis') {
        setInput(`Analyze my training week - provide a comprehensive overview of my progress this week, my plan for next week, and key recommendations for training, nutrition, sleep, and recovery to help me prepare for the week ahead.`);
      } else {
        // Activity context
        setInput(`I'd like to discuss my run from ${context.date}. ${context.distance} km in ${context.duration}.`);
      }

      // Clear the context so it doesn't persist
      sessionStorage.removeItem('chatContext');
    }
  }, []);

  const { data: conversations, refetch: refetchConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await chatAPI.getConversations();
      return response.data.conversations as Conversation[];
    },
  });

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await chatAPI.getConversationHistory(conversationId);
      setMessages(response.data.messages);
    } catch (error) {
      toast.error('Failed to load messages');
    }
  };

  const handleNewConversation = async () => {
    try {
      const response = await chatAPI.createConversation();
      refetchConversations();
      setSelectedConversation(response.data.conversation.id);
    } catch (error) {
      toast.error('Failed to create conversation');
    }
  };

  const handleEditConversation = (conv: Conversation) => {
    setEditingConvId(conv.id);
    setEditingTitle(conv.title || '');
  };

  const handleSaveTitle = async (convId: string) => {
    try {
      await chatAPI.updateConversation(convId, editingTitle);
      refetchConversations();
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

  const handleDeleteConversation = async (convId: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    try {
      await chatAPI.deleteConversation(convId);
      if (selectedConversation === convId) {
        setSelectedConversation(null);
      }
      refetchConversations();
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error('Failed to delete conversation');
    }
  };

  const generateSmartTitle = (message: string, context?: any): string => {
    // Detect patterns in the first message to generate a meaningful title
    const lowerMessage = message.toLowerCase();

    // Use context if available for more specific titles
    if (context?.type === 'weekly_analysis' && context.weekStart && context.weekEnd) {
      const startDate = new Date(context.weekStart);
      const endDate = new Date(context.weekEnd);
      const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `Weekly Analysis - ${startStr} to ${endStr}`;
    }

    if (lowerMessage.includes('weekly analysis') || lowerMessage.includes('analyze my training week')) {
      const date = new Date();
      return `Weekly Analysis - ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }

    if (lowerMessage.includes('run from') || lowerMessage.includes('discuss my run')) {
      return 'Run Discussion';
    }

    if (lowerMessage.includes('goal') || lowerMessage.includes('marathon') || lowerMessage.includes('race')) {
      return 'Goal Planning';
    }

    if (lowerMessage.includes('injury') || lowerMessage.includes('pain') || lowerMessage.includes('hurt')) {
      return 'Injury/Recovery';
    }

    if (lowerMessage.includes('training plan') || lowerMessage.includes('workout')) {
      return 'Training Plan';
    }

    if (lowerMessage.includes('nutrition') || lowerMessage.includes('diet') || lowerMessage.includes('fuel')) {
      return 'Nutrition Advice';
    }

    // Default: first 40 characters of message
    return message.length > 40 ? message.substring(0, 40) + '...' : message;
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedConversation || isStreaming) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      user_id: 0,
      conversation_id: selectedConversation,
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
    const currentConv = conversations?.find(c => c.id === selectedConversation);
    const isFirstMessage = messages.length === 0;
    if (isFirstMessage && currentConv && !currentConv.title) {
      const smartTitle = generateSmartTitle(messageText, activityContext);
      try {
        await chatAPI.updateConversation(selectedConversation, smartTitle);
        refetchConversations();
      } catch (error) {
        console.error('Failed to auto-generate title:', error);
      }
    }

    try {
      const token = localStorage.getItem('jwt');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: selectedConversation,
          message: input,
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

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        user_id: 0,
        conversation_id: selectedConversation,
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

  const handleApproveAction = async (actionId: string) => {
    try {
      await agentActionsAPI.approveAction(actionId);

      // Remove from pending actions
      setPendingActions(prev => {
        const newMap = new Map(prev);
        newMap.delete(actionId);
        return newMap;
      });

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

      // Remove from pending actions
      setPendingActions(prev => {
        const newMap = new Map(prev);
        newMap.delete(actionId);
        return newMap;
      });

      toast.success('Action rejected');
    } catch (error: any) {
      console.error('Reject action error:', error);
      toast.error(error.response?.data?.error || 'Failed to reject action');
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversations sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-4 flex flex-col">
        <button
          onClick={handleNewConversation}
          className="btn btn-primary w-full mb-4 flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          New Chat
        </button>

        <div className="flex-1 overflow-y-auto space-y-2">
          {conversations?.map((conv) => (
            <div
              key={conv.id}
              className={`group relative rounded-lg transition-colors ${
                selectedConversation === conv.id
                  ? 'bg-strava text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {editingConvId === conv.id ? (
                <div className="flex items-center gap-1 p-2">
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded"
                    autoFocus
                    onKeyPress={(e) => e.key === 'Enter' && handleSaveTitle(conv.id)}
                  />
                  <button
                    onClick={() => handleSaveTitle(conv.id)}
                    className="p-1 hover:bg-green-100 dark:hover:bg-green-900 rounded"
                  >
                    <Check size={16} className="text-green-600 dark:text-green-400" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded"
                  >
                    <X size={16} className="text-red-600 dark:text-red-400" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    onClick={() => setSelectedConversation(conv.id)}
                    className="flex-1 text-left px-3 py-2 text-sm"
                  >
                    {conv.title || 'New Conversation'}
                  </button>
                  <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditConversation(conv)}
                      className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded"
                      title="Rename"
                    >
                      <Edit2 size={14} className={selectedConversation === conv.id ? 'text-white' : 'text-blue-600 dark:text-blue-400'} />
                    </button>
                    <button
                      onClick={() => handleDeleteConversation(conv.id)}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded"
                      title="Delete"
                    >
                      <Trash2 size={14} className={selectedConversation === conv.id ? 'text-white' : 'text-red-600 dark:text-red-400'} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-600">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">AI Running Coach</h2>
          {activityContext && (
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
              <p className="font-semibold text-blue-900 dark:text-blue-300">📊 Discussing your run:</p>
              <p className="text-blue-700 dark:text-blue-400">
                {activityContext.activityName} • {activityContext.distance} km • {activityContext.pace}
                {activityContext.heartRate && ` • ${Number(activityContext.heartRate).toFixed(0)} bpm avg`}
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-strava text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}
              >
                {message.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                  <div className="prose dark:prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {streamingMessage && (
            <div className="flex justify-start">
              <div className="max-w-[70%] rounded-lg px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                <div className="prose dark:prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingMessage}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* Pending Actions */}
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

        <div className="p-4 border-t border-gray-200 dark:border-gray-600">
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
              placeholder="Ask your coach anything... (Shift+Enter for new line)"
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
    </div>
  );
}
