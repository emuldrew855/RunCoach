import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="rounded-2xl px-4 py-3 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-700 dark:to-gray-600 border border-blue-100 dark:border-gray-600 rounded-tl-sm shadow-md">
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 bg-blue-400 dark:bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-2 h-2 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-2 h-2 bg-pink-400 dark:bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
    </div>
  );
};
