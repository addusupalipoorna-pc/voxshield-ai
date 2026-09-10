/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vs: {
          bg: '#FFFFFF',
          surface: '#F8FAFC',
          panel: '#FFFFFF',
          panel2: '#F8FAFC',
          panel3: '#F1F5F9',
          line: '#E2E8F0',
          border: '#E2E8F0',
          ink: '#0F172A',
          dim: '#475569',
          muted: '#64748B',
          navy: '#0B3B82',
          primary: '#0B3B82',
          'primary-hover': '#082F6B',
          blue: '#155EAD',
          cyan: '#0891B2',
          accent: '#0891B2',
          amber: '#B45309',
          warning: '#B45309',
          red: '#B91C1C',
          danger: '#B91C1C',
          green: '#15803D',
          success: '#15803D',
          violet: '#4338CA',
        },
      },
      boxShadow: {
        enterprise: '0 4px 20px rgba(15, 23, 42, 0.06)',
        card: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
        elevated: '0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
      },
    },
  },
  plugins: [],
};
