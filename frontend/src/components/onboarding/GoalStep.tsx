import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { goalsAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Target } from 'lucide-react';

interface GoalStepProps {
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
}

const raceTypes = [
  { value: '5k', label: '5K' },
  { value: '10k', label: '10K' },
  { value: '15k', label: '15K' },
  { value: 'half_marathon', label: 'Half Marathon' },
  { value: 'marathon', label: 'Marathon' },
  { value: 'ultra', label: 'Ultra Marathon' },
  { value: 'other', label: 'Other' },
];

export default function GoalStep({ onComplete, onSkip, onBack }: GoalStepProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    goal_type: 'marathon',
    race_name: '',
    target_hours: '',
    target_minutes: '',
    target_seconds: '',
    target_date: '',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => goalsAPI.createGoal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Race goal saved!');
      onComplete();
    },
    onError: () => {
      toast.error('Failed to save goal');
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.goal_type || !formData.target_date) {
      toast.error('Please select a race type and date');
      return;
    }

    const hours = parseInt(formData.target_hours) || 0;
    const minutes = parseInt(formData.target_minutes) || 0;
    const seconds = parseInt(formData.target_seconds) || 0;
    const target_time_seconds = hours * 3600 + minutes * 60 + seconds;

    mutation.mutate({
      goal_type: formData.goal_type,
      race_name: formData.race_name || undefined,
      target_time_seconds: target_time_seconds > 0 ? target_time_seconds : undefined,
      target_date: formData.target_date,
      is_active: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <Target className="text-green-600 dark:text-green-400" size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Set a race goal
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            What are you training for?
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Race Type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Race Distance *
          </label>
          <select
            name="goal_type"
            value={formData.goal_type}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {raceTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Race Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Race Name (optional)
          </label>
          <input
            type="text"
            name="race_name"
            value={formData.race_name}
            onChange={handleChange}
            placeholder="e.g., Boston Marathon 2026"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Target Time */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Target Finish Time (optional)
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <input
                type="number"
                name="target_hours"
                value={formData.target_hours}
                onChange={handleChange}
                placeholder="HH"
                min="0"
                max="24"
                className="w-full px-3 py-2 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 block text-center mt-1">Hours</span>
            </div>
            <div>
              <input
                type="number"
                name="target_minutes"
                value={formData.target_minutes}
                onChange={handleChange}
                placeholder="MM"
                min="0"
                max="59"
                className="w-full px-3 py-2 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 block text-center mt-1">Minutes</span>
            </div>
            <div>
              <input
                type="number"
                name="target_seconds"
                value={formData.target_seconds}
                onChange={handleChange}
                placeholder="SS"
                min="0"
                max="59"
                className="w-full px-3 py-2 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 block text-center mt-1">Seconds</span>
            </div>
          </div>
        </div>

        {/* Race Date */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Race Date *
          </label>
          <input
            type="date"
            name="target_date"
            value={formData.target_date}
            onChange={handleChange}
            min={new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
          >
            <ChevronLeft size={18} />
            Back
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 text-sm"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
            >
              {mutation.isPending ? 'Saving...' : 'Save & Continue'}
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
