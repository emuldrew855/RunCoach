import React, { useState } from 'react';
import { trainingPlanAPI } from '../../services/api';

interface WorkoutFormProps {
  trainingPlanId?: number;
  initialData?: any;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const WORKOUT_TYPES = [
  { value: 'easy', label: 'Easy Run' },
  { value: 'long_run', label: 'Long Run' },
  { value: 'tempo', label: 'Tempo Run' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'race', label: 'Race' },
  { value: 'rest', label: 'Rest Day' },
];

export const WorkoutForm: React.FC<WorkoutFormProps> = ({
  trainingPlanId,
  initialData,
  onSuccess,
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    scheduled_date: initialData?.scheduled_date || '',
    workout_type: initialData?.workout_type || 'easy',
    name: initialData?.name || '',
    description: initialData?.description || '',
    target_distance_meters: initialData?.target_distance_meters ? initialData.target_distance_meters / 1000 : '',
    target_duration_seconds: initialData?.target_duration_seconds ? Math.floor(initialData.target_duration_seconds / 60) : '',
    target_pace_min: initialData?.target_pace_min || '',
    target_pace_max: initialData?.target_pace_max || '',
    target_pace_avg: initialData?.target_pace_avg || '',
    target_hr_zone: initialData?.target_hr_zone || '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation: Name is required
    if (!formData.name.trim()) {
      setError('Workout name is required');
      setLoading(false);
      return;
    }

    // Validation: Either distance OR duration must be provided
    if (!formData.target_distance_meters && !formData.target_duration_seconds) {
      setError('Please enter either a distance or duration for this workout');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        training_plan_id: trainingPlanId,
        scheduled_date: new Date(formData.scheduled_date).toISOString(),
        workout_type: formData.workout_type,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        target_distance_meters: formData.target_distance_meters ? parseFloat(formData.target_distance_meters as string) * 1000 : undefined,
        target_duration_seconds: formData.target_duration_seconds ? parseInt(formData.target_duration_seconds as string) * 60 : undefined,
        target_pace_min: formData.target_pace_min ? parseFloat(formData.target_pace_min as string) : undefined,
        target_pace_max: formData.target_pace_max ? parseFloat(formData.target_pace_max as string) : undefined,
        target_pace_avg: formData.target_pace_avg ? parseFloat(formData.target_pace_avg as string) : undefined,
        target_hr_zone: formData.target_hr_zone ? parseInt(formData.target_hr_zone as string) : undefined,
      };

      if (initialData?.id) {
        await trainingPlanAPI.updateWorkout(initialData.id, payload);
      } else {
        await trainingPlanAPI.createWorkout(payload);
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save workout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-200 font-medium">{error}</p>
        </div>
      )}

      {/* Date and Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="scheduled_date"
            value={formData.scheduled_date}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Workout Type <span className="text-red-500">*</span>
          </label>
          <select
            name="workout_type"
            value={formData.workout_type}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {WORKOUT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Workout Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          placeholder="e.g., Morning Easy Run"
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Description
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          placeholder="e.g., Keep it comfortable, focus on form"
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Distance and Duration */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Distance/Duration <span className="text-red-500">*</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">(at least one required)</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Distance (km)
            </label>
            <input
              type="number"
              name="target_distance_meters"
              value={formData.target_distance_meters}
              onChange={handleChange}
              step="0.1"
              min="0"
              placeholder="e.g., 10.0"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Duration (minutes)
            </label>
            <input
              type="number"
              name="target_duration_seconds"
              value={formData.target_duration_seconds}
              onChange={handleChange}
              min="0"
              placeholder="e.g., 60"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Pace Fields */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Target Pace (optional)
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Enter pace in decimal format: 5.5 = 5:30 per km, 4.25 = 4:15 per km
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Minimum Pace
            </label>
            <input
              type="number"
              name="target_pace_min"
              value={formData.target_pace_min}
              onChange={handleChange}
              step="0.01"
              min="0"
              placeholder="e.g., 5.0"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Fastest pace</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Average Pace
            </label>
            <input
              type="number"
              name="target_pace_avg"
              value={formData.target_pace_avg}
              onChange={handleChange}
              step="0.01"
              min="0"
              placeholder="e.g., 5.3"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Target average</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Maximum Pace
            </label>
            <input
              type="number"
              name="target_pace_max"
              value={formData.target_pace_max}
              onChange={handleChange}
              step="0.01"
              min="0"
              placeholder="e.g., 5.5"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Slowest pace</p>
          </div>
        </div>
      </div>

      {/* Heart Rate Zone */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Heart Rate Zone (optional)
        </label>
        <select
          name="target_hr_zone"
          value={formData.target_hr_zone}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">None</option>
          <option value="1">Zone 1 - Recovery (&lt;120 bpm)</option>
          <option value="2">Zone 2 - Easy (120-140 bpm)</option>
          <option value="3">Zone 3 - Moderate (140-160 bpm)</option>
          <option value="4">Zone 4 - Hard (160-175 bpm)</option>
          <option value="5">Zone 5 - Max (&gt;175 bpm)</option>
        </select>
      </div>

      {/* Buttons */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? 'Saving...' : initialData?.id ? 'Update Workout' : 'Create Workout'}
        </button>
      </div>
    </form>
  );
};
