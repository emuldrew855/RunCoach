/**
 * Tooltip Component
 *
 * A reusable tooltip that appears on hover.
 * Used to explain metrics and terms throughout the app.
 */

import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: string | React.ReactNode;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  showIcon?: boolean;
  iconSize?: number;
  maxWidth?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  showIcon = true,
  iconSize = 14,
  maxWidth = 280,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = -tooltipRect.height - 8;
          left = (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'bottom':
          top = triggerRect.height + 8;
          left = (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'left':
          top = (triggerRect.height - tooltipRect.height) / 2;
          left = -tooltipRect.width - 8;
          break;
        case 'right':
          top = (triggerRect.height - tooltipRect.height) / 2;
          left = triggerRect.width + 8;
          break;
      }

      // Adjust for viewport boundaries
      const absoluteLeft = triggerRect.left + left;
      const absoluteTop = triggerRect.top + top;

      if (absoluteLeft < 8) {
        left = -triggerRect.left + 8;
      } else if (absoluteLeft + tooltipRect.width > viewportWidth - 8) {
        left = viewportWidth - triggerRect.left - tooltipRect.width - 8;
      }

      if (absoluteTop < 8) {
        // Flip to bottom if tooltip goes above viewport
        top = triggerRect.height + 8;
      } else if (absoluteTop + tooltipRect.height > viewportHeight - 8) {
        // Flip to top if tooltip goes below viewport
        top = -tooltipRect.height - 8;
      }

      setTooltipPosition({ top, left });
    }
  }, [isVisible, position]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children || (
        showIcon && (
          <HelpCircle
            size={iconSize}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-help transition-colors"
          />
        )
      )}

      {isVisible && (
        <div
          ref={tooltipRef}
          className="absolute z-50 px-3 py-2 text-xs font-normal text-neutral-100 bg-neutral-800 dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-700"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            maxWidth: maxWidth,
            whiteSpace: 'normal',
          }}
        >
          {content}
          {/* Arrow */}
          <div
            className={`absolute w-2 h-2 bg-neutral-800 dark:bg-neutral-900 border-neutral-700 transform rotate-45 ${
              position === 'top'
                ? 'bottom-[-5px] left-1/2 -translate-x-1/2 border-r border-b'
                : position === 'bottom'
                ? 'top-[-5px] left-1/2 -translate-x-1/2 border-l border-t'
                : position === 'left'
                ? 'right-[-5px] top-1/2 -translate-y-1/2 border-t border-r'
                : 'left-[-5px] top-1/2 -translate-y-1/2 border-b border-l'
            }`}
          />
        </div>
      )}
    </span>
  );
};

/**
 * Metric explanations used throughout the app
 */
export const METRIC_TOOLTIPS = {
  executionScore: `Execution Score measures how closely you followed the planned workout. It combines: pace compliance (40%), distance accuracy (30%), HR zone adherence (20%), and pacing consistency (10%).`,

  hrDrift: `HR Drift shows how much your heart rate increased per kilometer during the run. Higher drift (>5 bpm/km) may indicate fatigue, dehydration, or starting too fast. Low drift (<2 bpm/km) suggests good pacing.`,

  paceConsistency: `Pace Consistency measures how even your splits were throughout the run. A score of 90%+ indicates excellent pacing, while below 75% suggests significant pace variation.`,

  paceDelta: `Pace Delta shows the difference between your first and second half pacing. Positive = negative split (faster finish), negative = positive split (slower finish/fade).`,

  zone1_2Percent: `The percentage of training time spent in easy aerobic zones (Zone 1-2). For marathon training, aim for ~80% of total training in these zones to build aerobic base without accumulating fatigue.`,

  zone4_5Percent: `The percentage of training time spent in hard/anaerobic zones (Zone 4-5). For marathon training, this should typically be 10-20%. More than 25% may indicate overtraining risk.`,

  effortMismatch: `Effort Mismatch occurs when your heart rate was higher than expected for the workout type. For easy runs, this means your HR crept into Zone 3+ when it should stay in Zone 2.`,

  avgZone: `Average HR Zone is calculated from your heart rate during the run. Zone 2 (2.0-2.5) is ideal for easy runs; Zone 3+ indicates harder effort.`,

  volumeChangePercent: `Volume Change shows how this week's planned distance compares to your typical weekly average. Changes >15% increase injury risk.`,

  adherenceRate: `Adherence Rate shows what percentage of planned workouts you completed over the past 4 weeks. Aim for 80%+ for optimal training adaptation.`,

  injuryRisk: `Injury Risk is assessed based on: sudden volume increases, too much high-intensity training, insufficient recovery, and HR drift patterns.`,

  recoveryNeeded: `Recovery Needed flag appears when metrics suggest you should prioritize rest before your next hard effort. This is based on HR drift, recent training load, and workout intensity.`,
};

export default Tooltip;
