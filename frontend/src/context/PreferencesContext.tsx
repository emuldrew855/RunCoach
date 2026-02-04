import React, { createContext, useContext, useState, useEffect } from 'react';
import { profileAPI } from '../services/api';

interface Preferences {
  units: 'metric' | 'imperial';
  weekStartsOn: 'sunday' | 'monday';
}

interface PreferencesContextType {
  preferences: Preferences;
  updatePreferences: (prefs: Partial<Preferences>) => Promise<void>;
  convertDistance: (meters: number, decimals?: number) => string;
  distanceUnit: string;
  convertPace: (minPerKm: number) => string;
  paceUnit: string;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>({
    units: 'metric',
    weekStartsOn: 'sunday',
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const response = await profileAPI.getProfile();
      const profile = response.data.profile;
      if (profile) {
        setPreferences({
          units: profile.preferred_units || 'metric',
          weekStartsOn: profile.week_starts_on || 'sunday',
        });
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  };

  const updatePreferences = async (prefs: Partial<Preferences>) => {
    try {
      const updateData: any = {};
      if (prefs.units !== undefined) {
        updateData.preferred_units = prefs.units;
      }
      if (prefs.weekStartsOn !== undefined) {
        updateData.week_starts_on = prefs.weekStartsOn;
      }

      await profileAPI.updateProfile(updateData);
      setPreferences((prev) => ({ ...prev, ...prefs }));
    } catch (error) {
      console.error('Failed to update preferences:', error);
      throw error;
    }
  };

  const convertDistance = (meters: number, decimals: number = 1): string => {
    if (preferences.units === 'imperial') {
      const miles = meters / 1609.34;
      return miles.toFixed(decimals);
    }
    return (meters / 1000).toFixed(decimals);
  };

  const distanceUnit = preferences.units === 'imperial' ? 'mi' : 'km';

  const convertPace = (minPerKm: number): string => {
    if (preferences.units === 'imperial') {
      const minPerMile = minPerKm * 1.60934;
      const minutes = Math.floor(minPerMile);
      const seconds = Math.round((minPerMile - minutes) * 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    const minutes = Math.floor(minPerKm);
    const seconds = Math.round((minPerKm - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const paceUnit = preferences.units === 'imperial' ? 'min/mi' : 'min/km';

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        updatePreferences,
        convertDistance,
        distanceUnit,
        convertPace,
        paceUnit,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
