import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trainingPlanAPI } from '../../services/api';
import { format } from 'date-fns';
import { FileText, Calendar, Trash2, Edit2, Check, X, MoreVertical, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

interface TrainingPlan {
  id: number;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  total_weeks?: number;
  source: 'manual' | 'csv_upload' | 'pdf_upload';
  file_metadata?: {
    filename?: string;
    size?: number;
    uploadedAt?: string;
  };
  is_active: boolean;
  identify_peaks?: boolean;
  peak_weeks_count?: number;
  taper_weeks?: number;
  peak_week_numbers?: number[];
  taper_start_date?: string;
  enable_carb_loading?: boolean;
  created_at: string;
  updated_at: string;
}

const SOURCE_LABELS = {
  manual: 'Manual',
  csv_upload: 'CSV Upload',
  pdf_upload: 'PDF Upload',
};

const SOURCE_ICONS = {
  manual: '✏️',
  csv_upload: '📊',
  pdf_upload: '📄',
};

export const TrainingPlanList: React.FC = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingPlan, setEditingPlan] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [configuringPlan, setConfiguringPlan] = useState<number | null>(null);
  const [configForm, setConfigForm] = useState({
    identify_peaks: false,
    peak_weeks_count: 3,
    taper_weeks: 2,
    enable_carb_loading: false,
  });
  const [reuploadingPlan, setReuploadingPlan] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: plansData, isLoading } = useQuery({
    queryKey: ['trainingPlans'],
    queryFn: async () => {
      const response = await trainingPlanAPI.getPlans();
      return response.data.plans as TrainingPlan[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (planId: number) => trainingPlanAPI.deletePlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingPlans'] });
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      toast.success('Training plan deleted successfully');
      setDeleteConfirm(null);
    },
    onError: () => {
      toast.error('Failed to delete training plan');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      trainingPlanAPI.updatePlan(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingPlans'] });
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      toast.success('Training plan updated successfully');
      setEditingPlan(null);
    },
    onError: () => {
      toast.error('Failed to update training plan');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ planId, isActive }: { planId: number; isActive: boolean }) =>
      trainingPlanAPI.updatePlan(planId, { is_active: isActive }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['trainingPlans'] });
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      toast.success(variables.isActive ? 'Plan activated successfully' : 'Plan deactivated successfully');

      // Reload page to refresh calendar workouts
      setTimeout(() => {
        window.location.reload();
      }, 500);
    },
    onError: () => {
      toast.error('Failed to update plan status');
    },
  });

  const handleEdit = (plan: TrainingPlan) => {
    setEditingPlan(plan.id);
    setEditForm({
      name: plan.name,
      description: plan.description || '',
    });
  };

  const handleSaveEdit = () => {
    if (editingPlan) {
      updateMutation.mutate({
        id: editingPlan,
        data: editForm,
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingPlan(null);
    setEditForm({ name: '', description: '' });
  };

  const handleConfigure = (plan: TrainingPlan) => {
    setConfiguringPlan(plan.id);
    setConfigForm({
      identify_peaks: plan.identify_peaks || false,
      peak_weeks_count: plan.peak_weeks_count || 3,
      taper_weeks: plan.taper_weeks || 2,
      enable_carb_loading: plan.enable_carb_loading || false,
    });
  };

  const handleSaveConfig = () => {
    if (configuringPlan) {
      updateMutation.mutate({
        id: configuringPlan,
        data: configForm,
      });
      setConfiguringPlan(null);
    }
  };

  const handleCancelConfig = () => {
    setConfiguringPlan(null);
    setConfigForm({
      identify_peaks: false,
      peak_weeks_count: 3,
      taper_weeks: 2,
      enable_carb_loading: false,
    });
  };

  const handleDelete = (planId: number) => {
    deleteMutation.mutate(planId);
  };

  const handleReupload = (planId: number) => {
    setReuploadingPlan(planId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !reuploadingPlan) return;

    const plan = plansData?.find(p => p.id === reuploadingPlan);
    if (!plan) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('planName', plan.name);
      formData.append('identifyPeaks', String(plan.identify_peaks || false));
      formData.append('peakWeeksCount', String(plan.peak_weeks_count || 3));
      formData.append('taperWeeks', String(plan.taper_weeks || 2));
      formData.append('enableCarbLoading', String(plan.enable_carb_loading || false));

      // Delete old plan workouts and create new ones
      await trainingPlanAPI.deletePlan(reuploadingPlan);
      await trainingPlanAPI.uploadPlan(formData);

      queryClient.invalidateQueries({ queryKey: ['trainingPlans'] });
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      toast.success('Training plan re-uploaded successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to re-upload plan');
    } finally {
      setUploading(false);
      setReuploadingPlan(null);
      if (event.target) event.target.value = '';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const plans = plansData || [];

  if (plans.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText size={48} className="mx-auto text-gray-400 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No training plans yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Upload a plan or create workouts to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input for re-upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Training Plans ({plans.length})
        </h2>
      </div>

      <div className="space-y-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`border rounded-lg transition-all ${
              plan.is_active
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
            }`}
          >
            {/* Main row */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {editingPlan === plan.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Plan name"
                      />
                      <textarea
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm({ ...editForm, description: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Description (optional)"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="btn btn-primary flex items-center gap-2"
                          disabled={!editForm.name.trim()}
                        >
                          <Check size={16} />
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="btn btn-secondary flex items-center gap-2"
                        >
                          <X size={16} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{SOURCE_ICONS[plan.source]}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {plan.name}
                            </h3>
                            {/* Active Toggle */}
                            <label className="flex items-center gap-2 cursor-pointer">
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                {plan.is_active ? 'Active' : 'Inactive'}
                              </span>
                              <div className="relative inline-block w-11 h-6">
                                <input
                                  type="checkbox"
                                  checked={plan.is_active}
                                  onChange={(e) => toggleActiveMutation.mutate({
                                    planId: plan.id,
                                    isActive: e.target.checked
                                  })}
                                  className="sr-only peer"
                                />
                                <div className={`w-11 h-6 rounded-full transition-colors ${
                                  plan.is_active
                                    ? 'bg-blue-600'
                                    : 'bg-gray-200 dark:bg-gray-700'
                                }`}></div>
                                <div className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                                  plan.is_active ? 'translate-x-5' : 'translate-x-0'
                                }`}></div>
                              </div>
                            </label>
                          </div>
                          {plan.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {plan.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {format(new Date(plan.start_date), 'MMM dd, yyyy')} -{' '}
                          {format(new Date(plan.end_date), 'MMM dd, yyyy')}
                        </span>
                        <span>
                          📅 {plan.total_weeks || 'N/A'} weeks
                        </span>
                        <span>
                          📁 {SOURCE_LABELS[plan.source]}
                        </span>
                        {plan.file_metadata?.filename && (
                          <span>
                            📄 {plan.file_metadata.filename}
                          </span>
                        )}
                      </div>

                      {/* Expandable details */}
                      {expandedPlan === plan.id && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Uploaded:</span>
                              <span className="ml-2 text-gray-900 dark:text-white">
                                {format(new Date(plan.created_at), 'MMM dd, yyyy HH:mm')}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Last updated:</span>
                              <span className="ml-2 text-gray-900 dark:text-white">
                                {format(new Date(plan.updated_at), 'MMM dd, yyyy HH:mm')}
                              </span>
                            </div>
                            {plan.file_metadata?.size && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">File size:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {formatFileSize(plan.file_metadata.size)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Actions */}
                {editingPlan !== plan.id && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                      className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Show details"
                    >
                      <MoreVertical size={18} />
                    </button>
                    {(plan.source === 'csv_upload' || plan.source === 'pdf_upload') && (
                      <button
                        onClick={() => handleReupload(plan.id)}
                        disabled={uploading && reuploadingPlan === plan.id}
                        className="px-3 py-1.5 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Re-upload training plan"
                      >
                        <Upload size={16} />
                        {uploading && reuploadingPlan === plan.id ? 'Uploading...' : 'Re-upload'}
                      </button>
                    )}
                    <button
                      onClick={() => handleConfigure(plan)}
                      className="px-3 py-1.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                      title="Configure training phases"
                    >
                      ⚙️ Configure
                    </button>
                    <button
                      onClick={() => handleEdit(plan)}
                      className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                      title="Edit plan"
                    >
                      <Edit2 size={18} />
                    </button>
                    {deleteConfirm === plan.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Delete?
                        </span>
                        <button
                          onClick={() => handleDelete(plan.id)}
                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-1.5 text-sm bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(plan.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        title="Delete plan"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Configuration Modal */}
      {configuringPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Configure Training Phases
            </h3>

            <div className="space-y-4">
              {/* Identify Peaks */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="config-identify-peaks"
                  checked={configForm.identify_peaks}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, identify_peaks: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="config-identify-peaks" className="flex-1 cursor-pointer">
                  <div className="font-medium text-gray-900 dark:text-white">
                    Identify Peak Weeks & Taper Period
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Highlight highest volume weeks and taper period in calendar
                  </p>
                </label>
              </div>

              {/* Peak Weeks Count & Taper Weeks */}
              {configForm.identify_peaks && (
                <div className="ml-7 pl-4 border-l-2 border-blue-300 dark:border-blue-700 space-y-4">
                  {/* Peak Weeks Count */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Number of Peak Weeks to Highlight
                    </label>
                    <div className="flex gap-3">
                      {[1, 2, 3].map(num => (
                        <label key={num} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="config-peak-weeks"
                            value={num}
                            checked={configForm.peak_weeks_count === num}
                            onChange={() => setConfigForm({ ...configForm, peak_weeks_count: num })}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Top {num}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Weeks with highest training volume
                    </p>
                  </div>

                  {/* Taper Duration */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Taper Duration
                    </label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="config-taper"
                          value="2"
                          checked={configForm.taper_weeks === 2}
                          onChange={() => setConfigForm({ ...configForm, taper_weeks: 2 })}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">2 Weeks</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="config-taper"
                          value="3"
                          checked={configForm.taper_weeks === 3}
                          onChange={() => setConfigForm({ ...configForm, taper_weeks: 3 })}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">3 Weeks</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Carb Loading */}
              <div className="flex items-start gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <input
                  type="checkbox"
                  id="config-carb-loading"
                  checked={configForm.enable_carb_loading}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, enable_carb_loading: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="config-carb-loading" className="flex-1 cursor-pointer">
                  <div className="font-medium text-gray-900 dark:text-white">
                    Enable Smart Carb-Loading
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Identify fueling periods before long runs (20km+) and race days
                  </p>
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleCancelConfig}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
