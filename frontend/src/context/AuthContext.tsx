import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { authAPI, profileAPI } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  showOnboarding: boolean;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Only check auth once on mount
    let mounted = true;

    const initAuth = async () => {
      const token = localStorage.getItem('jwt');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await authAPI.getCurrentUser();
        if (mounted) {
          setUser(response.data.user);
          // Show onboarding if user hasn't completed it
          if (response.data.user && !response.data.user.onboarding_completed) {
            setShowOnboarding(true);
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        if (mounted) {
          localStorage.removeItem('jwt');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('jwt');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data.user);
      // Show onboarding if user hasn't completed it
      if (response.data.user && !response.data.user.onboarding_completed) {
        setShowOnboarding(true);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('jwt');
    } finally {
      setLoading(false);
    }
  };

  const login = (token: string) => {
    localStorage.setItem('jwt', token);
    checkAuth();
  };

  const logout = () => {
    localStorage.removeItem('jwt');
    setUser(null);
    window.location.href = '/';
  };

  const completeOnboarding = async () => {
    try {
      await profileAPI.completeOnboarding(true);
      setShowOnboarding(false);
      // Update user object to reflect onboarding completion
      if (user) {
        setUser({ ...user, onboarding_completed: true });
      }
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
        showOnboarding,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
