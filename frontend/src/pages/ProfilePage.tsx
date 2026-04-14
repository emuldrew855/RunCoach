import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileAPI, goalsAPI } from '../services/api';
import { UserProfile, Goal, PersonalBests, RunnerType } from '../types';
import toast from 'react-hot-toast';
import { Save, Target, Edit as EditIcon, Trophy, TrendingUp, Heart, Compass } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import CoachStyleSelector, { CoachStyle, CommunicationStyle } from '../components/CoachStyleSelector';
import RaceHistoryManager from '../components/RaceHistoryManager';
import { MemoryViewer } from '../components/MemoryViewer';
import { PersonalBestsEditor } from '../components/PersonalBestsEditor';
import { useIsMobile } from '../hooks/useIsMobile';

export default function ProfilePage() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { preferences, updatePreferences, distanceUnit } = usePreferences();
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingHRZones, setEditingHRZones] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await profileAPI.getProfile();
      return response.data.profile as UserProfile | null;
    },
  });

  const { data: goalsData } = useQuery({
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
      setEditingHRZones(false);
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

  const handleSavePersonalBests = async (bests: PersonalBests) => {
    try {
      await profileAPI.updateProfile({ personal_bests: bests });
      toast.success('Personal bests updated successfully');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (error) {
      toast.error('Failed to update personal bests');
      throw error;
    }
  };

  const timeComponents = formatTimeForDisplay(goalForm.target_time_seconds);

  const activeGoal = goalsData?.find((g) => g.is_active);

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 pb-20 md:pb-0">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">Profile & Goals</h1>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
                <select
                  value={profileForm.gender || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                  className="input"
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
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
              <div className="col-span-2">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600 dark:text-gray-400">Age</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{profileData.age || 'Not set'}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">Gender</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100 capitalize">
                {profileData.gender?.replace('-', ' ') || 'Not set'}
              </p>
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
            <div>
              <p className="text-gray-600 dark:text-gray-400">Typical Weekly Mileage</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{profileData.typical_weekly_mileage ? `${profileData.typical_weekly_mileage} km` : 'Not set'}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400">No profile data yet. Click "Edit" to add your information.</p>
        )}
      </div>

      {/* Heart Rate Zones Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Heart Rate Zones</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Customize your HR zones to match your physiology (from Strava or lab testing)
            </p>
          </div>
          <button
            onClick={() => {
              const isEditing = editingHRZones;
              setEditingHRZones(!isEditing);
              if (!isEditing) {
                setProfileForm({
                  hr_zone_1_max: profileData?.hr_zone_1_max || 120,
                  hr_zone_2_max: profileData?.hr_zone_2_max || 140,
                  hr_zone_3_max: profileData?.hr_zone_3_max || 160,
                  hr_zone_4_max: profileData?.hr_zone_4_max || 175,
                  hr_zone_5_max: profileData?.hr_zone_5_max || 220,
                });
              }
            }}
            className="btn btn-secondary flex items-center gap-2"
          >
            <EditIcon size={16} />
            {editingHRZones ? 'Cancel' : 'Edit Zones'}
          </button>
        </div>

        {editingHRZones ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Validation: each zone max must be greater than previous
              const z1 = profileForm.hr_zone_1_max || 0;
              const z2 = profileForm.hr_zone_2_max || 0;
              const z3 = profileForm.hr_zone_3_max || 0;
              const z4 = profileForm.hr_zone_4_max || 0;
              const z5 = profileForm.hr_zone_5_max || 0;

              if (z2 <= z1 || z3 <= z2 || z4 <= z3 || z5 <= z4) {
                toast.error('Each zone maximum must be higher than the previous zone');
                return;
              }

              updateProfileMutation.mutate(profileForm);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Zone 1 Max
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(Recovery)</span>
                </label>
                <input
                  type="number"
                  min="50"
                  max="220"
                  value={profileForm.hr_zone_1_max || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, hr_zone_1_max: parseInt(e.target.value) })}
                  className="input"
                  placeholder="120"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">&lt;{profileForm.hr_zone_1_max || 120} bpm</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Zone 2 Max
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(Easy)</span>
                </label>
                <input
                  type="number"
                  min="50"
                  max="220"
                  value={profileForm.hr_zone_2_max || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, hr_zone_2_max: parseInt(e.target.value) })}
                  className="input"
                  placeholder="140"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{profileForm.hr_zone_1_max || 120}-{profileForm.hr_zone_2_max || 140} bpm</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Zone 3 Max
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(Tempo)</span>
                </label>
                <input
                  type="number"
                  min="50"
                  max="220"
                  value={profileForm.hr_zone_3_max || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, hr_zone_3_max: parseInt(e.target.value) })}
                  className="input"
                  placeholder="160"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{profileForm.hr_zone_2_max || 140}-{profileForm.hr_zone_3_max || 160} bpm</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Zone 4 Max
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(Threshold)</span>
                </label>
                <input
                  type="number"
                  min="50"
                  max="220"
                  value={profileForm.hr_zone_4_max || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, hr_zone_4_max: parseInt(e.target.value) })}
                  className="input"
                  placeholder="175"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{profileForm.hr_zone_3_max || 160}-{profileForm.hr_zone_4_max || 175} bpm</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Zone 5 Max
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(Max)</span>
                </label>
                <input
                  type="number"
                  min="50"
                  max="220"
                  value={profileForm.hr_zone_5_max || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, hr_zone_5_max: parseInt(e.target.value) })}
                  className="input"
                  placeholder="220"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">&gt;{profileForm.hr_zone_4_max || 175} bpm</p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold mb-2">
                  📊 Finding Your Strava Heart Rate Zones
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Go to Strava Settings → "My Performance" → "Heart Rate Zones" to find your personalized zones.
                </p>
              </div>

              <div className="border-t border-blue-200 dark:border-blue-700 pt-3">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold mb-1">
                  ℹ️ How Strava Calculates Zones
                </p>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 ml-4 list-disc">
                  <li>Default Max HR formula: <strong>220 - your age</strong> (or 190 bpm if age not set)</li>
                  <li>Zones auto-update on your birthday unless you manually set a Max HR</li>
                  <li>Strava Premium subscribers can set different zones for runs vs. rides</li>
                  <li>For best accuracy, consider a max HR test or use your highest recorded HR from a hard effort</li>
                </ul>
              </div>

              <div className="border-t border-blue-200 dark:border-blue-700 pt-3">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold mb-2">
                  🧮 Auto-Calculate Zones (Strava Method)
                </p>
                <button
                  type="button"
                  onClick={() => {
                    // Strava's default: 220 - age, or 190 if no age
                    const maxHR = profileData?.age ? 220 - profileData.age : 190;

                    // Standard 5-zone model percentages
                    // Zone 1 (Recovery): < 60% max HR
                    // Zone 2 (Aerobic/Easy): 60-70% max HR
                    // Zone 3 (Tempo): 70-80% max HR
                    // Zone 4 (Threshold): 80-90% max HR
                    // Zone 5 (Anaerobic): > 90% max HR
                    setProfileForm({
                      hr_zone_1_max: Math.round(maxHR * 0.60),
                      hr_zone_2_max: Math.round(maxHR * 0.70),
                      hr_zone_3_max: Math.round(maxHR * 0.80),
                      hr_zone_4_max: Math.round(maxHR * 0.90),
                      hr_zone_5_max: maxHR,
                    });

                    const calculation = profileData?.age
                      ? `220 - ${profileData.age} = ${maxHR} bpm`
                      : `${maxHR} bpm (default, no age set)`;
                    toast.success(`Zones calculated using max HR of ${calculation}`);
                  }}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition-colors"
                >
                  {profileData?.age
                    ? `Auto-fill: 220 - ${profileData.age} = ${220 - profileData.age} bpm`
                    : `Auto-fill: 190 bpm max HR (no age set)`
                  }
                </button>
                <div className="text-xs text-blue-700 dark:text-blue-300 mt-2 space-y-1">
                  <p className="font-medium">Standard zone boundaries:</p>
                  <ul className="ml-4 list-disc space-y-0.5">
                    <li>Zone 1: &lt;60% max HR (Recovery)</li>
                    <li>Zone 2: 60-70% max HR (Aerobic/Easy)</li>
                    <li>Zone 3: 70-80% max HR (Tempo)</li>
                    <li>Zone 4: 80-90% max HR (Threshold)</li>
                    <li>Zone 5: &gt;90% max HR (Anaerobic)</li>
                  </ul>
                  <p className="mt-2 italic">Adjust these values to match your Strava zones if different.</p>
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary flex items-center gap-2">
              <Save size={16} />
              Save HR Zones
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">Zone 1 (Recovery)</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  &lt;{profileData?.hr_zone_1_max || 120} bpm
                </p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <p className="text-blue-600 dark:text-blue-400 text-xs mb-1">Zone 2 (Easy)</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  {profileData?.hr_zone_1_max || 120}-{profileData?.hr_zone_2_max || 140} bpm
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                <p className="text-green-600 dark:text-green-400 text-xs mb-1">Zone 3 (Tempo)</p>
                <p className="font-semibold text-green-900 dark:text-green-100">
                  {profileData?.hr_zone_2_max || 140}-{profileData?.hr_zone_3_max || 160} bpm
                </p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
                <p className="text-orange-600 dark:text-orange-400 text-xs mb-1">Zone 4 (Threshold)</p>
                <p className="font-semibold text-orange-900 dark:text-orange-100">
                  {profileData?.hr_zone_3_max || 160}-{profileData?.hr_zone_4_max || 175} bpm
                </p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                <p className="text-red-600 dark:text-red-400 text-xs mb-1">Zone 5 (Max)</p>
                <p className="font-semibold text-red-900 dark:text-red-100">
                  &gt;{profileData?.hr_zone_4_max || 175} bpm
                </p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                <strong>ℹ️ About Your Zones:</strong> These are used throughout RunCoach for workout analysis and coaching feedback.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                To find your Strava zones: Settings → My Performance → Heart Rate Zones.
                {profileData?.age && ` Strava's default uses 220 - ${profileData.age} = ${220 - profileData.age} bpm max HR.`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Personal Bests Section */}
      <PersonalBestsEditor
        personalBests={profileData?.personal_bests || {}}
        onSave={handleSavePersonalBests}
        distanceUnit={distanceUnit as 'km' | 'mi'}
      />

      {/* Race History Section */}
      <div className="card">
        <RaceHistoryManager />
      </div>

      {/* Memory Viewer Section - Phase 3: RAG + Vector Search */}
      <MemoryViewer />

      {/* Coach Style Section */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Your Coach's Personality</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Customize how your AI coach interacts with you. Choose a personality that motivates you best!
        </p>

        <CoachStyleSelector
          coachStyle={(profileData?.coach_style || 'supportive') as CoachStyle}
          strictnessLevel={profileData?.coach_strictness_level || 3}
          communicationStyle={(profileData?.coach_communication_style || 'balanced') as CommunicationStyle}
          onCoachStyleChange={(style) => {
            updateProfileMutation.mutate({ coach_style: style });
            toast.success(`Coach style updated to ${style}`);
          }}
          onStrictnessChange={(level) => {
            updateProfileMutation.mutate({ coach_strictness_level: level });
            toast.success(`Accountability level updated to ${level}`);
          }}
          onCommunicationStyleChange={(style) => {
            updateProfileMutation.mutate({ coach_communication_style: style });
            toast.success(`Communication style updated to ${style}`);
          }}
        />
      </div>

      {/* Runner Focus Section */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Compass className="text-purple-600 dark:text-purple-400" size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Running Focus</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This guides how your AI coach approaches your training
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {([
            {
              type: 'architect' as RunnerType,
              title: 'Architect',
              subtitle: 'Race-Focused',
              description: "Training for a specific race with a time goal. Gets structured plans and targeted feedback.",
              icon: <Trophy size={20} />,
              color: 'text-amber-600 dark:text-amber-400',
              bgColor: 'bg-amber-100 dark:bg-amber-900/30',
              borderColor: 'border-amber-500',
            },
            {
              type: 'builder' as RunnerType,
              title: 'Builder',
              subtitle: 'Improvement-Focused',
              description: "Actively improving running fitness. Focuses on gradual progression and consistency.",
              icon: <TrendingUp size={20} />,
              color: 'text-blue-600 dark:text-blue-400',
              bgColor: 'bg-blue-100 dark:bg-blue-900/30',
              borderColor: 'border-blue-500',
            },
            {
              type: 'maintainer' as RunnerType,
              title: 'Maintainer',
              subtitle: 'Fitness-Focused',
              description: "Running for health and fitness. Focuses on consistency, enjoyment, and balance.",
              icon: <Heart size={20} />,
              color: 'text-green-600 dark:text-green-400',
              bgColor: 'bg-green-100 dark:bg-green-900/30',
              borderColor: 'border-green-500',
            },
          ]).map((option) => {
            const isSelected = profileData?.runner_type === option.type;

            return (
              <button
                key={option.type}
                onClick={() => {
                  updateProfileMutation.mutate({ runner_type: option.type });
                  toast.success(`Running focus updated to ${option.title}`);
                }}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? `${option.borderColor} bg-opacity-10 ${option.bgColor}`
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg ${option.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <span className={option.color}>{option.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {option.title}
                      </h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${option.bgColor} ${option.color}`}>
                        {option.subtitle}
                      </span>
                      {isSelected && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {option.description}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <div className={`w-6 h-6 rounded-full ${option.bgColor} flex items-center justify-center`}>
                        <svg className={`w-4 h-4 ${option.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {profileData?.runner_type_inferred && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-600 dark:text-gray-400">
            <strong>Auto-detected:</strong> Your running focus was inferred from your activity history.
            Click a different option above to change it.
          </div>
        )}

        {!profileData?.runner_type && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            <strong>Not set:</strong> Select your running focus above to help your AI coach give you better guidance.
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-4">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm opacity-90 mb-1">Target Time</p>
                <p className="text-2xl sm:text-3xl font-bold">
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
