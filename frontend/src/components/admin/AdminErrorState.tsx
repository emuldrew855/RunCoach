/**
 * Admin Error State Component
 *
 * Reusable error state for admin pages with retry functionality.
 */

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AdminErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export default function AdminErrorState({
  title = 'Failed to load data',
  message = 'There was a problem loading the data. Please try again.',
  onRetry,
  retrying = false,
}: AdminErrorStateProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
      <AlertTriangle
        className="w-12 h-12 mx-auto mb-4 text-red-500"
        strokeWidth={1.5}
      />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Retrying...' : 'Try Again'}
        </button>
      )}
    </div>
  );
}
