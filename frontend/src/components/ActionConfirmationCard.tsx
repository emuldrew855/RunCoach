/**
 * ActionConfirmationCard Component
 *
 * Displays pending agent actions that require user approval.
 * Shows action details, reasoning, and approve/reject buttons.
 */

import { useState } from 'react';
import { Check, X, Calendar, Edit, Plus, Trash2, Clock, MapPin, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

interface PendingAction {
  action_id: string;
  action_type: string;
  action_payload: any;
  description: string;
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

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await onApprove(action.action_id);
      toast.success('Action approved and executed');
    } catch (error) {
      toast.error('Failed to execute action');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await onReject(action.action_id, rejectReason || undefined);
      toast.success('Action rejected');
      setShowRejectReason(false);
    } catch (error) {
      toast.error('Failed to reject action');
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
        return (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium">New Date:</span>
              <span>{new Date(action_payload.new_date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}</span>
            </div>
            {action_payload.reason && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                <span className="font-medium">Reason:</span> {action_payload.reason}
              </p>
            )}
          </div>
        );

      case 'modify_workout':
        const updates = action_payload.updates;
        return (
          <div className="space-y-2 text-sm">
            {updates.target_distance_meters && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Distance:</span>
                <span>{(updates.target_distance_meters / 1000).toFixed(1)} km</span>
              </div>
            )}
            {updates.target_duration_seconds && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Duration:</span>
                <span>{Math.floor(updates.target_duration_seconds / 60)} minutes</span>
              </div>
            )}
            {updates.target_hr_zone && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">HR Zone:</span>
                <span>Zone {updates.target_hr_zone}</span>
              </div>
            )}
            {updates.target_pace_avg && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Target Pace:</span>
                <span>{formatPace(updates.target_pace_avg)}/km</span>
              </div>
            )}
            {action_payload.reason && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">
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
            {action_payload.reason && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                <span className="font-medium">Reason:</span> {action_payload.reason}
              </p>
            )}
          </div>
        );

      case 'delete_workout':
        return (
          <div className="space-y-1 text-sm">
            {action_payload.reason && (
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Reason:</span> {action_payload.reason}
              </p>
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
