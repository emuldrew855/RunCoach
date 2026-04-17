import React, { useState, useRef } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks, isToday, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Clock, Move, X, GripVertical } from 'lucide-react';
import { usePreferences } from '../../context/PreferencesContext';

interface Workout {
  id: number;
  scheduled_date: string;
  name?: string;
  workout_type: string;
  target_distance_meters?: string;
  target_hr_zone?: number;
  completion_status: 'pending' | 'completed' | 'skipped';
  description?: string;
  target_pace_avg?: string;
}

interface Activity {
  id: number;
  start_date: string;
  name: string;
  distance_meters: number;
  moving_time_seconds: number;
  average_speed: number;
  average_heartrate?: number;
}

interface MobileAgendaViewProps {
  workouts: Workout[];
  activities: Activity[];
  onWorkoutClick: (workout: Workout) => void;
  onActivityClick: (activity: Activity) => void;
  onAddWorkout: (date: Date) => void;
  onMoveWorkout?: (workoutId: number, newDate: Date) => void;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
}

export const MobileAgendaView: React.FC<MobileAgendaViewProps> = ({
  workouts,
  activities,
  onWorkoutClick,
  onActivityClick,
  onAddWorkout,
  onMoveWorkout,
  currentMonth,
  onMonthChange,
}) => {
  const { preferences, convertDistance, distanceUnit, convertPace, paceUnit } = usePreferences();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: preferences.weekStartsOn === 'monday' ? 1 : 0 })
  );

  // Move mode state
  const [movingWorkout, setMovingWorkout] = useState<Workout | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerWeek, setDatePickerWeek] = useState<Date>(new Date());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);

  const weekStart = startOfWeek(currentWeekStart, {
    weekStartsOn: preferences.weekStartsOn === 'monday' ? 1 : 0,
  });
  const weekEnd = endOfWeek(currentWeekStart, {
    weekStartsOn: preferences.weekStartsOn === 'monday' ? 1 : 0,
  });

  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const goToPreviousWeek = () => {
    const newWeek = subWeeks(currentWeekStart, 1);
    setCurrentWeekStart(newWeek);
    onMonthChange(newWeek);
  };

  const goToNextWeek = () => {
    const newWeek = addWeeks(currentWeekStart, 1);
    setCurrentWeekStart(newWeek);
    onMonthChange(newWeek);
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentWeekStart(today);
    onMonthChange(today);
  };

  // Long press handlers for initiating move
  const handleTouchStart = (workout: Workout) => {
    if (workout.completion_status === 'completed') return; // Can't move completed workouts

    longPressTimer.current = setTimeout(() => {
      setIsLongPressing(true);
      setMovingWorkout(workout);
      setDatePickerWeek(new Date(workout.scheduled_date));
      setShowDatePicker(true);
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500); // 500ms long press
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsLongPressing(false);
  };

  const handleTouchMove = () => {
    // Cancel long press if finger moves
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsLongPressing(false);
  };

  const handleMoveToDate = (newDate: Date) => {
    if (movingWorkout && onMoveWorkout) {
      onMoveWorkout(movingWorkout.id, newDate);
    }
    setMovingWorkout(null);
    setShowDatePicker(false);
  };

  const cancelMove = () => {
    setMovingWorkout(null);
    setShowDatePicker(false);
  };

  // Date picker navigation
  const datePickerWeekStart = startOfWeek(datePickerWeek, {
    weekStartsOn: preferences.weekStartsOn === 'monday' ? 1 : 0,
  });
  const datePickerWeekEnd = endOfWeek(datePickerWeek, {
    weekStartsOn: preferences.weekStartsOn === 'monday' ? 1 : 0,
  });
  const datePickerDays = eachDayOfInterval({ start: datePickerWeekStart, end: datePickerWeekEnd });

  const goToPreviousPickerWeek = () => setDatePickerWeek(subWeeks(datePickerWeek, 1));
  const goToNextPickerWeek = () => setDatePickerWeek(addWeeks(datePickerWeek, 1));

  // Calculate weekly stats
  const weekWorkouts = workouts.filter(w => {
    const workoutDate = new Date(w.scheduled_date);
    return workoutDate >= weekStart && workoutDate <= weekEnd;
  });

  const weekActivities = activities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= weekStart && activityDate <= weekEnd;
  });

  const totalPlannedDistance = weekWorkouts.reduce((sum, w) =>
    sum + (w.target_distance_meters ? parseFloat(w.target_distance_meters) : 0), 0
  ) / 1000;

  const totalCompletedDistance = weekActivities.reduce((sum, a) => {
    const distance = a.distance_meters ? parseFloat(String(a.distance_meters)) : 0;
    return sum + (isNaN(distance) ? 0 : distance);
  }, 0) / 1000;

  const getWorkoutsForDay = (day: Date) => {
    return workouts.filter(w => isSameDay(new Date(w.scheduled_date), day));
  };

  const getActivitiesForDay = (day: Date) => {
    return activities.filter(a => isSameDay(new Date(a.start_date), day));
  };

  const getWorkoutTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      easy: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700',
      'long-run': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
      tempo: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700',
      intervals: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700',
      recovery: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700',
      race: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-700',
      rest: 'bg-gray-100 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600',
      strength: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700',
    };
    return colors[type.toLowerCase()] || colors.easy;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Sticky Header - Week Navigation */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        {/* Week Selector */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={goToPreviousWeek}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <ChevronLeft size={24} className="text-gray-700 dark:text-gray-300" />
          </button>

          <div className="text-center">
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </div>
            <button
              onClick={goToToday}
              className="text-xs text-strava hover:underline mt-1"
            >
              Today
            </button>
          </div>

          <button
            onClick={goToNextWeek}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <ChevronRight size={24} className="text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {/* Weekly Totals */}
        <div className="grid grid-cols-2 gap-4 px-4 pb-3">
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Completed</div>
            <div className="text-xl font-bold text-green-600 dark:text-green-400">
              {isNaN(totalCompletedDistance) ? '0' : convertDistance(totalCompletedDistance * 1000)} {distanceUnit}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {weekActivities.length} {weekActivities.length === 1 ? 'run' : 'runs'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Planned</div>
            <div className="text-xl font-bold text-gray-700 dark:text-gray-300">
              {isNaN(totalPlannedDistance) ? '0' : convertDistance(totalPlannedDistance * 1000)} {distanceUnit}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {weekWorkouts.length} {weekWorkouts.length === 1 ? 'workout' : 'workouts'}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Days List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {daysInWeek.map((day) => {
          const dayWorkouts = getWorkoutsForDay(day);
          const dayActivities = getActivitiesForDay(day);
          const hasContent = dayWorkouts.length > 0 || dayActivities.length > 0;
          const isDayToday = isToday(day);

          return (
            <div key={day.toString()} className="mb-4">
              {/* Day Header */}
              <div className={`flex items-center justify-between mb-2 pb-2 border-b ${isDayToday ? 'border-strava' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center gap-2">
                  <div className={`text-lg font-bold ${isDayToday ? 'text-strava' : 'text-gray-900 dark:text-gray-100'}`}>
                    {format(day, 'EEEE')}
                  </div>
                  <div className={`text-sm ${isDayToday ? 'text-strava font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                    {format(day, 'MMM d')}
                  </div>
                  {isDayToday && (
                    <span className="px-2 py-0.5 text-xs bg-strava text-white rounded-full">
                      Today
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onAddWorkout(day)}
                  className="text-xs text-strava hover:underline"
                >
                  + Add
                </button>
              </div>

              {/* Day Content */}
              {!hasContent ? (
                <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
                  Rest day
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Planned Workouts */}
                  {dayWorkouts.map((workout) => (
                    <div
                      key={workout.id}
                      className={`relative rounded-xl border-2 transition-all ${getWorkoutTypeColor(workout.workout_type)} ${
                        movingWorkout?.id === workout.id ? 'ring-2 ring-strava ring-offset-2' : ''
                      }`}
                    >
                      <div className="flex items-stretch">
                        {/* Move handle - only for pending workouts */}
                        {workout.completion_status === 'pending' && onMoveWorkout && (
                          <button
                            onTouchStart={() => handleTouchStart(workout)}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchMove}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMovingWorkout(workout);
                              setDatePickerWeek(new Date(workout.scheduled_date));
                              setShowDatePicker(true);
                            }}
                            className="flex items-center justify-center px-2 border-r border-current/20 opacity-60 hover:opacity-100 active:bg-black/5 dark:active:bg-white/5"
                            aria-label="Move workout"
                          >
                            <GripVertical size={18} className="text-current" />
                          </button>
                        )}

                        {/* Main workout content */}
                        <button
                          onClick={() => {
                            if (!isLongPressing) {
                              onWorkoutClick(workout);
                            }
                          }}
                          onTouchStart={() => handleTouchStart(workout)}
                          onTouchEnd={handleTouchEnd}
                          onTouchMove={handleTouchMove}
                          className="flex-1 p-4 text-left active:scale-98"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {workout.completion_status === 'completed' ? (
                                <CheckCircle2 size={20} className="text-current" />
                              ) : workout.completion_status === 'skipped' ? (
                                <Circle size={20} className="text-current opacity-50" />
                              ) : (
                                <Clock size={20} className="text-current" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-sm">
                                {workout.name || workout.workout_type}
                              </div>
                              {workout.target_distance_meters && (
                                <div className="text-xs mt-1 opacity-90">
                                  {(() => {
                                    const distance = parseFloat(workout.target_distance_meters);
                                    return isNaN(distance) ? '0' : convertDistance(distance * 1000);
                                  })()} {distanceUnit}
                                  {workout.target_hr_zone && ` • Zone ${workout.target_hr_zone}`}
                                </div>
                              )}
                              {workout.target_pace_avg && (
                                <div className="text-xs mt-1 opacity-75">
                                  Target: {convertPace(parseFloat(workout.target_pace_avg))} /{paceUnit.replace('min/', '')}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>

                      {/* Long press hint for pending workouts */}
                      {workout.completion_status === 'pending' && onMoveWorkout && (
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 translate-y-full opacity-0 group-hover:opacity-100 pointer-events-none">
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">
                            Hold to move
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Completed Activities */}
                  {dayActivities.map((activity) => (
                    <button
                      key={activity.id}
                      onClick={() => onActivityClick(activity)}
                      className="w-full p-4 rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 transition-all active:scale-98"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          <CheckCircle2 size={20} className="text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-semibold text-sm text-green-900 dark:text-green-100">
                            {activity.name}
                          </div>
                          <div className="text-xs text-green-700 dark:text-green-300 mt-1">
                            {activity.distance_meters ? convertDistance(activity.distance_meters) : '0'} {distanceUnit}
                            {activity.average_speed && ` • ${convertPace(1000 / (activity.average_speed * 60))} /${paceUnit.replace('min/', '')}`}
                            {activity.average_heartrate && ` • ${Math.round(activity.average_heartrate)} bpm`}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Date Picker Modal for Moving Workouts */}
      {showDatePicker && movingWorkout && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-t-2xl shadow-xl animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Move Workout
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {movingWorkout.name || movingWorkout.workout_type}
                </p>
              </div>
              <button
                onClick={cancelMove}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Week Navigation */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <button
                onClick={goToPreviousPickerWeek}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <ChevronLeft size={24} className="text-gray-700 dark:text-gray-300" />
              </button>
              <div className="text-center">
                <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {format(datePickerWeekStart, 'MMM d')} - {format(datePickerWeekEnd, 'MMM d, yyyy')}
                </div>
              </div>
              <button
                onClick={goToNextPickerWeek}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <ChevronRight size={24} className="text-gray-700 dark:text-gray-300" />
              </button>
            </div>

            {/* Day Grid */}
            <div className="p-4">
              <div className="grid grid-cols-7 gap-2 mb-2">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => {
                  const adjustedIndex = preferences.weekStartsOn === 'monday'
                    ? (i + 1) % 7
                    : i;
                  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
                  return (
                    <div key={i} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1">
                      {dayLabels[adjustedIndex]}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {datePickerDays.map((day) => {
                  const isCurrentDate = isSameDay(day, new Date(movingWorkout.scheduled_date));
                  const isDayToday = isToday(day);
                  const hasWorkouts = workouts.some(w =>
                    isSameDay(new Date(w.scheduled_date), day) && w.id !== movingWorkout.id
                  );

                  return (
                    <button
                      key={day.toString()}
                      onClick={() => handleMoveToDate(day)}
                      disabled={isCurrentDate}
                      className={`
                        aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium
                        transition-all active:scale-95
                        ${isCurrentDate
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                          : isDayToday
                            ? 'bg-strava text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-strava/20 active:bg-strava/30'
                        }
                      `}
                    >
                      <span className="text-base">{format(day, 'd')}</span>
                      {hasWorkouts && !isCurrentDate && (
                        <span className="w-1 h-1 rounded-full bg-current opacity-50 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-4 pt-0 grid grid-cols-3 gap-2">
              <button
                onClick={() => handleMoveToDate(subDays(new Date(movingWorkout.scheduled_date), 1))}
                className="py-3 px-4 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                ← Day Earlier
              </button>
              <button
                onClick={() => handleMoveToDate(new Date())}
                className="py-3 px-4 bg-strava/10 rounded-xl text-sm font-medium text-strava hover:bg-strava/20 transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => handleMoveToDate(addDays(new Date(movingWorkout.scheduled_date), 1))}
                className="py-3 px-4 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Day Later →
              </button>
            </div>

            {/* Cancel button */}
            <div className="p-4 pt-0 pb-8">
              <button
                onClick={cancelMove}
                className="w-full py-3 text-center text-gray-500 dark:text-gray-400 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
