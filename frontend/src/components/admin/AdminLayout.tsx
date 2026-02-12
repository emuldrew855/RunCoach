/**
 * Admin Layout
 *
 * Layout wrapper for admin pages with navigation sidebar.
 */

import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Activity,
  AlertTriangle,
  FileText,
  ArrowLeft,
  Shield,
  Zap
} from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-red-600 dark:text-red-400" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Admin Dashboard
            </h1>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen">
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
        <main className="flex-1 p-6">
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
