import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { raceHistoryAPI } from '../services/api';
import { RaceHistory } from '../types';
import toast from 'react-hot-toast';
import { Trophy, Plus, Edit, Trash2, Calendar, Clock, MapPin, Award } from 'lucide-react';

export default function RaceHistoryManager() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<RaceHistory>>({
    race_type: 'marathon',
    is_personal_best: false,
  });

  const { data: raceHistoryData } = useQuery({
    queryKey: ['raceHistory'],
    queryFn: async () => {
      const response = await raceHistoryAPI.getRaceHistory();
      return response.data.data.raceHistory as RaceHistory[];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<RaceHistory>) => raceHistoryAPI.createRace(data),
    onSuccess: () => {
      toast.success('Race added successfully');
      queryClient.invalidateQueries({ queryKey: ['raceHistory'] });
      setIsAdding(false);
      resetForm();
    },
    onError: () => toast.error('Failed to add race'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<RaceHistory> }) =>
      raceHistoryAPI.updateRace(id, data),
    onSuccess: () => {
      toast.success('Race updated successfully');
      queryClient.invalidateQueries({ queryKey: ['raceHistory'] });
      setEditingId(null);
      resetForm();
    },
    onError: () => toast.error('Failed to update race'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => raceHistoryAPI.deleteRace(id),
    onSuccess: () => {
      toast.success('Race deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['raceHistory'] });
    },
    onError: () => toast.error('Failed to delete race'),
  });

  const resetForm = () => {
    setFormData({ race_type: 'marathon', is_personal_best: false });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatRaceType = (type: string) => {
    return type.replace('_', ' ').toUpperCase();
  };

  const raceTypes = [
    { value: '5k', label: '5K' },
    { value: '10k', label: '10K' },
    { value: '15k', label: '15K' },
    { value: 'half_marathon', label: 'Half Marathon' },
    { value: 'marathon', label: 'Marathon' },
    { value: 'ultra', label: 'Ultra Marathon' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="text-yellow-500" size={20} />
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Race History</h3>
        </div>
        {!isAdding && !editingId && (
          <button
            onClick={() => setIsAdding(true)}
            className="btn btn-primary flex items-center gap-2 text-sm"
          >
            <Plus size={16} />
            Add Race
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {(isAdding || editingId) && (
        <form onSubmit={handleSubmit} className="card bg-gray-50 dark:bg-gray-800 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Race Name *
              </label>
              <input
                type="text"
                value={formData.race_name || ''}
                onChange={(e) => setFormData({ ...formData, race_name: e.target.value })}
                className="input text-sm"
                required
                placeholder="e.g., Boston Marathon"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Distance *
              </label>
              <select
                value={formData.race_type}
                onChange={(e) => setFormData({ ...formData, race_type: e.target.value as any })}
                className="input text-sm"
                required
              >
                {raceTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={formData.race_date ? formData.race_date.split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, race_date: e.target.value })}
                className="input text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Finish Time *
              </label>
              <div className="grid grid-cols-3 gap-1">
                <input
                  type="number"
                  min="0"
                  placeholder="HH"
                  onChange={(e) => {
                    const hours = parseInt(e.target.value) || 0;
                    const current = formData.finish_time_seconds || 0;
                    const mins = Math.floor((current % 3600) / 60);
                    const secs = current % 60;
                    setFormData({ ...formData, finish_time_seconds: hours * 3600 + mins * 60 + secs });
                  }}
                  className="input text-sm text-center"
                  required
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="MM"
                  onChange={(e) => {
                    const mins = parseInt(e.target.value) || 0;
                    const current = formData.finish_time_seconds || 0;
                    const hours = Math.floor(current / 3600);
                    const secs = current % 60;
                    setFormData({ ...formData, finish_time_seconds: hours * 3600 + mins * 60 + secs });
                  }}
                  className="input text-sm text-center"
                  required
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="SS"
                  onChange={(e) => {
                    const secs = parseInt(e.target.value) || 0;
                    const current = formData.finish_time_seconds || 0;
                    const hours = Math.floor(current / 3600);
                    const mins = Math.floor((current % 3600) / 60);
                    setFormData({ ...formData, finish_time_seconds: hours * 3600 + mins * 60 + secs });
                  }}
                  className="input text-sm text-center"
                  required
                />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Location
              </label>
              <input
                type="text"
                value={formData.race_location || ''}
                onChange={(e) => setFormData({ ...formData, race_location: e.target.value })}
                className="input text-sm"
                placeholder="e.g., Boston, MA"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.is_personal_best || false}
                  onChange={(e) => setFormData({ ...formData, is_personal_best: e.target.checked })}
                  className="rounded"
                />
                <Award size={16} className="text-yellow-500" />
                <span className="font-medium text-gray-700 dark:text-gray-300">Personal Best</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary text-sm">
              {editingId ? 'Update' : 'Add'} Race
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                resetForm();
              }}
              className="btn btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Race List */}
      <div className="space-y-2">
        {raceHistoryData && raceHistoryData.length > 0 ? (
          raceHistoryData.map((race) => (
            <div
              key={race.id}
              className={`card p-4 ${
                race.is_personal_best
                  ? 'border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-gray-900 dark:text-gray-100">{race.race_name}</h4>
                    {race.is_personal_best && (
                      <Award size={16} className="text-yellow-500" aria-label="Personal Best" />
                    )}
                    <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300">
                      {formatRaceType(race.race_type)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />
                      {new Date(race.race_date).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={14} />
                      {formatTime(race.finish_time_seconds)}
                    </div>
                    {race.race_location && (
                      <div className="flex items-center gap-1">
                        <MapPin size={14} />
                        {race.race_location}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingId(race.id!);
                      setFormData(race);
                    }}
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this race?')) {
                        deleteMutation.mutate(race.id!);
                      }
                    }}
                    className="text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Trophy size={48} className="mx-auto mb-3 opacity-50" />
            <p>No race history yet. Add your first race to track your progress!</p>
          </div>
        )}
      </div>
    </div>
  );
}
