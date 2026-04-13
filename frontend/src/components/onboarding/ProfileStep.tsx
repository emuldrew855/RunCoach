import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { profileAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Calculator } from 'lucide-react';

interface ProfileStepProps {
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export default function ProfileStep({ onComplete, onSkip, onBack }: ProfileStepProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    age: '',
    weight_kg: '',
    running_experience_years: '',
    typical_weekly_mileage: '',
    hr_zone_1_max: '',
    hr_zone_2_max: '',
    hr_zone_3_max: '',
    hr_zone_4_max: '',
    hr_zone_5_max: '',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => profileAPI.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile saved!');
      onComplete();
    },
    onError: () => {
      toast.error('Failed to save profile');
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const calculateHRZones = () => {
    const age = parseInt(formData.age);
    if (!age || age < 10 || age > 100) {
      toast.error('Please enter a valid age first');
      return;
    }

    const maxHR = 220 - age;
    setFormData({
      ...formData,
      hr_zone_1_max: Math.round(maxHR * 0.6).toString(),
      hr_zone_2_max: Math.round(maxHR * 0.7).toString(),
      hr_zone_3_max: Math.round(maxHR * 0.8).toString(),
      hr_zone_4_max: Math.round(maxHR * 0.9).toString(),
      hr_zone_5_max: maxHR.toString(),
    });
    toast.success('HR zones calculated based on age');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: any = {};
    if (formData.age) data.age = parseInt(formData.age);
    if (formData.weight_kg) data.weight_kg = parseFloat(formData.weight_kg);
    if (formData.running_experience_years) data.running_experience_years = parseInt(formData.running_experience_years);
    if (formData.typical_weekly_mileage) data.typical_weekly_mileage = parseFloat(formData.typical_weekly_mileage);
    if (formData.hr_zone_1_max) data.hr_zone_1_max = parseInt(formData.hr_zone_1_max);
    if (formData.hr_zone_2_max) data.hr_zone_2_max = parseInt(formData.hr_zone_2_max);
    if (formData.hr_zone_3_max) data.hr_zone_3_max = parseInt(formData.hr_zone_3_max);
    if (formData.hr_zone_4_max) data.hr_zone_4_max = parseInt(formData.hr_zone_4_max);
    if (formData.hr_zone_5_max) data.hr_zone_5_max = parseInt(formData.hr_zone_5_max);

    mutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
          Set up your profile
        </h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Help us personalize your training recommendations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Age
            </label>
            <input
              type="number"
              name="age"
              value={formData.age}
              onChange={handleChange}
              placeholder="e.g., 35"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Weight (kg)
            </label>
            <input
              type="number"
              name="weight_kg"
              value={formData.weight_kg}
              onChange={handleChange}
              placeholder="e.g., 70"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Years running
            </label>
            <input
              type="number"
              name="running_experience_years"
              value={formData.running_experience_years}
              onChange={handleChange}
              placeholder="e.g., 3"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Weekly km (typical)
            </label>
            <input
              type="number"
              name="typical_weekly_mileage"
              value={formData.typical_weekly_mileage}
              onChange={handleChange}
              placeholder="e.g., 40"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* HR Zones */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Heart Rate Zones (bpm)
            </label>
            <button
              type="button"
              onClick={calculateHRZones}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              <Calculator size={14} />
              Auto-calculate from age
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((zone) => (
              <div key={zone}>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 text-center">
                  Z{zone} max
                </label>
                <input
                  type="number"
                  name={`hr_zone_${zone}_max`}
                  value={formData[`hr_zone_${zone}_max` as keyof typeof formData]}
                  onChange={handleChange}
                  placeholder={zone === 1 ? '120' : zone === 2 ? '140' : zone === 3 ? '160' : zone === 4 ? '175' : '190'}
                  className="w-full px-2 py-2 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You can also copy these from your Strava settings or leave blank to set later.
          </p>
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
