import multer from 'multer';
import { parse } from 'csv-parse/sync';
import {
  createTrainingPlan,
} from '../models/TrainingPlan';
import {
  bulkCreatePlannedWorkouts,
} from '../models/PlannedWorkout';
import { parsePDFPlan } from './pdfParsingService';

// Configure multer for file uploads
export const uploadConfig = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and PDF files are allowed'));
    }
  },
});

interface ParsedWorkout {
  date: string;
  type: string;
  name?: string;
  description?: string;
  distance?: number;
  duration?: number;
  pace?: { min?: number; max?: number; avg?: number };
  hrZone?: number;
  intervals?: any[];
}

/**
 * Parse CSV training plan
 * Expected format:
 * Date,Type,Name,Description,Distance(km),Duration(min),PaceMin,PaceMax,PaceAverage,HRZone,Intervals
 */
export async function parseCSVPlan(buffer: Buffer): Promise<ParsedWorkout[]> {
  const content = buffer.toString('utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true, // Allow rows with different column counts
    relax_quotes: true, // Be more forgiving with quotes
  });

  /**
   * Helper function to convert MM:SS pace format to decimal minutes
   * e.g., "04:46" -> 4.76666... (4 minutes 46 seconds)
   */
  const convertPaceToDecimal = (paceStr: string): number | undefined => {
    if (!paceStr || paceStr.trim() === '') return undefined;

    // Check if it's already in decimal format (e.g., "5.5")
    if (!paceStr.includes(':')) {
      const decimal = parseFloat(paceStr);
      return isNaN(decimal) ? undefined : decimal;
    }

    // Parse MM:SS format
    const parts = paceStr.split(':');
    if (parts.length !== 2) return undefined;

    const minutes = parseInt(parts[0]);
    const seconds = parseInt(parts[1]);

    if (isNaN(minutes) || isNaN(seconds)) return undefined;

    // Convert to decimal: minutes + (seconds / 60)
    return minutes + (seconds / 60);
  };

  return records.map((record: any) => {
    // Normalize workout type: convert spaces to underscores and lowercase
    let workoutType = record.Type?.toLowerCase() || 'easy';
    workoutType = workoutType.replace(/\s+/g, '_'); // "long run" -> "long_run"

    const workout: ParsedWorkout = {
      date: record.Date,
      type: workoutType,
      name: record.Name,
      description: record.Description,
    };

    // Parse distance (km to meters)
    if (record['Distance(km)']) {
      workout.distance = parseFloat(record['Distance(km)']) * 1000;
    }

    // Parse duration (minutes to seconds)
    if (record['Duration(min)']) {
      workout.duration = parseFloat(record['Duration(min)']) * 60;
    }

    // Parse pace (supports multiple formats: MM:SS or decimal)
    workout.pace = {};

    const paceMin = record['PaceMin(min/km)'] || record.PaceMin;
    if (paceMin) {
      workout.pace.min = convertPaceToDecimal(paceMin);
    }

    const paceMax = record['PaceMax(min/km)'] || record.PaceMax;
    if (paceMax) {
      workout.pace.max = convertPaceToDecimal(paceMax);
    }

    const paceAvg = record.PaceAverage || record.AveragePace;
    if (paceAvg) {
      workout.pace.avg = convertPaceToDecimal(paceAvg);
    }

    // Parse HR zone
    if (record.HRZone) {
      workout.hrZone = parseInt(record.HRZone);
    }

    // Parse intervals (JSON string)
    if (record.Intervals) {
      try {
        workout.intervals = JSON.parse(record.Intervals);
      } catch (e) {
        console.warn('Failed to parse intervals:', record.Intervals);
      }
    }

    return workout;
  });
}

// PDF parsing logic moved to pdfParsingService.ts

/**
 * Get HR zone range for a given zone number
 */
function getHRZoneRange(zone: number): { min: number; max: number } {
  const ranges: Record<number, { min: number; max: number }> = {
    1: { min: 0, max: 120 },
    2: { min: 120, max: 140 },
    3: { min: 140, max: 160 },
    4: { min: 160, max: 175 },
    5: { min: 175, max: 220 },
  };
  return ranges[zone] || { min: 0, max: 220 };
}

/**
 * Create training plan from file upload
 */
