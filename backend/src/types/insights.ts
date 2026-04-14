/**
 * Insight Type Definitions
 *
 * These interfaces define the structure of pre-computed running insights
 * that feed into the AI coach's context for specific, data-driven feedback.
 */

/**
 * Daily Run Insight - computed per activity after sync
 *
 * Provides structured analytics on a single run including:
 * - Pacing analysis (consistency, fade detection)
 * - HR behavior (drift, zone distribution, effort mismatch)
 * - Effort assessment and execution score
 * - Compliance with planned workout
 * - Risk indicators (injury, overtraining)
 * - Generated coaching points
 */
export interface DailyRunInsight {
  activityId: number;
  userId: number;
  runDate: Date;

  // Basic activity fields (joined from activities table)
  distance_meters?: number;
  moving_time_seconds?: number;
  average_pace?: number; // min/km
  activity_name?: string;

  /**
   * Pacing Analysis
   * Analyzes pace consistency, fade patterns, and split breakdown
   */
  pacing: {
    /** Whether split data was available from Strava (usually false) */
    hasSplitsData: boolean;

    /** % change from first half to second half (negative = fade, positive = negative split) */
    paceDelta: number;

    /** Consistency score 0-1 (1 = perfect consistency) */
    consistency: number;

    /** % deviation from target pace (if planned workout exists) */
    targetDeviation?: number;

    /** Detailed split analysis */
    splitAnalysis: {
      fastestKm: { km: number; pace: number };
      slowestKm: { km: number; pace: number };
      /** Kilometer where significant fade began (>5% slower) */
      fadePoint?: number;
    };
  };

  /**
   * Heart Rate Behavior
   * Analyzes HR zones, drift patterns, and effort calibration
   */
  hrBehavior: {
    /** Whether HR data was available for this activity */
    hasData: boolean;

    /** Average HR zone (1-5, can be decimal like 2.3) */
    avgZone: number;

    /** % of time spent moving between zones (high = inconsistent effort) */
    zoneDrift: number;

    /** True if HR is too high for the pace (e.g., Z3 on easy pace) */
    effortMismatch: boolean;

    /** HR drift rate in bpm per km */
    driftRate: number;

    /** Average heart rate for the run */
    avgHR: number;

    /** Maximum heart rate reached */
    maxHR: number;
  };

  /**
   * Effort Analysis
   * Perceived difficulty and execution quality
   */
  effort: {
    /** Perceived difficulty based on HR zones */
    perceivedDifficulty: 'easy' | 'moderate' | 'hard' | 'very_hard';

    /** Execution score 0-100 (how well plan was followed) */
    executionScore: number;

    /** True if pace was appropriate for workout type */
    paceAppropriate: boolean;
  };

  /**
   * Compliance Check
   * Adherence to planned workout
   */
  compliance: {
    /** Whether there was a planned workout to compare against */
    hadPlannedWorkout: boolean;

    /** True if workout completed as planned */
    completedAsPlanned: boolean;

    /** % deviation from planned distance */
    distanceDeviation: number;

    /** % deviation from planned pace */
    paceDeviation: number;

    /** Zones difference from target HR zone (negative = easier, positive = harder) */
    hrZoneDeviation?: number;

    /** List of modifications made (e.g., "Shortened distance", "Slowed pace") */
    modifications: string[];
  };

  /**
   * Risk Indicators
   * Injury and overtraining signals
   */
  risks: {
    /** Overall injury risk assessment */
    injuryRisk: 'low' | 'moderate' | 'high';

    /** Specific signals detected (e.g., "High HR drift", "Significant pace fade") */
    overtrainingSignals: string[];

    /** True if additional recovery is recommended */
    recoveryNeeded: boolean;
  };

  /**
   * Coaching Points
   * Generated feedback for this specific run
   */
  coachingPoints: {
    /** Things the runner did well (with specific numbers) */
    strengths: string[];

    /** Areas for improvement (with specific issues) */
    improvements: string[];

    /** Specific adjustment for next workout (pace/HR targets) */
    nextWorkoutAdjustment?: string;
  };
}

/**
 * Weekly Insight - computed every Sunday/Monday
 *
 * Provides weekly training analysis including:
 * - Volume trends and adherence
 * - Pattern changes from previous week
 * - Training load distribution
 * - Risk assessment
 * - Guidance for next week
 */
export interface WeeklyInsight {
  userId: number;
  weekStart: Date;
  weekEnd: Date;

  /**
   * Volume Analysis
   * Weekly distance metrics and trends
   */
  volume: {
    /** Total distance run this week (km) */
    totalDistance: number;

    /** Planned distance for this week (km) */
    plannedDistance: number;

    /** % deviation from plan (positive = over, negative = under) */
    deviation: number;

    /** % change from previous week */
    weekOverWeekChange: number;

    /** Trend direction */
    trendDirection: 'increasing' | 'stable' | 'decreasing';

    /** Risk level based on 10% rule */
    volumeRisk: 'safe' | 'caution' | 'danger';
  };

