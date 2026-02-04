import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, momentLocalizer, Event, SlotInfo } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { useNavigate } from 'react-router-dom';
import { trainingPlanAPI, activitiesAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { usePreferences } from '../../context/PreferencesContext';
import { CarbLoadingModal } from './CarbLoadingModal';
import { useAuth } from '../../context/AuthContext';
import { ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';

const localizer = momentLocalizer(moment);
const DragAndDropCalendar = withDragAndDrop(Calendar);

interface WorkoutEvent extends Event {
  id: number;
  resourceId?: string;
  workout_type: string;
  completion_status?: string;
  target_distance_meters?: number;
  target_pace_min?: number;
  target_pace_max?: number;
  target_hr_zone?: number;
  description?: string;
  isActivity?: boolean;
  distance_meters?: number;
  moving_time_seconds?: number;
  average_speed?: number;
}

const workoutTypeColors: Record<string, string> = {
  easy: '#10b981', // green
  long_run: '#3b82f6', // blue
  tempo: '#fbbf24', // yellow
  intervals: '#ef4444', // red
  recovery: '#6366f1', // indigo
  race: '#8b5cf6', // purple
  rest: '#6b7280', // gray
};

const WORKOUT_TYPES = [
  { value: 'easy', label: 'Easy Run' },
  { value: 'long_run', label: 'Long Run' },
  { value: 'tempo', label: 'Tempo Run' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'race', label: 'Race' },
  { value: 'rest', label: 'Rest Day' },
];

export const WorkoutCalendar: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { preferences, convertDistance, distanceUnit, paceUnit } = usePreferences();
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [activePlan, setActivePlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isEditingWorkout, setIsEditingWorkout] = useState(false);
  const [showCarbModal, setShowCarbModal] = useState(false);
  const [selectedCarbDate, setSelectedCarbDate] = useState<Date | null>(null);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [editFormData, setEditFormData] = useState({
    workout_type: 'easy',
    name: '',
    description: '',
    target_distance_meters: '',
    target_hr_zone: '',
    target_pace_min: '',
    target_pace_max: '',
    target_pace_avg: '',
  });
  const [formData, setFormData] = useState({
    workout_type: 'easy',
    name: '',
    description: '',
    target_distance_meters: '',
    target_hr_zone: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Update moment locale to change week start day
    if (preferences.weekStartsOn === 'monday') {
      moment.updateLocale('en', {
        week: {
          dow: 1, // Monday is the first day of the week
          doy: 4, // First week of year must contain 4 January (7 + 1 - 4)
        },
      });
    } else {
      moment.updateLocale('en', {
        week: {
          dow: 0, // Sunday is the first day of the week
          doy: 6,
        },
      });
    }
  }, [preferences.weekStartsOn === 'monday']);

  const loadData = async () => {
    await Promise.all([loadWorkouts(), loadActivities(), loadActivePlan()]);
    setLoading(false);
  };

  const loadActivePlan = async () => {
    try {
      const response = await trainingPlanAPI.getActivePlan();
      setActivePlan(response.data.plan);
    } catch (error) {
      console.error('Failed to load active plan:', error);
    }
  };

  // Helper to get week start day based on preference
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const diff = preferences.weekStartsOn === 'monday' ? (day === 0 ? -6 : 1 - day) : -day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const loadWorkouts = async () => {
    try {
      const response = await trainingPlanAPI.getWorkouts({ days: 365 });
      setWorkouts(response.data.workouts || []);
    } catch (error) {
      console.error('Failed to load workouts:', error);
    }
  };

  const loadActivities = async () => {
    try {
      const response = await activitiesAPI.getActivities({ limit: 100 });
      setActivities(response.data.activities || []);
    } catch (error) {
      console.error('Failed to load activities:', error);
    }
  };

  const events: WorkoutEvent[] = useMemo(() => {
    const plannedEvents = workouts.map((workout) => {
      const distance = workout.target_distance_meters
        ? `${convertDistance(parseFloat(workout.target_distance_meters))}${distanceUnit}`
        : '';
      const name = workout.name || workout.workout_type.replace('_', ' ');

      return {
        id: workout.id,
        resourceId: `workout-${workout.id}`, // Unique identifier for calendar
        title: `📋 ${distance ? distance + ' ' : ''}${name}`,
        start: new Date(workout.scheduled_date),
        end: new Date(workout.scheduled_date),
        workout_type: workout.workout_type,
        completion_status: workout.completion_status,
        target_distance_meters: workout.target_distance_meters,
        target_pace_min: workout.target_pace_min,
        target_pace_max: workout.target_pace_max,
        target_hr_zone: workout.target_hr_zone,
        description: workout.description,
        isActivity: false,
      };
    });

    const activityEvents = activities.map((activity) => ({
      id: activity.id,
      resourceId: `activity-${activity.id}`, // Unique identifier for calendar
      title: `✓ ${convertDistance(parseFloat(activity.distance_meters))}${distanceUnit}`,
      start: new Date(activity.start_date),
      end: new Date(activity.start_date),
      workout_type: 'completed',
      distance_meters: parseFloat(activity.distance_meters),
      moving_time_seconds: parseInt(activity.moving_time_seconds),
      average_speed: parseFloat(activity.average_speed),
      description: activity.name,
      isActivity: true,
    }));

    console.log('📅 Calendar events:', {
      plannedCount: plannedEvents.length,
      activityCount: activityEvents.length,
      totalEvents: plannedEvents.length + activityEvents.length,
      sampleDay: activities.length > 0 ? new Date(activities[0].start_date).toISOString().split('T')[0] : 'none'
    });

    return [...plannedEvents, ...activityEvents];
  }, [workouts, activities, convertDistance, distanceUnit]);

  // Calculate weekly and monthly stats (completed and planned)
  const stats = useMemo(() => {
    const now = new Date();
    const startOfWeek = getWeekStart(now);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Filter valid activities only (parse distance as it comes as string)
    const validActivities = activities.filter((a) => {
      if (!a || !a.distance_meters) return false;
      const distance = parseFloat(a.distance_meters);
      return !isNaN(distance) && distance > 0;
    });

    const weeklyActivities = validActivities.filter(
      (a) => new Date(a.start_date) >= startOfWeek && new Date(a.start_date) < endOfWeek
    );
    const monthlyActivities = validActivities.filter(
      (a) => new Date(a.start_date) >= startOfMonth
    );

    const weeklyDistance = weeklyActivities.reduce(
      (sum, a) => sum + parseFloat(a.distance_meters),
      0
    ) / 1000;
    const monthlyDistance = monthlyActivities.reduce(
      (sum, a) => sum + parseFloat(a.distance_meters),
      0
    ) / 1000;

    // Calculate planned distance for this week
    const validWorkouts = workouts.filter((w) => {
      if (!w || !w.target_distance_meters) return false;
      const distance = parseFloat(w.target_distance_meters);
      return !isNaN(distance) && distance > 0;
    });

    const weeklyWorkouts = validWorkouts.filter(
      (w) => {
        const workoutDate = new Date(w.scheduled_date);
        return workoutDate >= startOfWeek && workoutDate < endOfWeek;
      }
    );

    const weeklyPlannedDistance = weeklyWorkouts.reduce(
      (sum, w) => sum + parseFloat(w.target_distance_meters),
      0
    ) / 1000;

    console.log('This week stats:', {
      startOfWeek: startOfWeek.toISOString(),
      endOfWeek: endOfWeek.toISOString(),
      weeklyWorkouts: weeklyWorkouts.length,
      workoutDistances: weeklyWorkouts.map(w => ({
        name: w.name,
        date: w.scheduled_date,
        distance_meters: w.target_distance_meters,
        distance_km: parseFloat(w.target_distance_meters) / 1000
      })),
      totalPlannedKm: weeklyPlannedDistance
    });

    return {
      weeklyDistance: weeklyDistance.toFixed(1),
      weeklyRuns: weeklyActivities.length,
      weeklyPlannedDistance: weeklyPlannedDistance.toFixed(1),
      weeklyPlannedWorkouts: weeklyWorkouts.length,
      monthlyDistance: monthlyDistance.toFixed(1),
      monthlyRuns: monthlyActivities.length,
    };
  }, [activities, workouts, preferences.weekStartsOn === 'monday']);

  // Identify carb-loading periods (days before key workouts)
  const carbLoadingDays = useMemo(() => {
    if (!activePlan?.enable_carb_loading) return new Set<string>();

    const loadingDays = new Set<string>();

    workouts.forEach((workout) => {
      const distance = workout.target_distance_meters ? parseFloat(workout.target_distance_meters) / 1000 : 0;
      const workoutDate = new Date(workout.scheduled_date);
      const workoutType = workout.workout_type;

      // Peak events: 30km+ or race ≥21km (half-marathon+) → 3-day carb load
      const isPeakEvent = distance >= 30 || (workoutType === 'race' && distance >= 21);
      // Standard events: 20-29km (but not races <21km) → 1-day prep
      const isStandardEvent = distance >= 20 && distance < 30 && !(workoutType === 'race' && distance < 21);

      if (isPeakEvent) {
        // 3 days before (Day -3, -2, -1)
        for (let i = 1; i <= 3; i++) {
          const prepDay = new Date(workoutDate);
          prepDay.setDate(prepDay.getDate() - i);
          loadingDays.add(prepDay.toISOString().split('T')[0]);
        }
      } else if (isStandardEvent) {
        // 1 day before (Day -1)
        const prepDay = new Date(workoutDate);
        prepDay.setDate(prepDay.getDate() - 1);
        loadingDays.add(prepDay.toISOString().split('T')[0]);
      }
    });

    return loadingDays;
  }, [workouts, activePlan]);

  // Calculate weekly totals for each week in the current view (completed km)
  const weeklyTotals = useMemo(() => {
    const validActivities = activities.filter((a) => {
      if (!a || !a.distance_meters) return false;
      const distance = parseFloat(a.distance_meters);
      return !isNaN(distance) && distance > 0;
    });

    // Group activities by week
    const weeks: Record<string, number> = {};

    validActivities.forEach((activity) => {
      const date = new Date(activity.start_date);
      const weekStart = getWeekStart(date);
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeks[weekKey]) {
        weeks[weekKey] = 0;
      }
      const distance = parseFloat(activity.distance_meters);
      weeks[weekKey] += distance / 1000;
    });

    console.log('✅ Weekly totals calculated:', weeks);
    return weeks;
  }, [activities, preferences.weekStartsOn === 'monday']);

  // Calculate planned km for each week
  const weeklyPlannedTotals = useMemo(() => {
    const validWorkouts = workouts.filter((w) => {
      if (!w || !w.target_distance_meters) return false;
      const distance = parseFloat(w.target_distance_meters);
      return !isNaN(distance) && distance > 0;
    });

    // Group workouts by week
    const weeks: Record<string, number> = {};

    validWorkouts.forEach((workout) => {
      const date = new Date(workout.scheduled_date);
      const weekStart = getWeekStart(date);
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeks[weekKey]) {
        weeks[weekKey] = 0;
      }
      const distance = parseFloat(workout.target_distance_meters);
      weeks[weekKey] += distance / 1000;
    });

    console.log('✅ Weekly planned totals calculated:', weeks);
    console.log('All workouts with distances:', validWorkouts.map(w => ({
      name: w.name,
      date: w.scheduled_date,
      distance_meters: w.target_distance_meters,
      distance_km: parseFloat(w.target_distance_meters) / 1000
    })));
    return weeks;
  }, [workouts, preferences.weekStartsOn === 'monday']);

  // Get weeks for the currently viewed month
  const monthWeeks = useMemo(() => {
    const weeks = [];
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    // Find the week start (Sunday or Monday) before or on the first day of the month
    let weekStart = getWeekStart(monthStart);

    // Calculate week numbers for peak/taper identification
    const planStartDate = activePlan?.start_date ? new Date(activePlan.start_date) : null;
    const taperStartDate = activePlan?.taper_start_date ? new Date(activePlan.taper_start_date) : null;
    const peakWeekNumbers: number[] = activePlan?.peak_week_numbers || [];

    // Iterate through all weeks in the month
    while (weekStart <= monthEnd) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const weekKey = weekStart.toISOString().split('T')[0];
      const completedDistance = weeklyTotals[weekKey] || 0;
      const plannedDistance = weeklyPlannedTotals[weekKey] || 0;

      const now = new Date();
      const currentWeekStart = getWeekStart(now);

      // Determine if this week is peak or taper, and calculate week number
      let isPeakWeek = false;
      let isTaperWeek = false;
      let trainingWeekNumber: number | null = null;

      if (activePlan && planStartDate) {
        const planEndDate = activePlan.end_date ? new Date(activePlan.end_date) : null;

        // Calculate week number consistently with backend
        // Use the middle day of the week to determine which plan week this calendar week belongs to
        const midWeekDate = new Date(weekStart);
        midWeekDate.setDate(weekStart.getDate() + 3); // Wednesday of the week

        // Calculate which 7-day period from plan start this falls into
        const daysSinceStart = Math.floor((midWeekDate.getTime() - planStartDate.getTime()) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.floor(daysSinceStart / 7) + 1;

        // Only show week number if this week is within the plan date range
        if (weekNumber > 0 && weekNumber <= (activePlan.total_weeks || 999)) {
          if (!planEndDate || midWeekDate <= planEndDate) {
            trainingWeekNumber = weekNumber;
          }
        }

        if (activePlan.identify_peaks) {
          // Check if peak week (supports multiple peak weeks)
          if (peakWeekNumbers.includes(weekNumber)) {
            isPeakWeek = true;
          }

          // Check if in taper period
          if (taperStartDate && weekStart >= taperStartDate) {
            isTaperWeek = true;
          }
        }
      }

      weeks.push({
        start: new Date(weekStart),
        end: new Date(weekEnd),
        completedDistance: convertDistance(completedDistance * 1000),
        plannedDistance: convertDistance(plannedDistance * 1000),
        isCurrent: weekStart.getTime() === currentWeekStart.getTime(),
        isPeakWeek,
        isTaperWeek,
        trainingWeekNumber,
      });

      // Move to next week
      weekStart.setDate(weekStart.getDate() + 7);
    }

    return weeks;
  }, [weeklyTotals, weeklyPlannedTotals, currentMonth, preferences.weekStartsOn === 'monday', convertDistance, activePlan]);

  const dayPropGetter = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const isCarbLoadingDay = carbLoadingDays.has(dateStr);

    // Check if this is the first day of a peak, taper, or current week
    let isFirstDayOfPeakWeek = false;
    let isFirstDayOfTaperWeek = false;
    let isFirstDayOfCurrentWeek = false;

    const weekStart = getWeekStart(date);
    const now = new Date();
    const currentWeekStart = getWeekStart(now);

    // Check if this is the current week
    if (date.getTime() === weekStart.getTime() && weekStart.getTime() === currentWeekStart.getTime()) {
      isFirstDayOfCurrentWeek = true;
    }

    if (activePlan?.identify_peaks && activePlan.start_date) {
      const planStartDate = new Date(activePlan.start_date);

      // Only add badge to the first day of the week
      if (date.getTime() === weekStart.getTime()) {
        // Use the same calculation as monthWeeks: midpoint of the week to determine week number
        const midWeekDate = new Date(weekStart);
        midWeekDate.setDate(weekStart.getDate() + 3); // Wednesday of the week

        // Calculate which 7-day period from plan start this falls into
        const daysSinceStart = Math.floor((midWeekDate.getTime() - planStartDate.getTime()) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.floor(daysSinceStart / 7) + 1;

        const peakWeekNumbers: number[] = activePlan.peak_week_numbers || [];
        if (peakWeekNumbers.includes(weekNumber)) {
          isFirstDayOfPeakWeek = true;
        }

        const taperStartDate = activePlan.taper_start_date ? new Date(activePlan.taper_start_date) : null;
        if (taperStartDate && weekStart >= taperStartDate) {
          isFirstDayOfTaperWeek = true;
        }
      }
    }

    const classes = [];
    if (isCarbLoadingDay) classes.push('carb-loading-day');
    if (isFirstDayOfPeakWeek) classes.push('peak-week-start');
    if (isFirstDayOfTaperWeek) classes.push('taper-week-start');
    if (isFirstDayOfCurrentWeek && !isFirstDayOfPeakWeek && !isFirstDayOfTaperWeek) classes.push('current-week-start');

    return {
      className: classes.join(' '),
    };
  };

  const eventStyleGetter = (event: WorkoutEvent) => {
    if (event.isActivity) {
      // Strava activities - solid green with bold border, prefix with icon
      return {
        style: {
          backgroundColor: '#10b981',
          border: '2px solid #059669',
          color: 'white',
          borderRadius: '3px',
          fontSize: '11px',
          padding: '3px 5px',
          fontWeight: '600',
        },
      };
    }

    // Planned workouts
    const backgroundColor = workoutTypeColors[event.workout_type] || '#6b7280';
    const isCompleted = event.completion_status === 'completed';
    const isSkipped = event.completion_status === 'skipped';

    return {
      style: {
        backgroundColor: isCompleted ? backgroundColor : isSkipped ? '#9ca3af' : backgroundColor,
        opacity: isCompleted ? 1 : isSkipped ? 0.5 : 0.7,
        color: 'white',
        border: '1.5px dashed rgba(255,255,255,0.5)',
        borderRadius: '3px',
        fontSize: '11px',
        padding: '3px 5px',
      },
    };
  };

  const handleSelectEvent = (event: WorkoutEvent) => {
    setIsEditingWorkout(false);
    if (event.isActivity) {
      const activity = activities.find((a) => a.id === event.id);
      setSelectedWorkout({ ...activity, isActivity: true });
      setShowCreateModal(false);
    } else {
      const workout = workouts.find((w) => w.id === event.id);
      setSelectedWorkout({ ...workout, isActivity: false });
      setShowCreateModal(false);
    }
  };

  const handleSelectSlot = (slotInfo: SlotInfo) => {
    const clickedDate = slotInfo.start;
    const dateStr = clickedDate.toISOString().split('T')[0];

    // Check if this is a carb-loading day
    if (carbLoadingDays.has(dateStr) && activePlan?.enable_carb_loading) {
      // Find the workout this is preparing for
      const carbLoadWorkout = workouts.find(w => {
        const workoutDate = new Date(w.scheduled_date);
        const distance = w.target_distance_meters ? parseFloat(w.target_distance_meters) / 1000 : 0;
        const isKeyEvent = distance >= 20 || (w.workout_type === 'race' && distance >= 21);

        if (isKeyEvent) {
          // Check if clicked date is 1-3 days before this workout
          const diffDays = Math.floor((workoutDate.getTime() - clickedDate.getTime()) / (24 * 60 * 60 * 1000));
          return diffDays >= 1 && diffDays <= 3;
        }
        return false;
      });

      if (carbLoadWorkout) {
        setSelectedCarbDate(clickedDate);
        setShowCarbModal(true);
        return;
      }
    }

    // Normal behavior: create workout
    setSelectedDate(clickedDate);
    setSelectedWorkout(null);
    setShowCreateModal(true);
    setFormData({
      workout_type: 'easy',
      name: '',
      description: '',
      target_distance_meters: '',
      target_hr_zone: '',
    });
  };

  const handleCreateWorkout = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      console.log('🔄 Creating workout...');
      const response = await trainingPlanAPI.getActivePlan();
      const activePlan = response.data.plan;

      console.log('📋 Active plan:', activePlan);

      if (!activePlan) {
        toast.error('Please upload a training plan first');
        return;
      }

      const workoutData = {
        training_plan_id: activePlan.id,
        scheduled_date: selectedDate?.toISOString(),
        workout_type: formData.workout_type,
        name: formData.name || undefined,
        description: formData.description || undefined,
        target_distance_meters: formData.target_distance_meters
          ? parseFloat(formData.target_distance_meters) * 1000
          : undefined,
        target_hr_zone: formData.target_hr_zone
          ? parseInt(formData.target_hr_zone)
          : undefined,
      };

      console.log('📝 Workout data:', workoutData);

      const createResponse = await trainingPlanAPI.createWorkout(workoutData);
      console.log('✅ Workout created:', createResponse.data);

      toast.success('Workout created successfully');
      setShowCreateModal(false);

      console.log('🔄 Reloading data...');
      await loadData();
      console.log('✅ Data reloaded');
    } catch (error: any) {
      console.error('❌ Error creating workout:', error);
      console.error('Error response:', error.response?.data);
      toast.error(error.response?.data?.error || 'Failed to create workout');
    }
  };

  const handleDeleteWorkout = async () => {
    if (!selectedWorkout || selectedWorkout.isActivity) {
      toast.error('Cannot delete Strava activities');
      return;
    }

    if (!confirm('Are you sure you want to delete this workout?')) return;

    try {
      await trainingPlanAPI.deleteWorkout(selectedWorkout.id);
      toast.success('Workout deleted');
      setSelectedWorkout(null);
      loadData();
    } catch (error) {
      toast.error('Failed to delete workout');
    }
  };

  const handleEventDrop = async ({ event, start }: any) => {
    // Don't allow dragging completed activities
    if (event.isActivity) {
      toast.error('Cannot move completed activities from Strava');
      return;
    }

    // Prevent dragging if the workout is completed
    if (event.completion_status === 'completed') {
      toast.error('Cannot move completed workouts');
      return;
    }

    try {
      // Update the workout's scheduled date
      await trainingPlanAPI.updateWorkout(event.id, {
        scheduled_date: start.toISOString(),
      });

      toast.success('Workout rescheduled');
      loadData();
    } catch (error) {
      toast.error('Failed to reschedule workout');
      console.error('Error rescheduling workout:', error);
    }
  };

  const handleEditWorkout = () => {
    setIsEditingWorkout(true);
    setEditFormData({
      workout_type: selectedWorkout.workout_type || 'easy',
      name: selectedWorkout.name || '',
      description: selectedWorkout.description || '',
      target_distance_meters: selectedWorkout.target_distance_meters
        ? (selectedWorkout.target_distance_meters / 1000).toString()
        : '',
      target_hr_zone: selectedWorkout.target_hr_zone?.toString() || '',
      target_pace_min: selectedWorkout.target_pace_min?.toString() || '',
      target_pace_max: selectedWorkout.target_pace_max?.toString() || '',
      target_pace_avg: selectedWorkout.target_pace_avg?.toString() || '',
    });
  };

  const handleUpdateWorkout = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await trainingPlanAPI.updateWorkout(selectedWorkout.id, {
        workout_type: editFormData.workout_type,
        name: editFormData.name || undefined,
        description: editFormData.description || undefined,
        target_distance_meters: editFormData.target_distance_meters
          ? parseFloat(editFormData.target_distance_meters) * 1000
          : undefined,
        target_hr_zone: editFormData.target_hr_zone
          ? parseInt(editFormData.target_hr_zone)
          : undefined,
        target_pace_min: editFormData.target_pace_min
          ? parseFloat(editFormData.target_pace_min)
          : undefined,
        target_pace_max: editFormData.target_pace_max
          ? parseFloat(editFormData.target_pace_max)
          : undefined,
        target_pace_avg: editFormData.target_pace_avg
          ? parseFloat(editFormData.target_pace_avg)
          : undefined,
      });

      toast.success('Workout updated successfully');
      setIsEditingWorkout(false);
      setSelectedWorkout(null);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update workout');
    }
  };

  const handleWeeklyAnalysis = () => {
    const now = new Date();
    const startOfWeek = getWeekStart(now);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    // Store context for chat page to pick up
    sessionStorage.setItem('chatContext', JSON.stringify({
      type: 'weekly_analysis',
      weekStart: startOfWeek.toISOString(),
      weekEnd: endOfWeek.toISOString(),
    }));
    // Navigate to chat
    navigate('/chat');
  };

  const formatPace = (pace: number) => {
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Custom event component for better display
  const EventComponent = ({ event }: { event: WorkoutEvent }) => {
    return (
      <div className="flex items-center gap-1" style={{ width: '100%', overflow: 'hidden' }}>
        <span style={{ fontSize: '11px', fontWeight: 600 }}>{event.title}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* This Week Stats */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">
            This Week
          </h3>
          {activePlan && (() => {
            const now = new Date();
            const planStartDate = new Date(activePlan.start_date);
            const weekNumber = Math.floor((now.getTime() - planStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
            const planEndDate = new Date(activePlan.end_date);

            if (weekNumber > 0 && now <= planEndDate) {
              return (
                <span className="text-xs font-bold px-2 py-1 rounded bg-blue-600 text-white">
                  Week {weekNumber} of {activePlan.total_weeks}
                </span>
              );
            }
            return null;
          })()}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {/* Completed */}
          <div>
            <p className="text-xs text-green-600 dark:text-green-400 mb-1">Completed</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {convertDistance(parseFloat(stats.weeklyDistance) * 1000)}
              </p>
              <span className="text-sm text-slate-600 dark:text-slate-400">{distanceUnit}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              {stats.weeklyRuns} {stats.weeklyRuns === 1 ? 'run' : 'runs'}
            </p>
          </div>

          {/* Planned */}
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Planned</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-slate-700 dark:text-slate-300">
                {convertDistance(parseFloat(stats.weeklyPlannedDistance) * 1000)}
              </p>
              <span className="text-sm text-slate-600 dark:text-slate-400">{distanceUnit}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              {stats.weeklyPlannedWorkouts} {stats.weeklyPlannedWorkouts === 1 ? 'workout' : 'workouts'}
            </p>
          </div>
        </div>

        {/* Weekly Analysis Button */}
        <button
          onClick={handleWeeklyAnalysis}
          className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          Analyze Training Week
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-8">
        <div style={{ height: '820px', position: 'relative', overflow: 'hidden' }}>
          <DragAndDropCalendar
            key={preferences.weekStartsOn === 'monday' ? 'monday' : 'sunday'}
            localizer={localizer}
            events={events}
            startAccessor={'start' as any}
            endAccessor={'end' as any}
            style={{ height: '100%' }}
            eventPropGetter={eventStyleGetter as any}
            dayPropGetter={dayPropGetter as any}
            onSelectEvent={handleSelectEvent as any}
            onSelectSlot={handleSelectSlot}
            onEventDrop={handleEventDrop}
            onNavigate={(date) => setCurrentMonth(date)}
            selectable
            draggableAccessor={(event: any) => {
              const e = event as WorkoutEvent;
              return !e.isActivity && e.completion_status !== 'completed';
            }}
            resizable={false}
            defaultView="month"
            defaultDate={new Date()}
            popup={true}
            popupOffset={{ x: 0, y: 10 }}
            showMultiDayTimes={false}
            step={60}
            views={['month']}
            formats={{
              eventTimeRangeFormat: () => '',
            }}
            components={{
              event: EventComponent as any,
            }}
          />
        </div>
      </div>

      {/* Weekly Breakdown */}
      <div className="card">
        <h3 className="text-heading-xs mb-4 text-neutral-900 dark:text-neutral-100">
          Weekly Totals - {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h3>
        <div className={`grid gap-4 ${monthWeeks.length <= 4 ? 'grid-cols-4' : monthWeeks.length === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
          {monthWeeks.map((week, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg relative ${
                week.isPeakWeek
                  ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500'
                  : week.isTaperWeek
                  ? 'bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-500'
                  : week.isCurrent
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                  : 'bg-neutral-50 dark:bg-neutral-700/50'
              }`}
            >
              {week.isPeakWeek && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full whitespace-nowrap">
                  🏔️ PEAK
                </div>
              )}
              {week.isTaperWeek && !week.isPeakWeek && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 px-2 py-0.5 bg-purple-500 text-white text-xs font-bold rounded-full whitespace-nowrap">
                  📉 TAPER
                </div>
              )}
              {week.isCurrent && !week.isPeakWeek && !week.isTaperWeek && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full whitespace-nowrap">
                  📍 THIS WEEK
                </div>
              )}

              {/* Training Week Number */}
              {week.trainingWeekNumber && (
                <div className={`text-center mb-2 ${week.isPeakWeek || week.isTaperWeek ? 'mt-3' : 'mt-1'}`}>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${
                    week.isCurrent
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-200'
                  }`}>
                    Week {week.trainingWeekNumber}
                  </span>
                </div>
              )}

              <p className={`text-xs text-secondary mb-2 text-center ${!week.trainingWeekNumber && 'mt-2'}`}>
                {week.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                {week.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>

              {/* Completed KM */}
              <div className="mb-2">
                <p className="text-xs text-green-600 dark:text-green-400 mb-0.5 font-medium">Completed</p>
                <p className={`text-xl font-bold ${week.isCurrent ? 'text-green-600 dark:text-green-400' : 'text-green-700 dark:text-green-300'}`}>
                  {week.completedDistance} <span className="text-xs font-normal">{distanceUnit}</span>
                </p>
              </div>

              {/* Planned Distance */}
              <div>
                <p className="text-xs text-secondary mb-0.5 font-medium">Planned</p>
                <p className={`text-lg font-semibold ${week.isCurrent ? 'text-neutral-600 dark:text-neutral-300' : 'text-secondary'}`}>
                  {week.plannedDistance} <span className="text-xs font-normal">{distanceUnit}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-subtle">
        <button
          onClick={() => setLegendExpanded(!legendExpanded)}
          className="w-full flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors rounded px-3 py-2 -mx-3 -my-2"
        >
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Calendar Legend</h3>
          {legendExpanded ? (
            <ChevronUp size={16} className="text-neutral-500 dark:text-neutral-400" />
          ) : (
            <ChevronDown size={16} className="text-neutral-500 dark:text-neutral-400" />
          )}
        </button>

        {legendExpanded && (
          <div className="mt-4 space-y-4">
            {/* Workout Types */}
            <div>
              <p className="text-xs font-medium text-secondary uppercase mb-2">Workout Types</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(workoutTypeColors).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded border border-dashed border-white/40 flex-shrink-0"
                      style={{ backgroundColor: color, opacity: 0.6 }}
                    />
                    <span className="text-xs text-secondary capitalize">
                      {type.replace('_', ' ')}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded flex-shrink-0"
                    style={{ backgroundColor: '#10b981', border: '2px solid #059669' }}
                  />
                  <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Completed
                  </span>
                </div>
              </div>
            </div>

            {/* Training Phases - Only if applicable */}
            {activePlan?.identify_peaks && (
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
                <p className="text-xs font-medium text-secondary uppercase mb-2">Training Phases</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full whitespace-nowrap">
                      🏔️ PEAK
                    </div>
                    <span className="text-xs text-secondary">
                      {activePlan.peak_weeks_count || 1} highest volume {(activePlan.peak_weeks_count || 1) === 1 ? 'week' : 'weeks'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 bg-purple-500 text-white text-xs font-bold rounded-full whitespace-nowrap">
                      📉 TAPER
                    </div>
                    <span className="text-xs text-secondary">
                      Final {activePlan.taper_weeks} weeks before race
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Nutrition - Only if applicable */}
            {activePlan?.enable_carb_loading && (
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
                <p className="text-xs font-medium text-secondary uppercase mb-2">Nutrition</p>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-yellow-300 dark:bg-yellow-600 flex items-center justify-center text-xs border-2 border-yellow-500 dark:border-yellow-700 flex-shrink-0">
                    🍝
                  </div>
                  <span className="text-xs text-secondary">
                    Carb-Loading (before 20km+ runs or half-marathon+ races)
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Workout Modal */}
      {showCreateModal && selectedDate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-md w-full">
            {/* Header */}
            <div className="px-6 py-5 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-heading-sm text-neutral-900 dark:text-neutral-100">
                    Add Workout
                  </h3>
                  <p className="text-body-sm text-secondary mt-1">
                    {selectedDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <form onSubmit={handleCreateWorkout}>
              <div className="px-6 py-5 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Workout Type *
                  </label>
                  <select
                    value={formData.workout_type}
                    onChange={(e) => setFormData({ ...formData, workout_type: e.target.value })}
                    className="input"
                    required
                  >
                    {WORKOUT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Morning Easy Run"
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="e.g., Keep it comfortable"
                    rows={2}
                    className="input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Distance ({distanceUnit})
                    </label>
                    <input
                      type="number"
                      value={formData.target_distance_meters}
                      onChange={(e) => setFormData({ ...formData, target_distance_meters: e.target.value })}
                      step="0.1"
                      min="0"
                      placeholder="e.g., 10"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      HR Zone
                    </label>
                    <select
                      value={formData.target_hr_zone}
                      onChange={(e) => setFormData({ ...formData, target_hr_zone: e.target.value })}
                      className="input"
                    >
                      <option value="">None</option>
                      <option value="1">Zone 1</option>
                      <option value="2">Zone 2</option>
                      <option value="3">Zone 3</option>
                      <option value="4">Zone 4</option>
                      <option value="5">Zone 5</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-b-lg flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Add Workout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity Details Modal */}
      {selectedWorkout && selectedWorkout.isActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                      {selectedWorkout.name || 'Run'}
                    </h3>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs font-medium rounded">
                      Strava
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {new Date(selectedWorkout.start_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                    {' at '}
                    {new Date(selectedWorkout.start_date).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedWorkout(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Main Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Distance</p>
                  <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                    {convertDistance(parseFloat(selectedWorkout.distance_meters), 2)}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">{distanceUnit}</p>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-green-600 dark:text-green-400 mb-1">Duration</p>
                  <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                    {Math.floor(parseInt(selectedWorkout.moving_time_seconds) / 60)}
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300">minutes</p>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-purple-600 dark:text-purple-400 mb-1">Pace</p>
                  <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                    {selectedWorkout.average_speed ? formatPace(1000 / (parseFloat(selectedWorkout.average_speed) * 60)) : 'N/A'}
                  </p>
                  <p className="text-xs text-purple-700 dark:text-purple-300">{paceUnit}</p>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-red-600 dark:text-red-400 mb-1">Avg HR</p>
                  <p className="text-2xl font-bold text-red-900 dark:text-red-100">
                    {selectedWorkout.average_heartrate ? Math.round(parseFloat(selectedWorkout.average_heartrate)) : 'N/A'}
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300">bpm</p>
                </div>
              </div>

              {/* Additional Details */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Additional Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  {selectedWorkout.max_heartrate && (
                    <div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">Max HR:</span>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {Math.round(parseFloat(selectedWorkout.max_heartrate))} bpm
                      </p>
                    </div>
                  )}

                  {selectedWorkout.max_speed && (
                    <div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">Max Speed:</span>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {formatPace(1000 / (parseFloat(selectedWorkout.max_speed) * 60))} /{paceUnit.replace('min/', '')}
                      </p>
                    </div>
                  )}

                  {selectedWorkout.total_elevation_gain_meters && (
                    <div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">Elevation Gain:</span>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {parseFloat(selectedWorkout.total_elevation_gain_meters).toFixed(0)} m
                      </p>
                    </div>
                  )}

                  {selectedWorkout.average_cadence && (
                    <div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">Avg Cadence:</span>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {parseFloat(selectedWorkout.average_cadence).toFixed(0)} spm
                      </p>
                    </div>
                  )}

                  {selectedWorkout.calories && (
                    <div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">Calories:</span>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {selectedWorkout.calories} kcal
                      </p>
                    </div>
                  )}

                  {selectedWorkout.suffer_score && (
                    <div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">Suffer Score:</span>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {selectedWorkout.suffer_score}
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">Elapsed Time:</span>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {Math.floor(parseInt(selectedWorkout.elapsed_time_seconds) / 60)} min
                    </p>
                  </div>

                  {selectedWorkout.timezone && (
                    <div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">Timezone:</span>
                      <p className="font-medium text-slate-900 dark:text-white text-xs">
                        {selectedWorkout.timezone}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Links */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 flex gap-3">
                <button
                  onClick={() => {
                    setSelectedWorkout(null);
                    navigate(`/activity/${selectedWorkout.id}`);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                  <MessageCircle size={18} />
                  <span>View Full Details & Talk to Coach</span>
                </button>
                {selectedWorkout.strava_activity_id && (
                  <a
                    href={`https://www.strava.com/activities/${selectedWorkout.strava_activity_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                  >
                    <span>Strava</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Planned Workout Details Modal */}
      {selectedWorkout && !selectedWorkout.isActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                      {selectedWorkout.name || selectedWorkout.workout_type}
                    </h3>
                    <span
                      className="px-2 py-1 text-xs font-medium rounded capitalize"
                      style={{
                        backgroundColor: workoutTypeColors[selectedWorkout.workout_type] || '#6b7280',
                        color: 'white',
                      }}
                    >
                      {selectedWorkout.workout_type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {new Date(selectedWorkout.scheduled_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedWorkout(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl"
                >
                  ✕
                </button>
              </div>
            </div>

            {isEditingWorkout ? (
              /* Edit Form */
              <form onSubmit={handleUpdateWorkout} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Workout Type *
                  </label>
                  <select
                    value={editFormData.workout_type}
                    onChange={(e) => setEditFormData({ ...editFormData, workout_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    required
                  >
                    {WORKOUT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    placeholder="e.g., Morning Easy Run"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    placeholder="e.g., Keep it comfortable, focus on form"
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Distance ({distanceUnit})
                    </label>
                    <input
                      type="number"
                      value={editFormData.target_distance_meters}
                      onChange={(e) => setEditFormData({ ...editFormData, target_distance_meters: e.target.value })}
                      step="0.1"
                      min="0"
                      placeholder="e.g., 10"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      HR Zone
                    </label>
                    <select
                      value={editFormData.target_hr_zone}
                      onChange={(e) => setEditFormData({ ...editFormData, target_hr_zone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="">None</option>
                      <option value="1">Zone 1 - Recovery</option>
                      <option value="2">Zone 2 - Easy</option>
                      <option value="3">Zone 3 - Moderate</option>
                      <option value="4">Zone 4 - Hard</option>
                      <option value="5">Zone 5 - Maximum</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Min Pace ({paceUnit})
                    </label>
                    <input
                      type="number"
                      value={editFormData.target_pace_min}
                      onChange={(e) => setEditFormData({ ...editFormData, target_pace_min: e.target.value })}
                      step="0.01"
                      min="0"
                      placeholder="e.g., 4.5"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Fastest</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Avg Pace ({paceUnit})
                    </label>
                    <input
                      type="number"
                      value={editFormData.target_pace_avg}
                      onChange={(e) => setEditFormData({ ...editFormData, target_pace_avg: e.target.value })}
                      step="0.01"
                      min="0"
                      placeholder="e.g., 4.75"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Target</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Max Pace ({paceUnit})
                    </label>
                    <input
                      type="number"
                      value={editFormData.target_pace_max}
                      onChange={(e) => setEditFormData({ ...editFormData, target_pace_max: e.target.value })}
                      step="0.01"
                      min="0"
                      placeholder="e.g., 5.0"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Slowest</p>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditingWorkout(false)}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              /* View Mode */
              <div className="p-6 space-y-6">
                {/* Description */}
                {selectedWorkout.description && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                      Description
                    </h4>
                    <p className="text-slate-700 dark:text-slate-300">
                      {selectedWorkout.description}
                    </p>
                  </div>
                )}

                {/* Main Workout Details */}
                <div className="grid grid-cols-2 gap-4">
                  {selectedWorkout.target_distance_meters && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Target Distance</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {convertDistance(selectedWorkout.target_distance_meters)}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{distanceUnit}</p>
                    </div>
                  )}

                  {selectedWorkout.target_duration_seconds && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Target Duration</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {Math.floor(selectedWorkout.target_duration_seconds / 60)}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">minutes</p>
                    </div>
                  )}

                  {(selectedWorkout.target_pace_min || selectedWorkout.target_pace_max || selectedWorkout.target_pace_avg) && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Target Pace</p>
                      <div className="space-y-2">
                        {selectedWorkout.target_pace_min && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Min (Fastest):</span>
                            <span className="text-base font-bold text-green-700 dark:text-green-300">
                              {formatPace(selectedWorkout.target_pace_min)}
                            </span>
                          </div>
                        )}
                        {selectedWorkout.target_pace_avg && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Average (Target):</span>
                            <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                              {formatPace(selectedWorkout.target_pace_avg)}
                            </span>
                          </div>
                        )}
                        {selectedWorkout.target_pace_max && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">Max (Slowest):</span>
                            <span className="text-base font-bold text-orange-700 dark:text-orange-300">
                              {formatPace(selectedWorkout.target_pace_max)}
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 text-right">{paceUnit}</p>
                    </div>
                  )}

                  {selectedWorkout.target_hr_zone && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Target HR Zone</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        Zone {selectedWorkout.target_hr_zone}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {selectedWorkout.target_hr_zone === 1 && 'Recovery'}
                        {selectedWorkout.target_hr_zone === 2 && 'Easy'}
                        {selectedWorkout.target_hr_zone === 3 && 'Moderate'}
                        {selectedWorkout.target_hr_zone === 4 && 'Hard'}
                        {selectedWorkout.target_hr_zone === 5 && 'Maximum'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Workout Status
                  </h4>
                  <span
                    className={`inline-block px-4 py-2 rounded-lg text-sm font-medium ${
                      selectedWorkout.completion_status === 'completed'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                        : selectedWorkout.completion_status === 'skipped'
                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                    }`}
                  >
                    {selectedWorkout.completion_status === 'completed'
                      ? '✓ Completed'
                      : selectedWorkout.completion_status === 'skipped'
                      ? '✕ Skipped'
                      : '○ Pending'}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 flex justify-end gap-3">
                  <button
                    onClick={() => setSelectedWorkout(null)}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleEditWorkout}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Edit Workout
                  </button>
                  <button
                    onClick={handleDeleteWorkout}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Carb-Loading Modal */}
      {showCarbModal && selectedCarbDate && (() => {
        // Find the workout this carb-loading day is preparing for
        const carbLoadWorkout = workouts.find(w => {
          const workoutDate = new Date(w.scheduled_date);
          const distance = w.target_distance_meters ? parseFloat(w.target_distance_meters) / 1000 : 0;
          const isKeyEvent = distance >= 20 || (w.workout_type === 'race' && distance >= 21);

          if (isKeyEvent) {
            const diffDays = Math.floor((workoutDate.getTime() - selectedCarbDate.getTime()) / (24 * 60 * 60 * 1000));
            return diffDays >= 1 && diffDays <= 3;
          }
          return false;
        });

        if (!carbLoadWorkout) return null;

        const workoutDate = new Date(carbLoadWorkout.scheduled_date);
        const daysBeforeEvent = Math.floor((workoutDate.getTime() - selectedCarbDate.getTime()) / (24 * 60 * 60 * 1000));
        const distance = carbLoadWorkout.target_distance_meters ? parseFloat(carbLoadWorkout.target_distance_meters) / 1000 : 0;
        const userWeight = user?.profile?.weight_kg || 70;

        return (
          <CarbLoadingModal
            date={selectedCarbDate}
            userWeight={userWeight}
            daysBeforeEvent={daysBeforeEvent}
            eventDistance={distance}
            onClose={() => {
              setShowCarbModal(false);
              setSelectedCarbDate(null);
            }}
          />
        );
      })()}
    </div>
  );
};
