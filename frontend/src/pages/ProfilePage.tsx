import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileAPI, goalsAPI } from '../services/api';
import { UserProfile, Goal } from '../types';
import toast from 'react-hot-toast';
import { Save, Target, Edit as EditIcon } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { preferences, updatePreferences } = usePreferences();
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);

  const { data: profileData, refetch: refetchProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await profileAPI.getProfile();
      return response.data.profile as UserProfile | null;
    },
  });

  const { data: goalsData, refetch: refetchGoals } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const response = await goalsAPI.getGoals();
      return response.data.goals as Goal[];
    },
  });

  const [profileForm, setProfileForm] = useState<Partial<UserProfile>>({});
  const [goalForm, setGoalForm] = useState<Partial<Goal>>({
    goal_type: 'marathon',
    target_time_seconds: 10800, // 3 hours
    target_date: '2026-05-31',
    is_active: true,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<UserProfile>) => profileAPI.updateProfile(data),
    onSuccess: () => {
      toast.success('Profile updated successfully');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditingProfile(false);
    },
    onError: () => {
      toast.error('Failed to update profile');
    },
  });

  const createGoalMutation = useMutation({
    mutationFn: (data: Partial<Goal>) => goalsAPI.createGoal(data),
    onSuccess: () => {
      toast.success('Goal created successfully');
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setEditingGoal(false);
    },
    onError: () => {
      toast.error('Failed to create goal');
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Goal> }) =>
      goalsAPI.updateGoal(id, data),
    onSuccess: () => {
      toast.success('Goal updated successfully');
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setEditingGoal(false);
    },
    onError: () => {
      toast.error('Failed to update goal');
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileForm);
  };

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goalForm.id) {
      updateGoalMutation.mutate({ id: goalForm.id, data: goalForm });
    } else {
      createGoalMutation.mutate(goalForm);
    }
  };

  const formatTimeForDisplay = (seconds?: number) => {
    if (!seconds) return { hours: '', minutes: '', secs: '' };
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return {
      hours: hours.toString(),
      minutes: minutes.toString(),
      secs: secs.toString(),
    };
  };

  const timeComponents = formatTimeForDisplay(goalForm.target_time_seconds);

  const activeGoal = goalsData?.find((g) => g.is_active);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Profile & Goals</h1>

      {/* Profile Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Personal Information</h2>
          <button
            onClick={() => {
              setEditingProfile(!editingProfile);
              setProfileForm(profileData || {});
            }}
            className="btn btn-secondary"
          >
            {editingProfile ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editingProfile ? (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age</label>
                <input
                  type="number"
                  value={profileForm.age || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, age: parseInt(e.target.value) })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={profileForm.weight_kg || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, weight_kg: parseFloat(e.target.value) })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Height (cm)</label>
                <input
                  type="number"
                  value={profileForm.height_cm || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, height_cm: parseInt(e.target.value) })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Running Experience (years)</label>
                <input
                  type="number"
                  value={profileForm.running_experience_years || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, running_experience_years: parseInt(e.target.value) })}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Typical Weekly Mileage (km)</label>
              <input
                type="number"
                step="0.1"
                value={profileForm.typical_weekly_mileage || ''}
                onChange={(e) => setProfileForm({ ...profileForm, typical_weekly_mileage: parseFloat(e.target.value) })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Injury History</label>
              <textarea
                value={profileForm.injury_history || ''}
                onChange={(e) => setProfileForm({ ...profileForm, injury_history: e.target.value })}
                className="input"
                rows={3}
              />
            </div>
            <button type="submit" className="btn btn-primary flex items-center gap-2">
              <Save size={16} />
              Save Profile
            </button>
          </form>
        ) : profileData ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600 dark:text-gray-400">Age</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{profileData.age || 'Not set'}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">Weight</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{profileData.weight_kg ? `${profileData.weight_kg} kg` : 'Not set'}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">Height</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{profileData.height_cm ? `${profileData.height_cm} cm` : 'Not set'}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">Experience</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{profileData.running_experience_years ? `${profileData.running_experience_years} years` : 'Not set'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-600 dark:text-gray-400">Typical Weekly Mileage</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{profileData.typical_weekly_mileage ? `${profileData.typical_weekly_mileage} km` : 'Not set'}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400">No profile data yet. Click "Edit" to add your information.</p>
        )}
      </div>

      {/* Preferences Section */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Display Preferences</h2>

        <div className="space-y-6">
          {/* Units Preference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Distance Units
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  updatePreferences({ units: 'metric' });
                  toast.success('Units changed to Metric (km)');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  preferences.units === 'metric'
                    ? 'bg-strava text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Metric (km)
              </button>
              <button
                onClick={() => {
                  updatePreferences({ units: 'imperial' });
                  toast.success('Units changed to Imperial (mi)');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  preferences.units === 'imperial'
                    ? 'bg-strava text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Imperial (mi)
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              All distances and pace will be displayed in your preferred units
            </p>
          </div>

          {/* Week Start Preference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Calendar Week Starts On
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  updatePreferences({ weekStartsOn: 'sunday' });
                  toast.success('Week starts on Sunday');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  preferences.weekStartsOn === 'sunday'
                    ? 'bg-strava text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Sunday
              </button>
              <button
                onClick={() => {
                  updatePreferences({ weekStartsOn: 'monday' });
                  toast.success('Week starts on Monday');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  preferences.weekStartsOn === 'monday'
                    ? 'bg-strava text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Monday
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              This affects your training calendar and weekly statistics
            </p>
          </div>
        </div>
      </div>

      {/* Training Block Section */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Training Block</h2>

        {editingProfile ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Block Start Date
                </label>
                <input
                  type="date"
                  value={profileForm.training_block_start ? new Date(profileForm.training_block_start).toISOString().split('T')[0] : ''}
                  onChange={(e) => setProfileForm({ ...profileForm, training_block_start: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Block End Date
                </label>
                <input
                  type="date"
                  value={profileForm.training_block_end ? new Date(profileForm.training_block_end).toISOString().split('T')[0] : ''}
                  onChange={(e) => setProfileForm({ ...profileForm, training_block_end: e.target.value })}
                  className="input"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Set the start and end dates of your current training block to track your progress
            </p>
          </div>
        ) : profileData?.training_block_start && profileData?.training_block_end ? (
          <div>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Start Date</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {new Date(profileData.training_block_start).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">End Date</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {new Date(profileData.training_block_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            {(() => {
              const start = new Date(profileData.training_block_start).getTime();
              const end = new Date(profileData.training_block_end).getTime();
              const now = Date.now();
              const total = end - start;
              const elapsed = now - start;
              const percentage = Math.min(Math.max((elapsed / total) * 100, 0), 100);
              const daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Training Block Progress
                    </span>
                    <span className="text-sm font-bold text-strava">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-orange-500 to-red-500 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Training block completed'}
                  </p>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-600 dark:text-gray-400 mb-2">No training block set</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Click "Edit" in Personal Information to set your training block dates
            </p>
          </div>
        )}
      </div>

      {/* Goals Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Target size={24} />
            Race Goal
          </h2>
          {!editingGoal && (
            <button
              onClick={() => {
                if (activeGoal) {
                  setGoalForm(activeGoal);
                }
                setEditingGoal(true);
              }}
              className="btn btn-primary flex items-center gap-2"
            >
              {activeGoal ? <><EditIcon size={16} /> Edit Goal</> : 'Set Goal'}
            </button>
          )}
        </div>

        {editingGoal ? (
          <form onSubmit={handleGoalSubmit} className="space-y-5">
            {/* Race Type */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Race Type</label>
              <select
                value={goalForm.goal_type || 'marathon'}
                onChange={(e) => setGoalForm({ ...goalForm, goal_type: e.target.value })}
                className="input"
                required
              >
                <option value="5k">5K</option>
                <option value="10k">10K</option>
                <option value="15k">15K</option>
                <option value="half_marathon">Half Marathon</option>
                <option value="marathon">Marathon</option>
                <option value="ultra">Ultra Marathon</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Race Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Race Name</label>
              <input
                type="text"
                value={goalForm.race_name || ''}
                onChange={(e) => setGoalForm({ ...goalForm, race_name: e.target.value })}
                className="input"
                placeholder="e.g., Chicago Marathon"
                required
              />
            </div>

            {/* Race Location */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Location (Optional)</label>
              <input
                type="text"
                value={goalForm.race_location || ''}
                onChange={(e) => setGoalForm({ ...goalForm, race_location: e.target.value })}
                className="input"
                placeholder="e.g., Chicago, IL"
              />
            </div>

            {/* Target Time */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Target Time</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={timeComponents.hours}
                    onChange={(e) => {
                      const hours = parseInt(e.target.value) || 0;
                      const minutes = parseInt(timeComponents.minutes) || 0;
                      const seconds = parseInt(timeComponents.secs) || 0;
                      setGoalForm({ ...goalForm, target_time_seconds: hours * 3600 + minutes * 60 + seconds });
                    }}
                    className="input text-center"
                    placeholder="HH"
                  />
                  <p className="text-xs text-secondary text-center mt-1">hours</p>
                </div>
                <div>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={timeComponents.minutes}
                    onChange={(e) => {
                      const hours = parseInt(timeComponents.hours) || 0;
                      const minutes = parseInt(e.target.value) || 0;
                      const seconds = parseInt(timeComponents.secs) || 0;
                      setGoalForm({ ...goalForm, target_time_seconds: hours * 3600 + minutes * 60 + seconds });
                    }}
                    className="input text-center"
                    placeholder="MM"
                  />
                  <p className="text-xs text-secondary text-center mt-1">minutes</p>
                </div>
                <div>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={timeComponents.secs}
                    onChange={(e) => {
                      const hours = parseInt(timeComponents.hours) || 0;
                      const minutes = parseInt(timeComponents.minutes) || 0;
                      const seconds = parseInt(e.target.value) || 0;
                      setGoalForm({ ...goalForm, target_time_seconds: hours * 3600 + minutes * 60 + seconds });
                    }}
                    className="input text-center"
                    placeholder="SS"
                  />
                  <p className="text-xs text-secondary text-center mt-1">seconds</p>
                </div>
              </div>
            </div>

            {/* Race Date */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Race Date</label>
              <input
                type="date"
                value={goalForm.target_date ? (typeof goalForm.target_date === 'string' ? goalForm.target_date.split('T')[0] : new Date(goalForm.target_date).toISOString().split('T')[0]) : ''}
                onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })}
                className="input"
                required
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Notes (Optional)</label>
              <textarea
                value={goalForm.notes || ''}
                onChange={(e) => setGoalForm({ ...goalForm, notes: e.target.value })}
                className="input"
                rows={3}
                placeholder="Any additional notes about this race goal..."
              />
            </div>

            <div className="flex gap-3">
              <button type="submit" className="btn btn-primary flex items-center gap-2">
                <Save size={16} />
                {goalForm.id ? 'Update Goal' : 'Save Goal'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingGoal(false);
                  setGoalForm({ goal_type: 'marathon', target_time_seconds: 10800, target_date: '2026-05-31', is_active: true });
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : activeGoal ? (
          <div className="bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 text-white p-6 rounded-lg">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-semibold uppercase mb-2">
                  {activeGoal.goal_type?.replace('_', ' ')}
                </span>
                <h3 className="text-2xl font-bold mb-1">{activeGoal.race_name || 'Race'}</h3>
                {activeGoal.race_location && (
                  <p className="text-sm opacity-90">{activeGoal.race_location}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm opacity-90 mb-1">Target Time</p>
                <p className="text-3xl font-bold">
                  {activeGoal.target_time_seconds &&
                    `${Math.floor(activeGoal.target_time_seconds / 3600)}:${String(Math.floor((activeGoal.target_time_seconds % 3600) / 60)).padStart(2, '0')}:${String(activeGoal.target_time_seconds % 60).padStart(2, '0')}`
                  }
                </p>
              </div>
              <div>
                <p className="text-sm opacity-90 mb-1">Race Date</p>
                <p className="text-xl font-bold">
                  {activeGoal.target_date && new Date(activeGoal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>
            {activeGoal.notes && (
              <div className="mt-4 pt-4 border-t border-white/30">
                <p className="text-sm opacity-90">{activeGoal.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Target size={48} className="mx-auto mb-3 text-neutral-400 dark:text-neutral-500" />
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">No active race goal set</p>
            <p className="text-sm text-secondary">Click "Set Goal" to add your race target and start tracking your progress.</p>
          </div>
        )}
      </div>
    </div>
  );
}
