/**
 * ActionConfirmationCard Component
 *
 * Displays pending agent actions that require user approval.
 * Shows action details, reasoning, and approve/reject buttons.
 */

import { useState, useEffect } from 'react';
import { Check, X, Calendar, Edit, Plus, Trash2, Clock, MapPin, Activity, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { trainingPlanAPI } from '../services/api';

interface PendingAction {
  id: string;
  action_id?: string; // Legacy support
  action_type: string;
  action_payload: any;
  description?: string;
  agent_reasoning?: string;
}

interface ActionConfirmationCardProps {
  action: PendingAction;
  onApprove: (actionId: string) => Promise<void>;
  onReject: (actionId: string, reason?: string) => Promise<void>;
}

export default function ActionConfirmationCard({
  action,
  onApprove,
  onReject,
}: ActionConfirmationCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [workoutDetails, setWorkoutDetails] = useState<any>(null);
  const [loadingWorkout, setLoadingWorkout] = useState(false);

  const actionId = action.id || action.action_id || '';

  // Fetch workout details if this is a workout-related action
  useEffect(() => {
    const fetchWorkoutDetails = async () => {
      const workoutId = action.action_payload?.workoutId || action.action_payload?.workout_id;

      if (!workoutId) return;

      setLoadingWorkout(true);
      try {
        // Fetch all workouts and find the matching one
        const response = await trainingPlanAPI.getWorkouts({ days: 365 });
        const workout = response.data.workouts?.find((w: any) => w.id === workoutId);

        if (workout) {
          setWorkoutDetails(workout);
        }
      } catch (error) {
        console.error('Failed to fetch workout details:', error);
      } finally {
        setLoadingWorkout(false);
      }
    };

    if (action.action_type === 'shift_workout' || action.action_type === 'modify_workout' || action.action_type === 'delete_workout') {
      fetchWorkoutDetails();
    }
  }, [action]);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await onApprove(actionId);
      // Parent handles success toast
    } catch (error) {
      // Parent also handles error toast
      console.error('Failed to execute action:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await onReject(actionId, rejectReason || undefined);
      // Parent handles success toast
      setShowRejectReason(false);
    } catch (error) {
      // Parent also handles error toast, so we can remove this
      console.error('Failed to reject action:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Get icon based on action type
  const getActionIcon = () => {
    switch (action.action_type) {
      case 'shift_workout':
        return <Calendar className="w-5 h-5" />;
      case 'modify_workout':
        return <Edit className="w-5 h-5" />;
      case 'bulk_modify_workouts':
        return <Edit className="w-5 h-5" />;
      case 'create_workout':
        return <Plus className="w-5 h-5" />;
      case 'delete_workout':
        return <Trash2 className="w-5 h-5" />;
      default:
        return <Activity className="w-5 h-5" />;
    }
  };

  // Get action title
  const getActionTitle = () => {
    switch (action.action_type) {
      case 'shift_workout':
        return 'Shift Workout';
      case 'modify_workout':
        return 'Modify Workout';
      case 'bulk_modify_workouts':
        return 'Bulk Modify Workouts';
      case 'create_workout':
        return 'Add New Workout';
      case 'delete_workout':
        return 'Remove Workout';
      default:
        return 'Action Required';
    }
  };

  // Format action details
  const getActionDetails = () => {
    const { action_payload } = action;

    switch (action.action_type) {
      case 'shift_workout':
        if (loadingWorkout) {
          return (
            <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Loading workout details...
            </div>
          );
        }

        return (
          <div className="space-y-3 text-sm">
            {/* Workout Info */}
            {workoutDetails && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {workoutDetails.name || workoutDetails.workout_type?.replace('_', ' ')}
                </div>
                <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                  {workoutDetails.target_distance_meters && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3" />
                      <span>{(workoutDetails.target_distance_meters / 1000).toFixed(1)} km</span>
                    </div>
                  )}
                  {workoutDetails.target_pace_avg && (
                    <div className="flex items-center gap-2">
                      <Activity className="w-3 h-3" />
                      <span>{formatPace(workoutDetails.target_pace_avg)}/km pace</span>
                    </div>
                  )}
                  {workoutDetails.target_hr_zone && (
                    <div className="flex items-center gap-2">
                      <Activity className="w-3 h-3" />
                      <span>Zone {workoutDetails.target_hr_zone}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Date Change */}
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">Current Date:</span>
                <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                  <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  {workoutDetails ? (
                    new Date(workoutDetails.scheduled_date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  ) : (
                    'Loading...'
                  )}
                </div>
              </div>

              <ArrowRight className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />

              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">New Date:</span>
                <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                  <Calendar className="w-4 h-4" />
                  {new Date(action_payload.newDate || action_payload.new_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
            </div>

            {/* Reason */}
            {action_payload.reason && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Reason:</span> {action_payload.reason}
                </p>
              </div>
            )}
          </div>
        );

      case 'modify_workout':
        const updates = action_payload.updates;

        if (loadingWorkout) {
          return (
            <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Loading workout details...
            </div>
          );
        }

        return (
          <div className="space-y-3 text-sm">
            {/* Current Workout Info */}
            {workoutDetails && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Current: {workoutDetails.name || workoutDetails.workout_type?.replace('_', ' ')}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {new Date(workoutDetails.scheduled_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
              </div>
            )}

            {/* Proposed Changes */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2">
              <div className="font-medium text-blue-900 dark:text-blue-200 mb-2">Proposed Changes:</div>
            {updates.name && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Name:</span>
                <span>{updates.name}</span>
              </div>
            )}
            {updates.workout_type && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Type:</span>
                <span className="capitalize">{updates.workout_type.replace('_', ' ')}</span>
              </div>
            )}
            {updates.target_distance_meters !== undefined && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Distance:</span>
                <span>{(updates.target_distance_meters / 1000).toFixed(1)} km</span>
              </div>
            )}
            {updates.target_duration_seconds !== undefined && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Duration:</span>
                <span>{Math.floor(updates.target_duration_seconds / 60)} minutes</span>
              </div>
            )}
            {updates.target_pace_avg !== undefined && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Target Pace:</span>
                <span>{formatPace(updates.target_pace_avg)}/km</span>
              </div>
            )}
            {(updates.target_pace_min !== undefined || updates.target_pace_max !== undefined) && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Pace Range:</span>
                <span>
                  {updates.target_pace_min && formatPace(updates.target_pace_min)} - {updates.target_pace_max && formatPace(updates.target_pace_max)}/km
                </span>
              </div>
            )}
            {updates.target_hr_zone !== undefined && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">HR Zone:</span>
                <span>Zone {updates.target_hr_zone}</span>
              </div>
            )}
            {(updates.target_hr_min !== undefined || updates.target_hr_max !== undefined) && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">HR Range:</span>
                <span>
                  {updates.target_hr_min} - {updates.target_hr_max} bpm
                </span>
              </div>
            )}
            {updates.coach_notes && (
              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Coach Notes:</span> {updates.coach_notes}
                </p>
              </div>
            )}
            {updates.intervals && formatIntervalStructure(updates.intervals)}
            </div>

            {/* Reason */}
            {action_payload.reason && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Reason:</span> {action_payload.reason}
                </p>
              </div>
            )}
          </div>
        );

      case 'bulk_modify_workouts':
        const criteria = action_payload.criteria;
        const bulkUpdates = action_payload.updates;

        return (
          <div className="space-y-3 text-sm">
            {/* Criteria Section */}
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded">
              <div className="font-semibold text-purple-900 dark:text-purple-200 mb-1">
                Affected Workouts:
              </div>
              {criteria.workout_types && criteria.workout_types.length > 0 && (
                <div className="text-gray-700 dark:text-gray-300">
                  • Types: {criteria.workout_types.map((t: string) => t.replace('_', ' ')).join(', ')}
                </div>
              )}
              {criteria.date_range && (
                <div className="text-gray-700 dark:text-gray-300">
                  • Date Range: {new Date(criteria.date_range.start_date).toLocaleDateString()} to {new Date(criteria.date_range.end_date).toLocaleDateString()}
                </div>
              )}
              {criteria.days_from_now && (
                <div className="text-gray-700 dark:text-gray-300">
                  • Next {criteria.days_from_now.max || criteria.days_from_now.min} days
                </div>
              )}
              {action_payload.matched_count !== undefined && (
                <div className="text-purple-700 dark:text-purple-300 font-medium mt-1">
                  ⚠️ This will modify {action_payload.matched_count} workout(s)
                </div>
              )}
            </div>

            {/* Changes Section */}
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
              <div className="font-semibold text-blue-900 dark:text-blue-200 mb-1">
                Changes to Apply:
              </div>
              {bulkUpdates.target_pace_avg !== undefined && (
                <div className="text-gray-700 dark:text-gray-300">
                  • Pace: {formatPace(bulkUpdates.target_pace_avg)}/km
                </div>
              )}
              {bulkUpdates.target_hr_zone !== undefined && (
                <div className="text-gray-700 dark:text-gray-300">
                  • HR Zone: Zone {bulkUpdates.target_hr_zone}
                </div>
              )}
              {bulkUpdates.target_distance_meters !== undefined && (
                <div className="text-gray-700 dark:text-gray-300">
                  • Distance: {(bulkUpdates.target_distance_meters / 1000).toFixed(1)} km
                </div>
              )}
              {bulkUpdates.coach_notes && (
                <div className="text-gray-700 dark:text-gray-300">
                  • Notes: {bulkUpdates.coach_notes}
                </div>
              )}
            </div>

            {action_payload.reason && (
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Reason:</span> {action_payload.reason}
              </p>
            )}
          </div>
        );

      case 'create_workout':
        return (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium">Date:</span>
              <span>{new Date(action_payload.scheduled_date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium">Type:</span>
              <span className="capitalize">{action_payload.workout_type.replace('_', ' ')}</span>
            </div>
            {action_payload.target_distance_meters && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Distance:</span>
                <span>{(action_payload.target_distance_meters / 1000).toFixed(1)} km</span>
              </div>
            )}
            {action_payload.intervals && formatIntervalStructure(action_payload.intervals)}
            {action_payload.reason && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                <span className="font-medium">Reason:</span> {action_payload.reason}
              </p>
            )}
          </div>
        );

      case 'delete_workout':
        if (loadingWorkout) {
          return (
            <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Loading workout details...
            </div>
          );
        }

        return (
          <div className="space-y-3 text-sm">
            {/* Workout Being Deleted */}
            {workoutDetails && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
                <div className="font-semibold text-red-900 dark:text-red-200 mb-2">
                  ⚠️ Deleting: {workoutDetails.name || workoutDetails.workout_type?.replace('_', ' ')}
                </div>
                <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {new Date(workoutDetails.scheduled_date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  {workoutDetails.target_distance_meters && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3" />
                      <span>{(workoutDetails.target_distance_meters / 1000).toFixed(1)} km</span>
                    </div>
                  )}
                  {workoutDetails.target_pace_avg && (
                    <div className="flex items-center gap-2">
                      <Activity className="w-3 h-3" />
                      <span>{formatPace(workoutDetails.target_pace_avg)}/km pace</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reason */}
            {action_payload.reason && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Reason:</span> {action_payload.reason}
                </p>
              </div>
            )}
          </div>
        );

      default:
        return <p className="text-sm text-gray-600 dark:text-gray-400">{action.description}</p>;
    }
  };

  const formatPace = (pace: number): string => {
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format interval structure
  const formatIntervalStructure = (intervals: any): JSX.Element => {
    if (!intervals) return <></>;

    const parts: JSX.Element[] = [];

    if (intervals.warmup) {
      const wu = intervals.warmup;
      parts.push(
        <div key="warmup" className="text-sm">
          <span className="font-medium text-blue-600 dark:text-blue-400">Warmup:</span>{' '}
          {wu.distance_meters ? `${(wu.distance_meters / 1000).toFixed(1)}km` : `${Math.floor(wu.duration_seconds / 60)}min`}
          {wu.target_pace_avg && ` at ${formatPace(wu.target_pace_avg)}/km`}
        </div>
      );
    }

    if (intervals.mainSet && intervals.mainSet.length > 0) {
      intervals.mainSet.forEach((set: any, index: number) => {
        const distance = set.distance_meters
          ? `${set.distance_meters}m`
          : `${Math.floor(set.duration_seconds / 60)}min`;
        const pace = set.target_pace_avg
          ? ` at ${formatPace(set.target_pace_avg)}/km`
          : set.target_pace_min && set.target_pace_max
          ? ` at ${formatPace(set.target_pace_min)}-${formatPace(set.target_pace_max)}/km`
          : '';
        const recovery = set.recovery_time_seconds
          ? ` (${set.recovery_time_seconds}s ${set.recovery_type || 'rest'})`
          : set.recovery_distance_meters
          ? ` (${set.recovery_distance_meters}m ${set.recovery_type || 'recovery'})`
          : '';

        parts.push(
          <div key={`set-${index}`} className="text-sm">
            <span className="font-medium text-orange-600 dark:text-orange-400">Main Set {index + 1}:</span>{' '}
            {set.reps}x{distance}{pace}{recovery}
            {set.notes && <span className="text-gray-500 dark:text-gray-400 ml-2 italic">({set.notes})</span>}
          </div>
        );
      });
    }

    if (intervals.cooldown) {
      const cd = intervals.cooldown;
      parts.push(
        <div key="cooldown" className="text-sm">
          <span className="font-medium text-green-600 dark:text-green-400">Cooldown:</span>{' '}
          {cd.distance_meters ? `${(cd.distance_meters / 1000).toFixed(1)}km` : `${Math.floor(cd.duration_seconds / 60)}min`}
          {cd.target_pace_avg && ` at ${formatPace(cd.target_pace_avg)}/km`}
        </div>
      );
    }

    return <div className="space-y-1 mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded">{parts}</div>;
  };

  return (
    <div className="my-4 p-4 bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-300 dark:border-blue-700 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg text-blue-700 dark:text-blue-300">
          {getActionIcon()}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200">
            {getActionTitle()}
          </h3>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Agent suggestion - requires your approval
          </p>
        </div>
      </div>

      {/* Action Details */}
      <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg">
        {getActionDetails()}
      </div>

      {/* Reject Reason Input */}
      {showRejectReason && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Why are you rejecting this suggestion? (optional)
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            placeholder="Your feedback helps me improve..."
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {!showRejectReason ? (
          <>
            <button
              onClick={handleApprove}
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={18} />
              {isProcessing ? 'Processing...' : 'Approve'}
            </button>
            <button
              onClick={() => setShowRejectReason(true)}
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={18} />
              Reject
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleReject}
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={18} />
              {isProcessing ? 'Rejecting...' : 'Confirm Reject'}
            </button>
            <button
              onClick={() => {
                setShowRejectReason(false);
                setRejectReason('');
              }}
              disabled={isProcessing}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
