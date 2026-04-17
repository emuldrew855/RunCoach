/**
 * Admin Layout
 *
 * Layout wrapper for admin pages with navigation sidebar.
 * Mobile-responsive with hamburger menu toggle.
 */

import { ReactNode, useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Activity,
  AlertTriangle,
  FileText,
  ArrowLeft,
  Shield,
  Zap,
  MessageSquare,
  Brain,
  Menu,
  X
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  // Close sidebar when switching from mobile to desktop
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 -ml-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={sidebarOpen}
              >
                {sidebarOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            )}
            <Shield className="w-6 h-6 text-red-600 dark:text-red-400" />
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">
              Admin Dashboard
            </h1>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-secondary flex items-center gap-2 text-sm md:text-base"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to App</span>
            <span className="sm:hidden">Back</span>
          </button>
        </div>
      </div>

      <div className="flex relative">
        {/* Mobile overlay backdrop */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            ${isMobile
              ? `fixed top-0 left-0 h-full z-30 transform transition-transform duration-300 ease-in-out ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`
              : 'relative'
            }
            w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen
          `}
        >
          {/* Mobile sidebar header */}
          {isMobile && (
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="font-semibold text-gray-900 dark:text-gray-100">Menu</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
          <nav className="p-4 space-y-2">
            <NavItem to="/admin" icon={<LayoutDashboard className="w-5 h-5" />} end>
              Overview
            </NavItem>
            <NavItem to="/admin/users" icon={<Users className="w-5 h-5" />}>
              Users
            </NavItem>
            <NavItem to="/admin/token-usage" icon={<Zap className="w-5 h-5" />}>
              Token Usage
            </NavItem>
            <NavItem to="/admin/agent-analytics" icon={<Brain className="w-5 h-5" />}>
              Agent Analytics
            </NavItem>
            <NavItem to="/admin/feedback" icon={<MessageSquare className="w-5 h-5" />}>
              Feedback
            </NavItem>
            <NavItem to="/admin/telemetry" icon={<Activity className="w-5 h-5" />}>
              API Telemetry
            </NavItem>
            <NavItem to="/admin/errors" icon={<AlertTriangle className="w-5 h-5" />}>
              Errors
            </NavItem>
            <NavItem to="/admin/audit" icon={<FileText className="w-5 h-5" />}>
              Audit Logs
            </NavItem>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

interface NavItemProps {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  end?: boolean;
}

function NavItem({ to, icon, children, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
          isActive
            ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`
      }
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}
