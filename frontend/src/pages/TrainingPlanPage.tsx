import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '../components/common/Layout';
import { WorkoutCalendar } from '../components/training/WorkoutCalendar';
import { TrainingPlanUpload } from '../components/training/TrainingPlanUpload';
import { WorkoutForm } from '../components/training/WorkoutForm';
import { TrainingPlanList } from '../components/training/TrainingPlanList';
import SmartPlanWizard from '../components/training/SmartPlanWizard';
import { trainingPlanAPI } from '../services/api';
import ErrorDisplay, { LoadingDisplay } from '../components/ErrorDisplay';

type TabType = 'calendar' | 'smart' | 'upload' | 'create' | 'manage';

export const TrainingPlanPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [activePlan, setActivePlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadActivePlan();
  }, []);

  const loadActivePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await trainingPlanAPI.getActivePlan();
      if (response.data.plan) {
        setActivePlan(response.data.plan);
      } else {
        // No active plan, create a default one
        await createDefaultPlan();
      }
    } catch (err: any) {
      console.error('Failed to load active plan:', err);
      setError(err);
      // Don't try creating default plan if there's a network error
      if (!err.message?.includes('Network') && !err.message?.includes('fetch')) {
        await createDefaultPlan();
      }
    } finally {
      setLoading(false);
    }
  };

  const createDefaultPlan = async () => {
    try {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 365); // 1 year from now

      const response = await trainingPlanAPI.createPlan({
        name: 'My Training Plan',
        description: 'Personal training schedule',
        start_date: today.toISOString(),
        end_date: endDate.toISOString(),
        total_weeks: 52,
        is_active: true,
      });
      setActivePlan(response.data.plan);
    } catch (error) {
      console.error('Failed to create default plan:', error);
    }
  };

  const handleUploadSuccess = (data: any) => {
    setActivePlan(data.plan);
    setActiveTab('calendar');
  };

  const handleWorkoutSuccess = () => {
    // Refresh calendar
    window.location.reload();
  };

  const handleSmartPlanComplete = () => {
    // Refresh the active plan and switch to calendar
    queryClient.invalidateQueries({ queryKey: ['workouts'] });
    loadActivePlan();
    setActiveTab('calendar');
  };

  const tabs = [
    { id: 'calendar' as TabType, label: 'Calendar', icon: '📅' },
    { id: 'smart' as TabType, label: 'Smart Generator', icon: '✨' },
    { id: 'manage' as TabType, label: 'Manage Plans', icon: '📋' },
    { id: 'upload' as TabType, label: 'Upload Plan', icon: '📤' },
    { id: 'create' as TabType, label: 'Create Workout', icon: '✏️' },
  ];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Training Plan
          </h1>
          {activePlan && (
            <p className="text-slate-600 dark:text-slate-400">
              {activePlan.name} - Week{' '}
              {Math.ceil(
                (new Date().getTime() - new Date(activePlan.start_date).getTime()) /
                  (7 * 24 * 60 * 60 * 1000)
              )}{' '}
              of {activePlan.total_weeks}
            </p>
          )}
          {!activePlan && (
            <p className="text-slate-600 dark:text-slate-400">
              No active training plan. Use the Smart Generator or upload a plan to get started.
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 dark:border-slate-700 mb-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
          {activeTab === 'calendar' && (
            <div>
              {loading ? (
                <LoadingDisplay message="Loading training plan..." />
              ) : error ? (
                <ErrorDisplay
                  error={error}
                  title="Failed to Load Training Plan"
                  message="Unable to load your training plan. Please check your connection and try again."
                  onRetry={loadActivePlan}
                  type={error.message?.includes('Network') || error.message?.includes('fetch') ? 'network' : 'general'}
                />
              ) : activePlan ? (
                <>
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      💡 <strong>Tip:</strong> Click any day to add a workout, or drag planned workouts to reschedule them
                    </p>
                  </div>
                  <WorkoutCalendar />
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-slate-600 dark:text-slate-400 mb-4">
                    No active training plan found.
                  </p>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="btn btn-primary mr-2"
                  >
                    Upload Plan
                  </button>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="btn btn-secondary"
                  >
                    Create Workout
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'smart' && (
            <div>
              <SmartPlanWizard onComplete={handleSmartPlanComplete} />
            </div>
          )}

          {activeTab === 'upload' && (
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
                Upload Training Plan
              </h2>
              <TrainingPlanUpload onSuccess={handleUploadSuccess} />
            </div>
          )}

          {activeTab === 'manage' && (
            <div>
              <TrainingPlanList />
            </div>
          )}

          {activeTab === 'create' && (
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
                Create Workout
              </h2>
              {activePlan ? (
                <WorkoutForm
                  trainingPlanId={activePlan?.id}
                  onSuccess={handleWorkoutSuccess}
                  onCancel={() => setActiveTab('calendar')}
                />
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
