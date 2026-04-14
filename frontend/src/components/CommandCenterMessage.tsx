/**
 * CommandCenterMessage Component
 *
 * Terminal/Report-style message display for Elite Performance Command Center
 * No bubbles, no gradients - clean technical aesthetic
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../types';
import { ActionChips } from './ActionChips';
import { InsightCards } from './InsightCards';
import { useInsightMetrics } from '../hooks/useInsightMetrics';
import { ChartSpecRenderer, extractChartSpecs, removeChartSpecs } from './charts/ChartSpecRenderer';

interface CommandCenterMessageProps {
  message: ChatMessage;
  conversationTitle?: string;
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return timeStr;
  }

  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${dateStr}, ${timeStr}`;
}

export function CommandCenterMessage({ message, conversationTitle }: CommandCenterMessageProps) {
  const { buildMetrics } = useInsightMetrics();
  if (message.role === 'user') {
    return (
      <div className="py-4 border-b border-neutral-200/30 dark:border-neutral-700/30">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-end">
            <div className="text-label-xs uppercase tracking-widest text-tertiary font-mono mt-1">
              YOU
            </div>
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono mt-0.5">
              {formatTimestamp(message.created_at)}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-neutral-700 dark:text-neutral-300 font-medium">
              {message.content}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message - Extract chart specs and build real metrics from actual data
  const chartSpecs = extractChartSpecs(message.content);
  const cleanContent = removeChartSpecs(message.content);
  const metrics = buildMetrics(cleanContent);

  return (
    <div className="py-6 border-b border-neutral-200/20 dark:border-neutral-700/20">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-end">
          <div className="text-label-xs uppercase tracking-widest font-mono mt-1" style={{ color: '#0891b2' }}>
            COACH
          </div>
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono mt-0.5">
            {formatTimestamp(message.created_at)}
          </div>
        </div>
        <div className="flex-1">
          <div className="prose dark:prose-invert prose-sm max-w-none
            prose-p:text-neutral-700 dark:prose-p:text-neutral-300 prose-p:leading-relaxed
            prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100 prose-headings:font-semibold prose-headings:tracking-tight
            prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100 prose-strong:font-semibold
            prose-ul:text-neutral-700 dark:prose-ul:text-neutral-300
            prose-ol:text-neutral-700 dark:prose-ol:text-neutral-300
            prose-code:text-cyan-600 dark:prose-code:text-cyan-400 prose-code:font-mono prose-code:text-xs
            prose-pre:bg-neutral-900 dark:prose-pre:bg-black prose-pre:border prose-pre:border-neutral-700
            prose-blockquote:border-l-cyan-500 prose-blockquote:text-neutral-600 dark:prose-blockquote:text-neutral-400
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {cleanContent}
            </ReactMarkdown>
          </div>

          {/* Render charts from specifications */}
          {chartSpecs.map((spec) => (
            <ChartSpecRenderer key={spec.id} chartSpec={spec} />
          ))}

          <InsightCards metrics={metrics} />
          <ActionChips
            messageContent={message.content}
            conversationTitle={conversationTitle}
          />
        </div>
      </div>
    </div>
  );
}
