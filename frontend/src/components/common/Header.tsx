import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Activity, MessageCircle, User, LogOut, Moon, Sun, Calendar } from 'lucide-react';
import NotificationBell from '../NotificationBell';

export default function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm transition-colors">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="text-2xl font-bold text-strava">
            RunCoach
          </Link>

          <nav className="flex items-center gap-6">
            <Link
              to="/dashboard"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                isActive('/dashboard')
                  ? 'bg-strava text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Activity size={20} />
              <span>Dashboard</span>
            </Link>

            <Link
              to="/training"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                isActive('/training')
                  ? 'bg-strava text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Calendar size={20} />
              <span>Training</span>
            </Link>

            <Link
              to="/chat"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                isActive('/chat')
                  ? 'bg-strava text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <MessageCircle size={20} />
              <span>Coach</span>
            </Link>

            <Link
              to="/profile"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                isActive('/profile')
                  ? 'bg-strava text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <User size={20} />
              <span>Profile</span>
            </Link>

            <button
              onClick={toggleTheme}
              className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            <NotificationBell />

            <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200 dark:border-gray-600">
              {user?.profile_picture_url && (
                <img
                  src={user.profile_picture_url}
                  alt={user.first_name}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {user?.first_name || 'User'}
              </span>
              <button
                onClick={logout}
                className="text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
