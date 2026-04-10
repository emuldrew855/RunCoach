/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Roboto Mono', 'Consolas', 'monospace'],
      },
      colors: {
        // Brand colors - desaturated for premium feel
        strava: '#FC4C02',
        'brand-orange': '#FC4C02',
        'brand-orange-dark': '#E04300',
        'brand-orange-muted': '#FB923C', // Less saturated for backgrounds
        // Neutral scale for consistent dark mode
        neutral: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        // Signal colors (for data status)
        signal: {
          success: '#10b981',
          caution: '#f59e0b',
          alert: '#ef4444',
          info: '#3b82f6',
        },
        // Workout type colors - more muted
        workout: {
          easy: '#059669',    // Deeper green
          'long-run': '#2563eb', // Deeper blue
          tempo: '#d97706',   // Deeper amber
          intervals: '#dc2626', // Deeper red
          recovery: '#7c3aed', // Deeper purple
          race: '#db2777',    // Deeper pink
          rest: '#52525b',    // Deeper gray
          strength: '#0891b2', // Deeper cyan
        },
      },
      fontSize: {
        // Heading scale - reduced variety
        'heading-sm': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        'heading-md': ['1.5rem', { lineHeight: '1.2', fontWeight: '600' }],
        'heading-lg': ['2rem', { lineHeight: '1.1', fontWeight: '600' }],
        // Data display scale - monospaced
        'data-sm': ['0.875rem', { lineHeight: '1.2', fontWeight: '600', fontFamily: 'JetBrains Mono, Roboto Mono, monospace' }],
        'data': ['1rem', { lineHeight: '1.2', fontWeight: '700', fontFamily: 'JetBrains Mono, Roboto Mono, monospace' }],
        'data-lg': ['1.5rem', { lineHeight: '1.1', fontWeight: '700', fontFamily: 'JetBrains Mono, Roboto Mono, monospace' }],
        'data-xl': ['2rem', { lineHeight: '1', fontWeight: '700', fontFamily: 'JetBrains Mono, Roboto Mono, monospace' }],
        'data-2xl': ['2.5rem', { lineHeight: '1', fontWeight: '700', fontFamily: 'JetBrains Mono, Roboto Mono, monospace' }],
        // Label scale - light weight
        'label-xs': ['0.6875rem', { lineHeight: '1.4', fontWeight: '400' }],
        'label-sm': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
        'label': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        // Body scale
        'body-sm': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'body': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'sm': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'md': '0 6px 12px -2px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'lg': '0 10px 20px -4px rgb(0 0 0 / 0.1), 0 6px 10px -6px rgb(0 0 0 / 0.1)',
        'xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
}
