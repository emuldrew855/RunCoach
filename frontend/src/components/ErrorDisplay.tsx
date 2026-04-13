import { AlertCircle, WifiOff, ServerCrash, RefreshCw } from 'lucide-react';

interface ErrorDisplayProps {
  error?: Error | null;
  title?: string;
  message?: string;
  onRetry?: () => void;
  type?: 'network' | 'server' | 'general';
}

export default function ErrorDisplay({
  error,
  title,
  message,
  onRetry,
  type = 'general',
}: ErrorDisplayProps) {
  // Determine error type from error message if not specified
  const getErrorType = () => {
    if (type !== 'general') return type;

    const errorMessage = error?.message?.toLowerCase() || '';
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return 'network';
    }
    if (errorMessage.includes('500') || errorMessage.includes('503')) {
      return 'server';
    }
    return 'general';
  };

  const errorType = getErrorType();

  const errorConfig = {
    network: {
      icon: WifiOff,
      defaultTitle: 'Connection Error',
      defaultMessage: 'Unable to connect to the server. Please check your internet connection.',
      color: 'orange',
    },
    server: {
      icon: ServerCrash,
      defaultTitle: 'Server Error',
      defaultMessage: 'The server is experiencing issues. Please try again in a moment.',
      color: 'red',
    },
    general: {
      icon: AlertCircle,
      defaultTitle: 'Something Went Wrong',
      defaultMessage: 'We encountered an error loading this data. Please try again.',
      color: 'red',
    },
  };

  const config = errorConfig[errorType];
  const Icon = config.icon;
  const displayTitle = title || config.defaultTitle;
  const displayMessage = message || config.defaultMessage;

  return (
    <div className="flex items-center justify-center min-h-[200px] p-6">
      <div className="text-center max-w-md">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-${config.color}-100 dark:bg-${config.color}-900/20 mb-4`}>
          <Icon className={`w-8 h-8 text-${config.color}-600 dark:text-${config.color}-400`} />
        </div>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {displayTitle}
        </h3>

        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {displayMessage}
        </p>

        {error && import.meta.env.DEV && (
          <details className="mt-4 text-left">
            <summary className="text-sm text-gray-500 dark:text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
              Technical Details
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs text-red-600 dark:text-red-400 overflow-auto">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}

// Compact inline error for smaller spaces
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
      <p className="text-sm text-red-800 dark:text-red-200 flex-1">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// Loading state helper
export function LoadingDisplay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[200px] p-6">
      <div className="text-center">
        <div className="inline-block w-12 h-12 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mb-4" />
        <p className="text-gray-600 dark:text-gray-400">{message}</p>
      </div>
    </div>
  );
}
