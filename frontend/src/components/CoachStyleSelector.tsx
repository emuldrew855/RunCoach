import { useState } from 'react';
import { Zap, Heart, BarChart3, TrendingUp, MessageCircle } from 'lucide-react';

export type CoachStyle = 'strict' | 'supportive' | 'analytical' | 'motivational';
export type CommunicationStyle = 'casual' | 'balanced' | 'professional';

interface CoachStyleSelectorProps {
  coachStyle: CoachStyle;
  strictnessLevel: number;
  communicationStyle: CommunicationStyle;
  onCoachStyleChange: (style: CoachStyle) => void;
  onStrictnessChange: (level: number) => void;
  onCommunicationStyleChange: (style: CommunicationStyle) => void;
}

const coachStyles = [
  {
    value: 'strict' as const,
    label: 'The Disciplinarian',
    icon: Zap,
    color: 'orange',
    description: 'No excuses, no shortcuts. Holds you accountable and pushes you to your limits.',
    personality: [
      'Direct and no-nonsense approach',
      'Minimal tolerance for missed workouts',
      'Focuses on discipline and commitment',
      'Pushes you hard but with your best interest at heart'
    ],
    example: '"Missing your tempo run today is not an option. This is where champions are made."'
  },
  {
    value: 'supportive' as const,
    label: 'The Encourager',
    icon: Heart,
    color: 'pink',
    description: 'Warm and understanding. Celebrates progress and helps you build confidence.',
    personality: [
      'Empathetic and patient',
      'Celebrates small wins',
      'Focuses on progress over perfection',
      'Provides emotional support during tough phases'
    ],
    example: '"Great job getting out there today! Every run is a step toward your goal."'
  },
  {
    value: 'analytical' as const,
    label: 'The Scientist',
    icon: BarChart3,
    color: 'blue',
    description: 'Data-driven and methodical. Uses metrics and science to optimize your training.',
    personality: [
      'Evidence-based recommendations',
      'Detailed analysis of your metrics',
      'Technical explanations of training principles',
      'Focuses on optimization and efficiency'
    ],
    example: '"Your heart rate data shows 65% zone 2 this week - let\'s aim for 70-75% next week."'
  },
  {
    value: 'motivational' as const,
    label: 'The Inspirer',
    icon: TrendingUp,
    color: 'green',
    description: 'Energetic and uplifting. Keeps your spirits high and your eyes on the prize.',
    personality: [
      'High energy and enthusiasm',
      'Focuses on your why and goals',
      'Uses motivational language',
      'Helps you overcome mental barriers'
    ],
    example: '"You\'re stronger than you think! Let\'s crush this training block together!"'
  }
];

const communicationStyles = [
  {
    value: 'casual' as const,
    label: 'Casual',
    description: 'Friendly and conversational, like chatting with a running buddy',
    example: 'Hey! How\'d the run feel today?'
  },
  {
    value: 'balanced' as const,
    label: 'Balanced',
    description: 'Professional but approachable, strikes the right balance',
    example: 'Great work on today\'s workout! Let\'s review your splits.'
  },
  {
    value: 'professional' as const,
    label: 'Professional',
    description: 'Formal and expert, like working with an elite coach',
    example: 'Your performance metrics indicate excellent progress.'
  }
];

const CoachStyleCard = ({
  style,
  selected,
  onClick
}: {
  style: typeof coachStyles[0];
  selected: boolean;
  onClick: () => void;
}) => {
  const Icon = style.icon;
  const colorClasses = {
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-500',
      icon: 'text-orange-600 dark:text-orange-400',
      text: 'text-orange-700 dark:text-orange-300'
    },
    pink: {
      bg: 'bg-pink-50 dark:bg-pink-900/20',
      border: 'border-pink-500',
      icon: 'text-pink-600 dark:text-pink-400',
      text: 'text-pink-700 dark:text-pink-300'
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-500',
      icon: 'text-blue-600 dark:text-blue-400',
      text: 'text-blue-700 dark:text-blue-300'
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-500',
      icon: 'text-green-600 dark:text-green-400',
      text: 'text-green-700 dark:text-green-300'
    }
  };

  const colors = colorClasses[style.color as keyof typeof colorClasses];

  return (
    <button
      onClick={onClick}
      className={`
        text-left p-6 rounded-lg border-2 transition-all
        ${selected
          ? `${colors.bg} ${colors.border} shadow-lg`
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
        }
      `}
    >
      <div className="flex items-start gap-4 mb-4">
        <div className={`p-3 rounded-lg ${colors.bg}`}>
          <Icon className={`${colors.icon}`} size={24} />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{style.label}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{style.description}</p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {style.personality.map((trait, idx) => (
          <div key={idx} className="flex items-start gap-2 text-sm">
            <span className={colors.text}>•</span>
            <span className="text-gray-700 dark:text-gray-300">{trait}</span>
          </div>
        ))}
      </div>

      <div className={`p-3 rounded-lg ${colors.bg} ${colors.text} text-sm italic`}>
        "{style.example}"
      </div>
    </button>
  );
};