  /**
   * Adherence Tracking
   * Workout completion metrics
   */
  adherence: {
    /** Number of workouts planned */
    workoutsPlanned: number;

    /** Number of workouts completed */
    workoutsCompleted: number;

    /** Number of workouts skipped */
    workoutsSkipped: number;

    /** % of planned workouts completed */
    adherenceRate: number;

    /** Types of workouts skipped (e.g., ["tempo", "long_run"]) */
    skippedTypes: string[];

    /** Overall compliance score 0-100 */
    complianceScore: number;
  };

  /**
   * Pattern Changes
   * Performance trends compared to last week
   */
  patterns: {
    /** Pacing trend */
    pacingTrend: 'improving' | 'stable' | 'declining';

    /** % change in average pace */
    avgPaceChange: number;

    /** HR trend */
    hrTrend: 'improving' | 'stable' | 'elevated';

    /** Change in average HR (bpm) */
    avgHRChange: number;

    /** Consistency trend */
    consistencyChange: 'more_consistent' | 'stable' | 'less_consistent';
  };

  /**
   * Training Load
   * Intensity distribution and recovery
   */
  trainingLoad: {
    /** % of volume in each intensity zone */
    intensityDistribution: {
      easy: number;
      moderate: number;
      hard: number;
    };

    /** Number of hard workouts completed */
    hardWorkoutsCompleted: number;

    /** Actual recovery days taken */
    recoveryDaysActual: number;

    /** Recommended recovery days */
    recoveryDaysNeeded: number;
  };

  /**
   * Weekly Risks
   * Overtraining, injury, and burnout assessment
   */
  weeklyRisks: {
    /** Overtraining risk level */
    overtrainingRisk: 'low' | 'moderate' | 'high';

    /** Injury risk level */
    injuryRisk: 'low' | 'moderate' | 'high';

    /** Burnout risk level */
    burnoutRisk: 'low' | 'moderate' | 'high';

    /** Specific risk indicators detected */
    indicators: string[];
  };

  /**
   * Next Week Guidance
   * Recommendations for upcoming week
   */
  nextWeekGuidance: {
    /** Volume recommendation (e.g., "Hold at 45-48km") */
    volumeRecommendation: string;

    /** Areas to focus on (e.g., ["Recovery quality", "Z2 discipline"]) */
    focusAreas: string[];

    /** Specific workouts that should be adjusted */
    workoutsToAdjust: Array<{
      workoutId: number;
      currentDate: Date;
      recommendation: string;
    }>;
  };
}

/**
 * Database row structure for daily_run_insights table
 */
export interface DailyRunInsightRow {
  id: number;
  user_id: number;
  activity_id: number;
  run_date: Date;
  pacing_analysis: any; // JSONB
  hr_behavior: any; // JSONB
  effort_analysis: any; // JSONB
  compliance_check: any; // JSONB
  risk_indicators: any; // JSONB
  coaching_points: any; // JSONB
  created_at: Date;
}

/**
 * Database row structure for weekly_insights table
 */
export interface WeeklyInsightRow {
  id: number;
  user_id: number;
  week_start: Date;
  week_end: Date;
  volume_analysis: any; // JSONB
  adherence_tracking: any; // JSONB
  pattern_changes: any; // JSONB
  training_load: any; // JSONB
  weekly_risks: any; // JSONB
  next_week_guidance: any; // JSONB
  created_at: Date;
}

/**
 * Runner Tendency - persistent behavioral patterns
 *
 * Analyzed over 4-6 week windows, updated every 2 weeks.
 * Enables coaching like: "You've started too fast in 70% of your runs."
 */
export interface RunnerTendency {
  userId: number;
  tendencyType: 'pacing' | 'hr_management' | 'volume' | 'compliance';

  /** Pacing behavior patterns */
  pacingBehavior?: {
    startsTooFast: {
      frequency: number; // % of runs
      avgFadePercent: number;
      lastOccurrence: Date | null;
    };
    negativeSplitAbility: {
      frequency: number; // % of runs
      avgImprovement: number; // % faster second half
    };
    targetPaceAccuracy: {
      avgDeviation: number; // %
      direction: 'too_fast' | 'too_slow' | 'accurate';
    };
  };

  /** HR management patterns */
  hrManagement?: {
    easyRunIntensity: {
      avgZone: number;
      shouldBe: number;
      issueFrequency: number; // % of easy runs too hard
    };
    effortCalibration: {
      hrPaceMismatch: number; // % of runs
      typicalIssue: 'hr_too_high' | 'hr_too_low' | 'well_calibrated';
    };
  };

  /** Volume management patterns */
  volumeBehavior?: {
    buildupPattern: {
      avgWeeklyIncrease: number; // %
      exceedsGuideline: number; // % of weeks
      crashPattern: boolean;
    };
    recoveryAdherence: {
      takesRestDays: boolean;
      avgRecoveryDaysPerWeek: number;
      recoveryRunQuality: 'appropriate' | 'too_hard' | 'too_easy';
    };
  };

  /** Compliance patterns */
  complianceBehavior?: {
    workoutSkipping: {
      frequency: number; // % of planned workouts
      skippedTypes: string[];
      skippingPattern: string;
    };
    planModifications: {
      frequency: number; // % of workouts modified
      typicalChanges: string[];
      requestsEasierWorkouts: boolean;
    };
  };

  /** Observation metadata */
  observationStart: Date;
  observationEnd: Date;
  activitiesAnalyzed: number;
  confidenceScore: number; // 0-1
}
