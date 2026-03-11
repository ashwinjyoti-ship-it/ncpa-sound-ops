/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{tsx,ts,jsx,js}'],
  theme: {
    extend: {
      colors: {
        'ops-bg': '#0a0a0a',
        'ops-surface': '#141414',
        'ops-border': '#262626',
        'ops-text': '#e5e5e5',
        'ops-muted': '#737373',
        'ops-accent': '#f59e0b',
        'ops-success': '#22c55e',
        'ops-danger': '#ef4444',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
}
