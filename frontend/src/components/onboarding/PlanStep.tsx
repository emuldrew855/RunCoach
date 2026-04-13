import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { trainingPlanAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Calendar, Upload, FileText, PlusCircle } from 'lucide-react';

interface PlanStepProps {
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
}

type PlanOption = 'upload' | 'empty' | null;

export default function PlanStep({ onComplete, onSkip, onBack }: PlanStepProps) {
  const queryClient = useQueryClient();
  const [selectedOption, setSelectedOption] = useState<PlanOption>(null);
  const [file, setFile] = useState<File | null>(null);
  const [planName, setPlanName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await trainingPlanAPI.uploadPlan(formData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingPlans'] });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      toast.success('Training plan imported!');
      onComplete();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to import plan');
    },
  });

  const createEmptyMutation = useMutation({
    mutationFn: async () => {
      // Create an empty training plan for 365 days
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 365);

      return trainingPlanAPI.createPlan({
        name: planName || 'My Training Plan',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        source: 'manual',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingPlans'] });
      toast.success('Training plan created!');
      onComplete();
    },
    onError: () => {
      toast.error('Failed to create plan');
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (!planName) {
        setPlanName(selectedFile.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', planName || file.name.replace(/\.[^/.]+$/, ''));

    uploadMutation.mutate(formData);
  };

  const handleCreateEmpty = () => {
    createEmptyMutation.mutate();
  };

  const isLoading = uploadMutation.isPending || createEmptyMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Calendar className="text-purple-600 dark:text-purple-400" size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Create a training plan
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Import an existing plan or start fresh.
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {/* Upload option */}
        <button
          onClick={() => setSelectedOption('upload')}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
            selectedOption === 'upload'
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              selectedOption === 'upload'
                ? 'bg-purple-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
            }`}>
              <Upload size={20} />
            </div>
            <div>
              <div className="font-medium text-slate-900 dark:text-white">
                Import from CSV or PDF
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Upload a training plan file
              </div>
            </div>
          </div>
        </button>

        {/* Upload form */}
        {selectedOption === 'upload' && (
          <div className="ml-4 pl-4 border-l-2 border-purple-200 dark:border-purple-800 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Plan Name
              </label>
              <input
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="My Marathon Plan"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv,.pdf"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
              >
                <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                  <FileText size={24} />
                  {file ? (
                    <span className="text-purple-600 dark:text-purple-400 font-medium">
                      {file.name}
                    </span>
                  ) : (
                    <span>Click to select CSV or PDF file</span>
                  )}
                </div>
              </button>
            </div>
            <button
              onClick={handleUpload}
              disabled={!file || isLoading}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors"
            >
              {uploadMutation.isPending ? 'Importing...' : 'Import Plan'}
            </button>
          </div>
        )}

        {/* Empty plan option */}
        <button
          onClick={() => setSelectedOption('empty')}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
            selectedOption === 'empty'
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              selectedOption === 'empty'
                ? 'bg-purple-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
            }`}>
              <PlusCircle size={20} />
            </div>
            <div>
              <div className="font-medium text-slate-900 dark:text-white">
                Start with empty calendar
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Add workouts manually as you go
              </div>
            </div>
          </div>
        </button>

        {/* Empty plan form */}
        {selectedOption === 'empty' && (
          <div className="ml-4 pl-4 border-l-2 border-purple-200 dark:border-purple-800 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Plan Name
              </label>
              <input
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="My Training Plan"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleCreateEmpty}
              disabled={isLoading}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors"
            >
              {createEmptyMutation.isPending ? 'Creating...' : 'Create Plan'}
            </button>
          </div>
        )}
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
            Skip for now
          </button>
          {!selectedOption && (
            <button
              onClick={onSkip}
              className="flex items-center gap-2 px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition-colors"
            >
              Continue
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
