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
        className={`w-full flex items-center justify-between p-4 -m-4 mb-0 rounded-t-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${headerClassName}`}
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        {isCollapsed ? (
          <ChevronDown className="text-gray-500 dark:text-gray-400" size={20} />
        ) : (
          <ChevronUp className="text-gray-500 dark:text-gray-400" size={20} />
        )}
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
