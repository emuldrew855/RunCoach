import React, { useState } from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
  content: React.ReactNode;
}

interface TabNavigationProps {
  tabs: Tab[];
  defaultTab?: string;
  sticky?: boolean;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  tabs,
  defaultTab,
  sticky = true,
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  const activeTabContent = tabs.find(tab => tab.id === activeTab)?.content;

  return (
    <div className="flex flex-col h-full">
      {/* Tab Headers */}
      <div className={`bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 ${sticky ? 'sticky top-0 z-10' : ''}`}>
        <div className="flex overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[80px] px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-strava border-b-2 border-strava'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full min-w-[18px] text-center">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTabContent}
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};
