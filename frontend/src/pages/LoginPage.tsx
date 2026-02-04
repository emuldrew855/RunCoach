import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = () => {
    authAPI.initiateStravaLogin();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center transition-colors">
      <div className="card max-w-md w-full text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">RunCoach</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Your AI-powered running coach powered by Strava data
        </p>

        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="w-full btn btn-primary flex items-center justify-center gap-2 py-3"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            Connect with Strava
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
          Train smarter with personalized AI coaching based on your running data
        </p>
      </div>
    </div>
  );
}
