import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Activity, MessageCircle, User, LogOut, Moon, Sun, Calendar, Menu, X } from 'lucide-react';
import NotificationBell from '../NotificationBell';
import { useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

export default function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-neutral-200/50 dark:border-neutral-700/50 transition-colors sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="text-xl font-bold text-brand-orange tracking-tight">
              RunCoach
            </Link>

            {/* Desktop Navigation */}
            {!isMobile && (
              <nav className="flex items-center gap-8">
                <Link
                  to="/dashboard"
                  className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
                    isActive('/dashboard')
                      ? 'bg-brand-orange/10 text-brand-orange'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  <Activity size={18} strokeWidth={1.5} />
                  <span className="text-sm font-medium">Dashboard</span>
                </Link>

                <Link
                  to="/training"
                  className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
                    isActive('/training')
                      ? 'bg-brand-orange/10 text-brand-orange'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  <Calendar size={18} strokeWidth={1.5} />
                  <span className="text-sm font-medium">Training</span>
                </Link>

                <Link
                  to="/chat"
                  className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
                    isActive('/chat')
                      ? 'bg-brand-orange/10 text-brand-orange'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  <MessageCircle size={18} strokeWidth={1.5} />
                  <span className="text-sm font-medium">Coach</span>
                </Link>

                <Link
                  to="/profile"
                  className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
                    isActive('/profile')
                      ? 'bg-brand-orange/10 text-brand-orange'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  <User size={18} strokeWidth={1.5} />
                  <span className="text-sm font-medium">Profile</span>
                </Link>

                <button
                  onClick={toggleTheme}
                  className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-3 py-2 rounded transition-colors"
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                  {theme === 'light' ? <Moon size={18} strokeWidth={1.5} /> : <Sun size={18} strokeWidth={1.5} />}
                </button>

                <NotificationBell />

                <div className="flex items-center gap-3 ml-6 pl-6 border-l border-neutral-200/50 dark:border-neutral-600/50">
                  {user?.profile_picture_url && (
                    <img
                      src={user.profile_picture_url}
                      alt={user.first_name}
                      className="w-7 h-7 rounded-full"
                    />
                  )}
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    {user?.first_name || 'User'}
                  </span>
                  <button
                    onClick={logout}
                    className="text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Logout"
                  >
                    <LogOut size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </nav>
            )}

            {/* Mobile Menu Button */}
            {isMobile && (
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleTheme}
                  className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors"
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                  {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
                <NotificationBell />
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors"
                >
                  {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobile && mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={closeMobileMenu}
          />
          <div className="fixed top-[72px] right-0 bottom-0 w-64 bg-white dark:bg-gray-800 shadow-xl z-50 overflow-y-auto">
            <nav className="flex flex-col p-4 space-y-2">
              <Link
                to="/dashboard"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive('/dashboard')
                    ? 'bg-strava text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Activity size={20} />
                <span className="font-medium">Dashboard</span>
              </Link>

              <Link
                to="/training"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive('/training')
                    ? 'bg-strava text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Calendar size={20} />
                <span className="font-medium">Training</span>
              </Link>

              <Link
                to="/chat"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive('/chat')
                    ? 'bg-strava text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <MessageCircle size={20} />
                <span className="font-medium">Coach</span>
              </Link>

              <Link
                to="/profile"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive('/profile')
                    ? 'bg-strava text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <User size={20} />
                <span className="font-medium">Profile</span>
              </Link>

              <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-3 px-4 py-2">
                  {user?.profile_picture_url && (
                    <img
                      src={user.profile_picture_url}
                      alt={user.first_name}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {user?.first_name || 'User'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    logout();
                    closeMobileMenu();
                  }}
                  className="flex items-center gap-3 px-4 py-3 mt-2 w-full text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <LogOut size={20} />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
