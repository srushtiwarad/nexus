// nexus/frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'slide-down': 'slideDown 0.3s ease-out forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
        'shimmer': 'shimmer 2s infinite linear',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'aurora': 'aurora 12s ease-in-out infinite alternate',
        'aurora-2': 'aurora2 15s ease-in-out infinite alternate-reverse',
        'aurora-3': 'aurora3 18s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(99, 102, 241, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.6)' },
        },
        aurora: {
          '0%': { transform: 'translate(-20%, -20%) rotate(0deg) scale(1)' },
          '33%': { transform: 'translate(10%, -30%) rotate(120deg) scale(1.1)' },
          '66%': { transform: 'translate(-10%, 10%) rotate(240deg) scale(0.9)' },
          '100%': { transform: 'translate(20%, -10%) rotate(360deg) scale(1)' },
        },
        aurora2: {
          '0%': { transform: 'translate(20%, 20%) rotate(0deg) scale(1)' },
          '33%': { transform: 'translate(-10%, 30%) rotate(-120deg) scale(1.2)' },
          '66%': { transform: 'translate(10%, -10%) rotate(-240deg) scale(0.85)' },
          '100%': { transform: 'translate(-20%, 10%) rotate(-360deg) scale(1.05)' },
        },
        aurora3: {
          '0%': { transform: 'translate(0%, -10%) rotate(45deg) scale(1)' },
          '50%': { transform: 'translate(-20%, 20%) rotate(225deg) scale(1.15)' },
          '100%': { transform: 'translate(10%, 0%) rotate(405deg) scale(0.95)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      boxShadow: {
        'glow-indigo': '0 0 20px rgba(99, 102, 241, 0.25), 0 0 60px rgba(99, 102, 241, 0.1)',
        'glow-violet': '0 0 20px rgba(139, 92, 246, 0.25), 0 0 60px rgba(139, 92, 246, 0.1)',
        'glow-sm': '0 0 10px rgba(99, 102, 241, 0.2)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.3), 0 1px 4px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
