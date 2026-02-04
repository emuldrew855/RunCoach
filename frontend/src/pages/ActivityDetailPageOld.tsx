import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { activitiesAPI } from '../services/api';
import { Activity } from '../types';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, Clock, TrendingUp, Heart, Activity as ActivityIcon, MessageCircle } from 'lucide-react';

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: activitiesData } = useQuery({
    queryKey: ['activities'],
    queryFn: async () => {
      const response = await activitiesAPI.getActivities({ limit: 100 });
      return response.data.activities as Activity[];
    },
  });

  const activity = activitiesData?.find(a => a.id === parseInt(id || '0'));

  if (!activity) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Activity not found</p>
        <button onClick={() => navigate('/dashboard')} className="btn btn-primary mt-4">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hours > 0 ? `${hours}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
  };

  const formatPace = (avgSpeed?: number) => {
    if (!avgSpeed) return 'N/A';
    const speed = Number(avgSpeed);
    const paceMinPerKm = 1000 / (speed * 60);
    const mins = Math.floor(paceMinPerKm);
    const secs = Math.round((paceMinPerKm - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')} /km`;
  };

  const getHeartRateZone = (avgHR?: number) => {
    if (!avgHR) return null;
    const hr = Number(avgHR);
    if (hr < 120) return { zone: 'Zone 1', color: 'text-blue-600', desc: 'Very Light' };
    if (hr < 140) return { zone: 'Zone 2', color: 'text-green-600', desc: 'Easy' };
    if (hr < 160) return { zone: 'Zone 3', color: 'text-yellow-600', desc: 'Moderate' };
    if (hr < 175) return { zone: 'Zone 4', color: 'text-orange-600', desc: 'Hard' };
    return { zone: 'Zone 5', color: 'text-red-600', desc: 'Maximum' };
  };

  const hrZone = getHeartRateZone(activity.average_heartrate ? Number(activity.average_heartrate) : undefined);

  const handleTalkToCoach = () => {
    // Store the activity context in sessionStorage so chat can use it
    sessionStorage.setItem('chatContext', JSON.stringify({
      activityId: activity.id,
      activityName: activity.name,
      distance: (activity.distance_meters! / 1000).toFixed(2),
      duration: formatDuration(activity.moving_time_seconds),
      pace: formatPace(activity.average_speed),
      heartRate: activity.average_heartrate,
      heartRateZone: hrZone,
      date: format(new Date(activity.start_date), 'MMMM dd, yyyy'),
    }));
    navigate('/chat');
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={20} />
        Back to Dashboard
      </button>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">{activity.name || 'Run'}</h1>
          <button
            onClick={handleTalkToCoach}
            className="btn btn-primary flex items-center gap-2"
          >
            <MessageCircle size={20} />
            Talk to Coach
          </button>
        </div>

        <div className="text-sm text-gray-600 mb-6">
          <div className="flex items-center gap-2">
            <Calendar size={16} />
            {format(new Date(activity.start_date), 'EEEE, MMMM dd, yyyy')} at{' '}
            {format(new Date(activity.start_date), 'h:mm a')}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-lg p-6">
            <p className="text-sm opacity-90 mb-1">Distance</p>
            <p className="text-3xl font-bold">
              {activity.distance_meters ? (activity.distance_meters / 1000).toFixed(2) : '0'} km
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-purple-500 text-white rounded-lg p-6">
            <p className="text-sm opacity-90 mb-1">Duration</p>
            <p className="text-3xl font-bold">{formatDuration(activity.moving_time_seconds)}</p>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-teal-500 text-white rounded-lg p-6">
            <p className="text-sm opacity-90 mb-1">Pace</p>
            <p className="text-3xl font-bold">{formatPace(activity.average_speed)}</p>
          </div>

          <div className="bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-lg p-6">
            <p className="text-sm opacity-90 mb-1">Elevation</p>
            <p className="text-3xl font-bold">
              {activity.total_elevation_gain_meters ? Number(activity.total_elevation_gain_meters).toFixed(0) : '0'} m
            </p>
          </div>
        </div>

        {/* Detailed Stats */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Clock size={20} />
              Time & Pace
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Moving Time:</span>
                <span className="font-semibold">{formatDuration(activity.moving_time_seconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Elapsed Time:</span>
                <span className="font-semibold">{formatDuration(activity.elapsed_time_seconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Average Pace:</span>
                <span className="font-semibold">{formatPace(activity.average_speed)}</span>
              </div>
              {activity.max_speed && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Best Pace:</span>
                  <span className="font-semibold">{formatPace(activity.max_speed)}</span>
                </div>
              )}
            </div>
          </div>

          {activity.average_heartrate && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Heart size={20} />
                Heart Rate
              </h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Average HR:</span>
                  <span className="font-semibold">{Number(activity.average_heartrate).toFixed(0)} bpm</span>
                </div>
                {activity.max_heartrate && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Max HR:</span>
                    <span className="font-semibold">{Number(activity.max_heartrate)} bpm</span>
                  </div>
                )}
                {hrZone && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Training Zone:</span>
                    <span className={`font-semibold ${hrZone.color}`}>
                      {hrZone.zone} - {hrZone.desc}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp size={20} />
              Performance
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Average Speed:</span>
                <span className="font-semibold">
                  {activity.average_speed ? (Number(activity.average_speed) * 3.6).toFixed(2) : 'N/A'} km/h
                </span>
              </div>
              {activity.average_cadence && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Average Cadence:</span>
                  <span className="font-semibold">{Number(activity.average_cadence).toFixed(0)} spm</span>
                </div>
              )}
              {activity.calories && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Calories:</span>
                  <span className="font-semibold">{Number(activity.calories).toFixed(0)} kcal</span>
                </div>
              )}
              {activity.suffer_score && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Suffer Score:</span>
                  <span className="font-semibold">{activity.suffer_score}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ActivityIcon size={20} />
              Activity Info
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Type:</span>
                <span className="font-semibold">{activity.sport_type || 'Run'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Distance:</span>
                <span className="font-semibold">
                  {activity.distance_meters ? (activity.distance_meters / 1000).toFixed(2) : '0'} km
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Elevation Gain:</span>
                <span className="font-semibold">
                  {activity.total_elevation_gain_meters ? Number(activity.total_elevation_gain_meters).toFixed(0) : '0'} m
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">Get Coaching Feedback</h2>
        <p className="text-gray-600 mb-4">
          Want personalized feedback on this run? Click "Talk to Coach" to discuss:
        </p>
        <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
          <li>How this run contributes to your sub-3 hour marathon goal</li>
          <li>Whether your heart rate was appropriate for the effort</li>
          <li>Pacing strategy and improvements</li>
          <li>Recovery recommendations</li>
          <li>What to focus on in your next run</li>
        </ul>
        <button
          onClick={handleTalkToCoach}
          className="btn btn-primary flex items-center gap-2"
        >
          <MessageCircle size={20} />
          Talk to Coach About This Run
        </button>
      </div>
    </div>
  );
}
