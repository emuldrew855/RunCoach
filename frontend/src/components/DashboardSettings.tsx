import React, { useState } from 'react';
import { Settings, X } from 'lucide-react';

export interface DashboardVisibility {
  marathonGoal: boolean;
  trainingBlock: boolean;
  alerts: boolean;
  upcomingWorkouts: boolean;
  statsCards: boolean;
  hrZones: boolean;
  recentActivities: boolean;
}

const DEFAULT_VISIBILITY: DashboardVisibility = {
  marathonGoal: true,
  trainingBlock: true,
  alerts: true,
  upcomingWorkouts: true,
  statsCards: true,
  hrZones: true,
  recentActivities: true,
};

const SECTION_LABELS: Record<keyof DashboardVisibility, string> = {
  marathonGoal: 'Marathon Goal Countdown',
  trainingBlock: 'Training Block Progress',
  alerts: 'Training Alerts',
  upcomingWorkouts: 'Upcoming Workouts',
  statsCards: 'Statistics Cards',
  hrZones: 'Heart Rate Zones',
  recentActivities: 'Recent Activities',
};

interface DashboardSettingsProps {
  visibility: DashboardVisibility;
  onChange: (visibility: DashboardVisibility) => void;
}

export const DashboardSettings: React.FC<DashboardSettingsProps> = ({
  visibility,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSection = (section: keyof DashboardVisibility) => {
    onChange({
      ...visibility,
      [section]: !visibility[section],
    });
  };

  const resetToDefault = () => {
    onChange(DEFAULT_VISIBILITY);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="btn btn-secondary flex items-center gap-2"
      >
        <Settings size={16} />
        Customize
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Customize Dashboard
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Choose which sections to display on your dashboard
          </p>

          {Object.entries(SECTION_LABELS).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={visibility[key as keyof DashboardVisibility]}
                onChange={() => toggleSection(key as keyof DashboardVisibility)}
                className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-strava focus:ring-strava focus:ring-offset-0"
              />
              <span className="text-gray-900 dark:text-gray-100 group-hover:text-strava dark:group-hover:text-strava">
                {label}
              </span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={resetToDefault}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-strava dark:hover:text-strava"
          >
            Reset to Default
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="btn btn-primary"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export function useDashboardVisibility() {
  const [visibility, setVisibility] = useState<DashboardVisibility>(() => {
    const stored = localStorage.getItem('dashboard-visibility');
    return stored ? JSON.parse(stored) : DEFAULT_VISIBILITY;
  });

  const updateVisibility = (newVisibility: DashboardVisibility) => {
    setVisibility(newVisibility);
    localStorage.setItem('dashboard-visibility', JSON.stringify(newVisibility));
  };

  return { visibility, updateVisibility };
}
