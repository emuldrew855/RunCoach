import React, { useEffect, useState } from 'react';
import { trainingPlanAPI } from '../../services/api';

interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'volume' | 'intensity' | 'adherence' | 'recovery' | 'progression';
  title: string;
  message: string;
  actionable: boolean;
  action?: string;
  createdAt: string;
}

const severityStyles = {
  info: {
    container: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
    title: 'text-blue-900 dark:text-blue-100',
  },
  warning: {
    container: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    icon: 'text-yellow-600 dark:text-yellow-400',
    title: 'text-yellow-900 dark:text-yellow-100',
  },
  critical: {
    container: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
    title: 'text-red-900 dark:text-red-100',
  },
};

const categoryIcons = {
  volume: '📊',
  intensity: '⚡',
  adherence: '✓',
  recovery: '💤',
  progression: '📈',
};

export const AlertDashboard: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const response = await trainingPlanAPI.getAlerts();
      setAlerts(response.data.alerts || []);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts((prev) => new Set(prev).add(alertId));
  };

  const visibleAlerts = alerts.filter((alert) => !dismissedAlerts.has(alert.id));

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
        <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
      </div>
    );
  }

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {visibleAlerts.map((alert) => {
        const styles = severityStyles[alert.severity];
        return (
          <div
            key={alert.id}
            className={`border-l-4 rounded-lg p-4 ${styles.container} relative`}
          >
            <button
              onClick={() => dismissAlert(alert.id)}
              className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Dismiss"
            >
              ✕
            </button>

            <div className="flex items-start space-x-3">
              <span className={`text-2xl ${styles.icon}`}>
                {categoryIcons[alert.category]}
              </span>

              <div className="flex-1">
                <h3 className={`font-semibold ${styles.title}`}>
                  {alert.title}
                </h3>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                  {alert.message}
                </p>

                {alert.actionable && alert.action && (
                  <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      Recommended Action:
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                      {alert.action}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
