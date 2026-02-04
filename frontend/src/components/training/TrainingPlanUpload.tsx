import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { trainingPlanAPI } from '../../services/api';
import { FileText, Upload, Check, X } from 'lucide-react';

interface TrainingPlanUploadProps {
  goalId?: number;
  onSuccess?: (data: any) => void;
}

export const TrainingPlanUpload: React.FC<TrainingPlanUploadProps> = ({ goalId, onSuccess }) => {
  const [planName, setPlanName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [identifyPeaks, setIdentifyPeaks] = useState(true);
  const [peakWeeksCount, setPeakWeeksCount] = useState(3);
  const [taperWeeks, setTaperWeeks] = useState(2);
  const [enableCarbLoading, setEnableCarbLoading] = useState(true);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      // Auto-populate plan name from filename if empty
      if (!planName.trim()) {
        const nameWithoutExt = file.name.replace(/\.(csv|pdf)$/i, '');
        setPlanName(nameWithoutExt);
      }
    }
  }, [planName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    if (!planName.trim()) {
      setError('Please enter a plan name');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('planName', planName.trim());
      formData.append('identifyPeaks', identifyPeaks.toString());
      formData.append('peakWeeksCount', peakWeeksCount.toString());
      formData.append('taperWeeks', taperWeeks.toString());
      formData.append('enableCarbLoading', enableCarbLoading.toString());
      if (goalId) {
        formData.append('goalId', goalId.toString());
      }

      const response = await trainingPlanAPI.uploadPlan(formData);
      setPreview(response.data);
      onSuccess?.(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload training plan');
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setPreview(null);
    setPlanName('');
    setSelectedFile(null);
    setError(null);
  };

  const formatFileSize = (bytes: number) => {
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  if (preview) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <Check className="text-green-600 dark:text-green-400" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
                Training Plan Uploaded Successfully!
              </h3>
              <p className="text-sm text-green-800 dark:text-green-200">
                {preview.plan.name} - {preview.workouts.length} workouts created
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <h4 className="font-semibold text-slate-900 dark:text-white mb-4 text-lg">
            Plan Summary
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-600 dark:text-slate-400">Plan Name:</span>
              <p className="font-semibold text-slate-900 dark:text-white mt-1">
                {preview.plan.name}
              </p>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Source:</span>
              <p className="font-semibold text-slate-900 dark:text-white mt-1">
                {preview.plan.source === 'csv_upload' ? 'CSV Upload' : 'PDF Upload'}
              </p>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Start Date:</span>
              <p className="font-semibold text-slate-900 dark:text-white mt-1">
                {new Date(preview.plan.start_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">End Date:</span>
              <p className="font-semibold text-slate-900 dark:text-white mt-1">
                {new Date(preview.plan.end_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Total Weeks:</span>
              <p className="font-semibold text-slate-900 dark:text-white mt-1">
                {preview.plan.total_weeks}
              </p>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Workouts:</span>
              <p className="font-semibold text-slate-900 dark:text-white mt-1">
                {preview.workouts.length}
              </p>
            </div>
            {preview.plan.identify_peaks && (
              <>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Peak Week:</span>
                  <p className="font-semibold text-orange-600 dark:text-orange-400 mt-1">
                    Week {preview.plan.peak_week_number}
                  </p>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Taper Period:</span>
                  <p className="font-semibold text-purple-600 dark:text-purple-400 mt-1">
                    {preview.plan.taper_weeks} weeks
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={resetUpload}
            className="flex-1 btn btn-secondary flex items-center justify-center gap-2"
          >
            <Upload size={16} />
            Upload Another Plan
          </button>
          <button
            onClick={() => onSuccess?.(preview)}
            className="flex-1 btn btn-primary"
          >
            View in Calendar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan Name Input */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Plan Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          placeholder="e.g., 16-Week Marathon Training Plan"
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        />
      </div>

      {/* Peak Week & Taper Configuration */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
          <span>📊</span>
          Training Phases
        </h4>

        <div className="space-y-4">
          {/* Identify Peaks Checkbox */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="identifyPeaks"
              checked={identifyPeaks}
              onChange={(e) => setIdentifyPeaks(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="identifyPeaks" className="flex-1 cursor-pointer">
              <div className="font-medium text-slate-900 dark:text-white">
                Identify Peak Weeks & Taper Period
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Automatically highlight your highest volume weeks and taper period in the calendar
              </p>
            </label>
          </div>

          {/* Peak Weeks Count & Taper Weeks Selection */}
          {identifyPeaks && (
            <div className="ml-7 pl-4 border-l-2 border-blue-300 dark:border-blue-700 space-y-4">
              {/* Number of Peak Weeks */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Peak Weeks to Highlight
                </label>
                <div className="flex gap-3">
                  {[1, 2, 3].map(num => (
                    <label key={num} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="peakWeeksCount"
                        value={num}
                        checked={peakWeeksCount === num}
                        onChange={() => setPeakWeeksCount(num)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        Top {num}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                  Highlight the highest volume weeks in your plan
                </p>
              </div>

              {/* Taper Duration */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Taper Duration
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="taperWeeks"
                      value="2"
                      checked={taperWeeks === 2}
                      onChange={() => setTaperWeeks(2)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">2 Weeks</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="taperWeeks"
                      value="3"
                      checked={taperWeeks === 3}
                      onChange={() => setTaperWeeks(3)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">3 Weeks</span>
                  </label>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                  The taper period will be calculated from the end of your plan
                </p>
              </div>
            </div>
          )}

          {/* Carb Loading Toggle */}
          <div className="flex items-start gap-3 pt-3 border-t border-blue-200 dark:border-blue-800">
            <input
              type="checkbox"
              id="enableCarbLoading"
              checked={enableCarbLoading}
              onChange={(e) => setEnableCarbLoading(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="enableCarbLoading" className="flex-1 cursor-pointer">
              <div className="font-medium text-slate-900 dark:text-white">
                Enable Smart Carb-Loading
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Automatically identify fueling periods (3 days before long runs 20km+, race day prep)
              </p>
            </label>
          </div>
        </div>
      </div>

      {/* File Upload Area */}
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
            isDragActive
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-105'
              : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <input {...getInputProps()} />
          <div className="space-y-3">
            <div className="text-6xl">📄</div>
            {isDragActive ? (
              <p className="text-blue-600 dark:text-blue-400 font-medium text-lg">
                Drop your training plan here
              </p>
            ) : (
              <>
                <p className="text-slate-900 dark:text-white font-medium text-lg">
                  Drag & drop your training plan here
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  or click to browse files
                </p>
              </>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Supports CSV and PDF files (max 10MB)
            </p>
          </div>
        </div>
      ) : (
        /* Selected File Preview */
        <div className="border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <FileText className="text-blue-600 dark:text-blue-400" size={40} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-1">
                  File Selected
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  {selectedFile.name}
                </p>
                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-500">
                  <span>Size: {formatFileSize(selectedFile.size)}</span>
                  <span>Type: {selectedFile.type || 'Unknown'}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedFile(null);
                setError(null);
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              title="Remove file"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-600 dark:text-red-400 text-xl">⚠️</span>
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!selectedFile || !planName.trim() || uploading}
        className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
          !selectedFile || !planName.trim() || uploading
            ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
        }`}
      >
        {uploading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            <span>Processing training plan...</span>
          </>
        ) : (
          <>
            <Upload size={20} />
            <span>Upload Training Plan</span>
          </>
        )}
      </button>

      {/* CSV Format Example */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
        <h4 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm flex items-center gap-2">
          <span>💡</span>
          CSV Format Example:
        </h4>
        <pre className="text-xs text-slate-600 dark:text-slate-400 overflow-x-auto bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
          Date,Type,Name,Description,Distance(km),Duration(min),PaceMin,PaceMax,HRZone{'\n'}
          2024-01-01,easy,Easy Run,Recovery,8,50,5.8,6.5,2{'\n'}
          2024-01-03,tempo,Tempo Run,20min threshold,12,65,4.3,4.6,4{'\n'}
          2024-01-05,intervals,Track Workout,5x1km,5.5,45,3.8,4.0,5
        </pre>
        <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
          <strong>Tip:</strong> Make sure your CSV has headers and follows this format exactly
        </p>
      </div>
    </div>
  );
};