export default function CoachStyleSelector({
  coachStyle,
  strictnessLevel,
  communicationStyle,
  onCoachStyleChange,
  onStrictnessChange,
  onCommunicationStyleChange
}: CoachStyleSelectorProps) {
  const [expandedSection, setExpandedSection] = useState<'style' | 'strictness' | 'communication' | null>('style');

  return (
    <div className="space-y-6">
      {/* Coach Personality Style */}
      <div className="space-y-4">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpandedSection(expandedSection === 'style' ? null : 'style')}
        >
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <MessageCircle size={20} />
              Coach Personality
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Choose your coach's approach and personality
            </p>
          </div>
          <span className="text-gray-400">{expandedSection === 'style' ? '−' : '+'}</span>
        </div>

        {expandedSection === 'style' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coachStyles.map((style) => (
              <CoachStyleCard
                key={style.value}
                style={style}
                selected={coachStyle === style.value}
                onClick={() => onCoachStyleChange(style.value)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Strictness Level */}
      <div className="space-y-4">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpandedSection(expandedSection === 'strictness' ? null : 'strictness')}
        >
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Zap size={20} />
              Accountability Level
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              How should your coach respond to missed or modified workouts?
            </p>
          </div>
          <span className="text-gray-400">{expandedSection === 'strictness' ? '−' : '+'}</span>
        </div>

        {expandedSection === 'strictness' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">Very Forgiving</span>
              <input
                type="range"
                min="1"
                max="5"
                value={strictnessLevel}
                onChange={(e) => onStrictnessChange(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-strava"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[100px] text-right">Very Strict</span>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Level {strictnessLevel}: {
                  strictnessLevel === 1 ? 'Very Forgiving' :
                  strictnessLevel === 2 ? 'Understanding' :
                  strictnessLevel === 3 ? 'Balanced' :
                  strictnessLevel === 4 ? 'Firm' :
                  'Very Strict'
                }
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {strictnessLevel === 1 && "Life happens! Your coach will be understanding about missed workouts and flexible with adjustments."}
                {strictnessLevel === 2 && "Your coach will acknowledge challenges while gently encouraging consistency."}
                {strictnessLevel === 3 && "A balanced approach - understanding when needed, but keeping you accountable to your goals."}
                {strictnessLevel === 4 && "Your coach expects dedication and will hold you accountable to your training plan."}
                {strictnessLevel === 5 && "No excuses. Your coach demands commitment and won't accept anything less than your best effort."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Communication Style */}
      <div className="space-y-4">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpandedSection(expandedSection === 'communication' ? null : 'communication')}
        >
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <MessageCircle size={20} />
              Communication Style
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              How formal or casual should your coach's language be?
            </p>
          </div>
          <span className="text-gray-400">{expandedSection === 'communication' ? '−' : '+'}</span>
        </div>

        {expandedSection === 'communication' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {communicationStyles.map((style) => (
              <button
                key={style.value}
                onClick={() => onCommunicationStyleChange(style.value)}
                className={`
                  text-left p-4 rounded-lg border-2 transition-all
                  ${communicationStyle === style.value
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }
                `}
              >
                <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">{style.label}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{style.description}</p>
                <div className={`
                  p-2 rounded text-sm italic
                  ${communicationStyle === style.value
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }
                `}>
                  "{style.example}"
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
