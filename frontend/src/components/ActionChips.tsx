/**
 * ActionChips Component
 *
 * Context-aware action buttons that appear after coach responses
 * Detects mentions of metrics, dates, activities and offers relevant actions
 */

import { Calendar, TrendingUp, Activity, MapPin, Award, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ActionChip {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'info';
}

interface ActionChipsProps {
  messageContent: string;
  conversationTitle?: string;
}

export function ActionChips({ messageContent, conversationTitle }: ActionChipsProps) {
  const navigate = useNavigate();
  const chips: ActionChip[] = [];

  // Normalize content for easier matching
  const content = messageContent.toLowerCase();

  // Detect calendar/week mentions
  if (content.includes('week') || content.includes('weekly') || content.includes('this week') || content.includes('next week')) {
    chips.push({
      label: 'View Calendar',
      icon: <Calendar size={14} strokeWidth={2} />,
      action: () => navigate('/training-plan'),
      variant: 'primary'
    });
  }

  // Detect pace/speed mentions
  if (content.includes('pace') || content.includes('speed') || content.includes('min/km') || content.includes('min/mi')) {
    chips.push({
      label: 'View Pace Trends',
      icon: <TrendingUp size={14} strokeWidth={2} />,
      action: () => navigate('/dashboard'),
      variant: 'info'
    });
  }

  // Detect activity/run mentions (from conversation title)
  if (conversationTitle?.toLowerCase().includes('run:') || content.includes('this run') || content.includes('your run')) {
    chips.push({
      label: 'Activity Details',
      icon: <Activity size={14} strokeWidth={2} />,
      action: () => {
        // Try to extract activity from conversation title
        // This is a simplified version - could be enhanced
        navigate('/activities');
      },
      variant: 'secondary'
    });
  }

  // Detect distance/volume mentions
  if (content.includes('distance') || content.includes('volume') || content.includes('mileage') || content.includes('kilometers')) {
    chips.push({
      label: 'View Training Volume',
      icon: <BarChart3 size={14} strokeWidth={2} />,
      action: () => navigate('/dashboard'),
      variant: 'info'
    });
  }

  // Detect goal mentions
  if (content.includes('goal') || content.includes('target') || content.includes('race') || content.includes('marathon')) {
    chips.push({
      label: 'Review Goals',
      icon: <Award size={14} strokeWidth={2} />,
      action: () => navigate('/profile'),
      variant: 'success'
    });
  }

  // Detect route/location mentions
  if (content.includes('route') || content.includes('terrain') || content.includes('elevation')) {
    chips.push({
      label: 'View Route',
      icon: <MapPin size={14} strokeWidth={2} />,
      action: () => navigate('/activities'),
      variant: 'secondary'
    });
  }

  // Don't render if no chips detected
  if (chips.length === 0) {
    return null;
  }

  // Variant styles
  const variantStyles = {
    primary: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/40',
    secondary: 'bg-neutral-700/30 border-neutral-600/30 text-neutral-300 hover:bg-neutral-700/50 hover:border-neutral-500/40',
    success: 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 hover:border-green-500/40',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/40'
  };

  return (
    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-neutral-200/20 dark:border-neutral-700/20">
      {chips.slice(0, 4).map((chip, index) => (
        <button
          key={index}
          onClick={chip.action}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium
            transition-all duration-200 hover:shadow-sm
            ${variantStyles[chip.variant || 'secondary']}
          `}
        >
          {chip.icon}
          {chip.label}
        </button>
      ))}
    </div>
  );
}
