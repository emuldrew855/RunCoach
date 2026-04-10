import React from 'react';

interface FloatingActionButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label?: string;
  position?: 'bottom-right' | 'bottom-center' | 'bottom-left';
  color?: 'primary' | 'secondary' | 'success' | 'danger';
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onClick,
  icon,
  label,
  position = 'bottom-right',
  color = 'primary',
}) => {
  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2',
    'bottom-left': 'bottom-6 left-6',
  };

  const colorClasses = {
    primary: 'bg-gradient-to-r from-strava to-orange-600 hover:from-orange-600 hover:to-red-600',
    secondary: 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700',
    success: 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700',
    danger: 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700',
  };

  return (
    <button
      onClick={onClick}
      className={`fixed ${positionClasses[position]} ${colorClasses[color]} text-white shadow-2xl hover:shadow-xl transition-all duration-300 z-40 ${
        label ? 'px-5 py-3 rounded-full' : 'w-14 h-14 rounded-full'
      } flex items-center justify-center gap-2 active:scale-95`}
      aria-label={label || 'Action button'}
    >
      {icon}
      {label && <span className="font-medium text-sm">{label}</span>}
    </button>
  );
};