export async function createPlanFromFile(
  userId: number,
  goalId: number | null,
  file: Express.Multer.File,
  planName: string,
  identifyPeaks: boolean = false,
  peakWeeksCount: number = 1,
  taperWeeks: number = 2,
  enableCarbLoading: boolean = false
): Promise<{ plan: any; workouts: any[] }> {
  let parsedWorkouts: ParsedWorkout[];

  // Parse file based on type
  if (file.mimetype === 'text/csv') {
    parsedWorkouts = await parseCSVPlan(file.buffer);
  } else {
    parsedWorkouts = await parsePDFPlan(file.buffer);
  }

  if (parsedWorkouts.length === 0) {
    throw new Error('No workouts found in the uploaded file');
  }

  // Calculate plan date range
  const dates = parsedWorkouts
    .map(w => new Date(w.date))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) {
    throw new Error('No valid dates found in workouts');
  }

  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const totalWeeks = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  // Calculate peak weeks and taper start date if enabled
  let peakWeekNumbers: number[] = [];
  let taperStartDate: Date | undefined;

  if (identifyPeaks) {
    // Group workouts by week and calculate weekly volume
    const weeklyVolumes: Map<number, number> = new Map();

    parsedWorkouts.forEach(workout => {
      const workoutDate = new Date(workout.date);
      const weekNumber = Math.floor(
        (workoutDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );

      const distance = workout.distance || 0;
      const currentVolume = weeklyVolumes.get(weekNumber) || 0;
      weeklyVolumes.set(weekNumber, currentVolume + distance);
    });

    // Sort weeks by volume (descending) and get top N peak weeks
    const sortedWeeks = Array.from(weeklyVolumes.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by volume descending
      .slice(0, peakWeeksCount) // Take top N weeks
      .map(([weekNum]) => weekNum + 1) // Convert to 1-indexed week numbers
      .sort((a, b) => a - b); // Sort week numbers ascending for display

    peakWeekNumbers = sortedWeeks;

    console.log('🏔️ Peak weeks calculation:', {
      peakWeeksCount,
      totalWeeks: weeklyVolumes.size,
      peakWeekNumbers,
      weeklyVolumesKm: Array.from(weeklyVolumes.entries())
        .map(([week, vol]) => ({ week: week + 1, km: (vol / 1000).toFixed(1) }))
        .sort((a, b) => parseInt(b.km) - parseInt(a.km))
        .slice(0, 5) // Top 5 for logging
    });

    // Calculate taper start date (taperWeeks before end date)
    taperStartDate = new Date(endDate);
    taperStartDate.setDate(taperStartDate.getDate() - (taperWeeks * 7));
  }

  // Create training plan
  const plan = await createTrainingPlan({
    user_id: userId,
    goal_id: goalId ?? undefined,
    name: planName,
    description: `Imported from ${file.originalname}`,
    start_date: startDate,
    end_date: endDate,
    total_weeks: totalWeeks,
    source: file.mimetype === 'text/csv' ? 'csv_upload' : 'pdf_upload',
    file_metadata: {
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date().toISOString(),
    },
    is_active: true,
    identify_peaks: identifyPeaks,
    peak_weeks_count: peakWeeksCount,
    peak_week_numbers: peakWeekNumbers,
    taper_weeks: taperWeeks,
    taper_start_date: taperStartDate,
    enable_carb_loading: enableCarbLoading,
  });

  // Create all planned workouts
  const workouts = parsedWorkouts.map(pw => {
    const hrRange = pw.hrZone ? getHRZoneRange(pw.hrZone) : null;

    return {
      training_plan_id: plan.id,
      user_id: userId,
      scheduled_date: new Date(pw.date),
      workout_type: pw.type,
      name: pw.name,
      description: pw.description,
      target_distance_meters: pw.distance,
      target_duration_seconds: pw.duration,
      target_pace_min: pw.pace?.min ?? undefined,
      target_pace_max: pw.pace?.max ?? undefined,
      target_pace_avg: pw.pace?.avg ?? undefined,
      target_hr_zone: pw.hrZone,
      target_hr_min: hrRange?.min,
      target_hr_max: hrRange?.max,
      intervals: pw.intervals,
      completion_status: 'pending',
      coach_notes: undefined,
      athlete_notes: undefined,
    };
  });

  const createdWorkouts = await bulkCreatePlannedWorkouts(workouts as any);

  return {
    plan,
    workouts: createdWorkouts,
  };
}

/**
 * Auto-match completed activities to planned workouts
 * Matches based on date proximity (within 1 day) and distance similarity
 */
export async function autoMatchWorkouts(_userId: number): Promise<number> {
  // This is a placeholder for auto-matching logic
  // Would compare activities to planned workouts and link them
  // Implementation would check date (within 1 day), distance (within 20%), and workout type
  return 0;
}
