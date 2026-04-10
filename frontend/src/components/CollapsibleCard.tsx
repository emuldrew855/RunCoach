import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleCardProps {
  id: string; // Unique ID for localStorage
  title: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  id,
  title,
  defaultCollapsed = false,
  children,
  className = '',
  headerClassName = '',
}) => {
  const storageKey = `dashboard-collapsed-${id}`;

  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === 'true' : defaultCollapsed;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(isCollapsed));
  }, [isCollapsed, storageKey]);

  const toggleCollapsed = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className={`card ${className}`}>
      <button
        onClick={toggleCollapsed}
        className={`group w-full flex items-center justify-between p-4 -m-4 mb-0 rounded-t-lg hover:bg-gradient-to-r hover:from-gray-50 hover:to-transparent dark:hover:from-gray-700/50 dark:hover:to-transparent transition-all duration-300 ${headerClassName}`}
      >
        <h2 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent group-hover:from-strava group-hover:to-orange-600 transition-all duration-300">
          {title}
        </h2>
        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center group-hover:bg-gradient-to-br group-hover:from-strava group-hover:to-orange-600 transition-all duration-300 group-hover:scale-110">
          {isCollapsed ? (
            <ChevronDown className="text-gray-500 dark:text-gray-400 group-hover:text-white transition-colors" size={18} />
          ) : (
            <ChevronUp className="text-gray-500 dark:text-gray-400 group-hover:text-white transition-colors" size={18} />
          )}
        </div>
      </button>

      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[5000px] opacity-100 mt-4'
        }`}
      >
        {children}
      </div>
    </div>
  );
};
