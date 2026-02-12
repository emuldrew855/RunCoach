import React, { useState } from 'react';
import { Trophy, Edit2, Save, X } from 'lucide-react';
import { PersonalBests } from '../types';

interface PersonalBestsEditorProps {
  personalBests: PersonalBests;
  onSave: (bests: PersonalBests) => Promise<void>;
  distanceUnit: 'km' | 'mi';
}

interface RaceDistance {
  key: keyof PersonalBests;
  label: string;
  distanceKm: number;
}

const RACE_DISTANCES: RaceDistance[] = [
  { key: '5k', label: '5K', distanceKm: 5 },
  { key: '10k', label: '10K', distanceKm: 10 },
  { key: '15k', label: '15K', distanceKm: 15 },
  { key: '30k', label: '30K', distanceKm: 30 },
  { key: 'half_marathon', label: 'Half Marathon', distanceKm: 21.0975 },
  { key: 'marathon', label: 'Marathon', distanceKm: 42.195 },
];

export const PersonalBestsEditor: React.FC<PersonalBestsEditorProps> = ({
  personalBests,
  onSave,
  distanceUnit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBests, setEditedBests] = useState<PersonalBests>(personalBests || {});
  const [editedStrings, setEditedStrings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Format seconds to HH:MM:SS or MM:SS
  const formatTime = (seconds?: number): string => {
    if (!seconds) return '--:--';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Parse time string (HH:MM:SS or MM:SS) to seconds
  const parseTime = (timeStr: string): number | undefined => {
    if (!timeStr || timeStr === '--:--') return undefined;

    const parts = timeStr.split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return undefined;

    if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      // MM:SS
      return parts[0] * 60 + parts[1];
    }
    return undefined;
  };

  // Calculate pace from time and distance
  const calculatePace = (seconds: number, distanceKm: number): string => {
    const distance = distanceUnit === 'mi' ? distanceKm / 1.60934 : distanceKm;
    const paceSeconds = seconds / distance;
    const minutes = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    const unit = distanceUnit === 'mi' ? 'min/mi' : 'min/km';
    return `${minutes}:${secs.toString().padStart(2, '0')} ${unit}`;
  };

  const handleEdit = () => {
    setEditedBests(personalBests || {});
    // Initialize string values from personal bests
    const strings: Record<string, string> = {};
    RACE_DISTANCES.forEach(race => {
      const seconds = personalBests?.[race.key];
      strings[race.key] = seconds ? formatTime(seconds) : '';
    });
    setEditedStrings(strings);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedBests(personalBests || {});
    setEditedStrings({});
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Convert all string values to seconds before saving
      const bestsToSave: PersonalBests = {};
      RACE_DISTANCES.forEach(race => {
        const timeStr = editedStrings[race.key];
        if (timeStr && timeStr !== '--:--') {
          const seconds = parseTime(timeStr);
          if (seconds) {
            bestsToSave[race.key] = seconds;
          }
        }
      });
      await onSave(bestsToSave);
      setIsEditing(false);
      setEditedStrings({});
    } catch (error) {
      console.error('Failed to save personal bests:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTimeChange = (key: string, value: string) => {
    setEditedStrings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Trophy className="text-yellow-500" size={24} />
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Personal Bests
          </h2>
        </div>
        {!isEditing ? (
          <button
            onClick={handleEdit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            <Edit2 size={16} />
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <X size={16} />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {RACE_DISTANCES.map((race) => {
          const timeInSeconds = personalBests?.[race.key];
          const displayValue = isEditing ? editedStrings[race.key] || '' : formatTime(timeInSeconds);

          return (
            <div
              key={race.key}
              className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
            >
              <div className="flex-1">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {race.label}
                </div>
                {timeInSeconds && !isEditing && (
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Pace: {calculatePace(timeInSeconds, race.distanceKm)}
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="MM:SS or HH:MM:SS"
                    value={displayValue}
                    onChange={(e) => handleTimeChange(race.key, e.target.value)}
                    className="w-48 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ) : (
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {displayValue}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isEditing && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Tip:</strong> Enter times in MM:SS format (e.g., 23:45) or HH:MM:SS format (e.g., 3:45:30). Leave blank to clear a personal best.
          </p>
        </div>
      )}
    </div>
  );
};
