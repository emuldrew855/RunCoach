import React, { useState } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Clock } from 'lucide-react';
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
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
}

export const MobileAgendaView: React.FC<MobileAgendaViewProps> = ({
  workouts,
  activities,
  onWorkoutClick,
  onActivityClick,
  onAddWorkout,
  currentMonth,
  onMonthChange,
}) => {
  const { preferences, convertDistance, distanceUnit, convertPace, paceUnit } = usePreferences();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: preferences.weekStartsOn === 'monday' ? 1 : 0 })
  );

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
                    <button
                      key={workout.id}
                      onClick={() => onWorkoutClick(workout)}
                      className={`w-full p-4 rounded-xl border-2 transition-all active:scale-98 ${getWorkoutTypeColor(workout.workout_type)}`}
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
                        <div className="flex-1 text-left">
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
    </div>
  );
};
