/**
 * useInsightMetrics Hook
 *
 * Fetches and calculates real metrics for InsightCards
 * - Recent activities for trend calculation
 * - Weekly volume trends
 * - Pace trends
 * - HR trends
 */

import { useQuery } from '@tanstack/react-query';
import { activitiesAPI } from '../services/api';
import { usePreferences } from '../context/PreferencesContext';

interface InsightMetric {
  type: 'pace' | 'volume' | 'hr' | 'zone2';
  title: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  sparklineData: number[];
  color: string;
}

export function useInsightMetrics() {
  const { convertDistance, convertPace, units } = usePreferences();

  // Fetch recent activities (last 60 days for 8-9 weeks of data)
  const { data: activitiesData } = useQuery({
    queryKey: ['activities', { limit: 100 }],
    queryFn: () => activitiesAPI.getActivities({ limit: 100 }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch weekly volume for the last 5 weeks
  const { data: weeklyVolumeData } = useQuery({
    queryKey: ['weeklyVolume', { weeks: 5 }],
    queryFn: () => activitiesAPI.getWeeklyVolume({ weeks: 5 }),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch HR zones for the last 30 days
  const { data: hrZonesData } = useQuery({
    queryKey: ['hrZones', 30],
    queryFn: () => activitiesAPI.getHRZones(30),
    staleTime: 5 * 60 * 1000,
  });

  const activities = activitiesData?.data?.data || [];

  // Calculate weekly pace trends (last 5 weeks)
  const calculatePaceTrends = (): { data: number[]; latest: number; trend: 'up' | 'down' | 'stable' } | null => {
    if (activities.length === 0) return null;

    const now = new Date();
    const weeklyPaces: number[] = [];

    for (let i = 0; i < 5; i++) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i + 1) * 7);
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - i * 7);

      const weekActivities = activities.filter((act: any) => {
        const actDate = new Date(act.start_date);
        return actDate >= weekStart && actDate < weekEnd && act.type === 'Run';
      });

      if (weekActivities.length > 0) {
        // Calculate average pace (seconds per meter)
        const totalTime = weekActivities.reduce((sum: number, act: any) => sum + act.moving_time, 0);
        const totalDistance = weekActivities.reduce((sum: number, act: any) => sum + act.distance, 0);
        const avgPaceSecsPerMeter = totalTime / totalDistance;
        const avgPaceMinPerKm = (avgPaceSecsPerMeter * 1000) / 60;
        weeklyPaces.unshift(avgPaceMinPerKm);
      }
    }

    if (weeklyPaces.length < 2) return null;

    const latest = weeklyPaces[weeklyPaces.length - 1];
    const previous = weeklyPaces[weeklyPaces.length - 2];
    const diff = Math.abs(latest - previous);

    // For pace, lower is better (faster)
    let trend: 'up' | 'down' | 'stable';
    if (diff < 0.1) {
      trend = 'stable';
    } else if (latest < previous) {
      trend = 'down'; // Pace decreased = speed increased = good
    } else {
      trend = 'up'; // Pace increased = speed decreased
    }

    return { data: weeklyPaces, latest, trend };
  };

  // Calculate weekly volume trends (last 5 weeks)
  const calculateVolumeTrends = (): { data: number[]; latest: number; trend: 'up' | 'down' | 'stable' } | null => {
    const weeklyData = weeklyVolumeData?.data?.data?.weeklyData || [];
    if (weeklyData.length === 0) return null;

    // Get last 5 weeks, sorted by date
    const last5Weeks = weeklyData.slice(-5);
    const volumes = last5Weeks.map((week: any) => week.completed / 1000); // Convert to km

    if (volumes.length < 2) return null;

    const latest = volumes[volumes.length - 1];
    const previous = volumes[volumes.length - 2];
    const diff = Math.abs(latest - previous);

    let trend: 'up' | 'down' | 'stable';
    if (diff < 2) {
      trend = 'stable';
    } else if (latest > previous) {
      trend = 'up';
    } else {
      trend = 'down';
    }

    return { data: volumes, latest, trend };
  };

  // Calculate HR trends (last 5 weeks)
  const calculateHRTrends = (): { data: number[]; latest: number; trend: 'up' | 'down' | 'stable' } | null => {
    if (activities.length === 0) return null;

    const now = new Date();
    const weeklyHRs: number[] = [];

    for (let i = 0; i < 5; i++) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i + 1) * 7);
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - i * 7);

      const weekActivities = activities.filter((act: any) => {
        const actDate = new Date(act.start_date);
        return actDate >= weekStart && actDate < weekEnd && act.type === 'Run' && act.average_heartrate;
      });

      if (weekActivities.length > 0) {
        const avgHR = weekActivities.reduce((sum: number, act: any) => sum + act.average_heartrate, 0) / weekActivities.length;
        weeklyHRs.unshift(Math.round(avgHR));
      }
    }

    if (weeklyHRs.length < 2) return null;

    const latest = weeklyHRs[weeklyHRs.length - 1];
    const previous = weeklyHRs[weeklyHRs.length - 2];
    const diff = Math.abs(latest - previous);

    let trend: 'up' | 'down' | 'stable';
    if (diff < 3) {
      trend = 'stable';
    } else if (latest > previous) {
      trend = 'up';
    } else {
      trend = 'down';
    }

    return { data: weeklyHRs, latest, trend };
  };

  // Calculate Zone 2 percentage
  const calculateZone2Percentage = (): { value: number; trend: 'up' | 'down' | 'stable'; data: number[] } | null => {
    const zones = hrZonesData?.data?.data?.zones || [];
    if (zones.length === 0) return null;

    const zone2 = zones.find((z: any) => z.zone === 2);
    if (!zone2) return null;

    const percentage = Math.round(zone2.percentage);

    // For Zone 2 tracking, we'd need historical data which we don't have
    // So we'll just show current percentage with stable trend and flat sparkline
    return {
      value: percentage,
      trend: 'stable',
      data: Array(5).fill(percentage)
    };
  };

  // Build metrics array based on what data is available
  const buildMetrics = (messageContent: string): InsightMetric[] => {
    const metrics: InsightMetric[] = [];
    const content = messageContent.toLowerCase();

    // Pace metric
    if (content.includes('pace') || content.includes('min/km') || content.includes('min/mi')) {
      const paceData = calculatePaceTrends();
      if (paceData) {
        const { data, latest, trend } = paceData;
        const displayPace = units === 'imperial' ? convertPace(latest) : latest;
        const paceUnit = units === 'imperial' ? '/mi' : '/km';

        metrics.push({
          type: 'pace',
          title: 'AVG PACE TREND',
          value: `${displayPace.toFixed(2).replace('.', ':')}${paceUnit}`,
          trend,
          sparklineData: data,
          color: '#06b6d4'
        });
      }
    }

    // Volume metric
    if (content.includes('weekly') || content.includes('volume') || content.includes('mileage') || content.includes('distance')) {
      const volumeData = calculateVolumeTrends();
      if (volumeData) {
        const { data, latest, trend } = volumeData;
        const displayDistance = convertDistance(latest);
        const distanceUnit = units === 'imperial' ? 'mi' : 'km';

        metrics.push({
          type: 'volume',
          title: 'WEEKLY VOLUME',
          value: `${displayDistance.toFixed(1)} ${distanceUnit}`,
          trend,
          sparklineData: data.map(d => convertDistance(d)),
          color: '#0891b2'
        });
      }
    }

    // HR metric
    if (content.includes('heart rate') || content.includes('hr') || content.includes('cardiovascular')) {
      const hrData = calculateHRTrends();
      if (hrData) {
        const { data, latest, trend } = hrData;

        metrics.push({
          type: 'hr',
          title: 'AVG HR TREND',
          value: `${latest} bpm`,
          trend,
          sparklineData: data,
          color: '#dc2626'
        });
      }
    }

    // Zone 2 metric
    if (content.includes('zone 2') || content.includes('easy') || content.includes('aerobic base')) {
      const zone2Data = calculateZone2Percentage();
      if (zone2Data) {
        const { value, trend, data } = zone2Data;

        metrics.push({
          type: 'zone2',
          title: 'ZONE 2 TIME',
          value: `${value}%`,
          trend,
          sparklineData: data,
          color: '#059669'
        });
      }
    }

    return metrics;
  };

  return {
    buildMetrics,
    hasData: activities.length > 0,
  };
}
