/**
 * NotificationBell Component
 *
 * Displays notification bell icon with badge count.
 * Dropdown shows unread notifications with links to conversations.
 */

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsAPI } from '../services/api';
import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Notification {
  id: number;
  type: string;
  title: string;
  message?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch unread count
  const { data: countData } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => {
      try {
        const response = await notificationsAPI.getUnreadCount();
        return response.data;
      } catch (error) {
        console.error('Failed to fetch notification count:', error);
        return { count: 0 };
      }
    },
    refetchInterval: 60000, // Refetch every 60 seconds (reduced from 30)
    retry: false, // Don't retry on failure
  });

  // Fetch unread notifications (only when dropdown is open)
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => {
      const response = await notificationsAPI.getUnread();
      return response.data;
    },
    enabled: isOpen, // Only fetch when dropdown is open
  });

  const unreadCount = countData?.count || 0;
  const notifications = notificationsData?.notifications || [];

  // Mark notification as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: number) => notificationsAPI.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsAPI.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.is_read) {
      await markAsReadMutation.mutateAsync(notification.id);
    }

    // Navigate if link exists
    if (notification.link) {
      navigate(notification.link);
    }

    setIsOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsReadMutation.mutateAsync();
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors rounded"
        aria-label="Notifications"
      >
        <Bell size={18} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold font-mono text-white bg-signal-alert rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="fixed sm:absolute top-16 sm:top-auto left-2 right-2 sm:left-auto sm:right-0 sm:mt-2 w-auto sm:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:shadow-gray-900/50 border border-gray-200 dark:border-gray-700 z-50 max-h-[calc(100dvh-5rem)] sm:max-h-[32rem] flex flex-col">
          {/* Header */}
          <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs sm:text-sm text-strava hover:text-strava-dark font-medium flex items-center gap-1"
              >
                <Check size={14} />
                <span className="hidden sm:inline">Mark all read</span>
                <span className="sm:hidden">Clear</span>
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-6 sm:p-8 text-center text-gray-500 dark:text-gray-400">
                <Bell size={40} className="sm:w-12 sm:h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm sm:text-base">No new notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {notifications.map((notification: Notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className="w-full p-3 sm:p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors active:bg-gray-100 dark:active:bg-gray-700"
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      {/* Unread Indicator */}
                      {!notification.is_read && (
                        <div className="w-2 h-2 bg-strava rounded-full mt-1.5 sm:mt-2 flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <p className={`text-xs sm:text-sm ${
                          !notification.is_read
                            ? 'font-semibold text-gray-900 dark:text-gray-100'
                            : 'font-medium text-gray-700 dark:text-gray-300'
                        }`}>
                          {notification.title}
                        </p>

                        {/* Message */}
                        {notification.message && (
                          <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                        )}

                        {/* Time */}
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {formatTimeAgo(notification.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2.5 sm:p-3 border-t border-gray-200 dark:border-gray-700 text-center">
              <button
                onClick={() => {
                  navigate('/notifications');
                  setIsOpen(false);
                }}
                className="text-xs sm:text-sm text-strava hover:text-strava-dark font-medium"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
