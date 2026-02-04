/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors
        strava: '#FC4C02',
        'brand-orange': '#FC4C02',
        'brand-orange-dark': '#E04300',
        // Neutral scale for consistent dark mode
        neutral: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Workout type colors
        workout: {
          easy: '#10b981',
          'long-run': '#3b82f6',
          tempo: '#f59e0b',
          intervals: '#ef4444',
          recovery: '#8b5cf6',
          race: '#ec4899',
          rest: '#6b7280',
          strength: '#06b6d4',
        },
      },
      fontSize: {
        // Heading scale
        'heading-xs': ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
        'heading-sm': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
        'heading-md': ['1.5rem', { lineHeight: '1.3', fontWeight: '700' }],
        'heading-lg': ['2rem', { lineHeight: '1.2', fontWeight: '700' }],
        // Stat scale
        'stat': ['2rem', { lineHeight: '1', fontWeight: '700' }],
        'stat-lg': ['2.5rem', { lineHeight: '1', fontWeight: '700' }],
        // Body scale
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        'body': ['1rem', { lineHeight: '1.5' }],
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'sm': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'md': '0 6px 12px -2px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'lg': '0 10px 20px -4px rgb(0 0 0 / 0.1), 0 6px 10px -6px rgb(0 0 0 / 0.1)',
        'xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
}
