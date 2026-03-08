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
        sans: ['"Noto Sans Thai"', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        brand: {
          start: '#00d4aa',
          end: '#7c5cfc'
        },
        surface: '#151515',
        surfaceLight: '#1e1e1e',
        surfaceDark: '#0d0d0d',
        textMain: '#ffffff',
        textMuted: 'rgb(var(--color-text-muted) / <alpha-value>)'
      },
      boxShadow: {
        'glow-brand': '0 0 20px rgba(0, 212, 170, 0.15)',
        'glow-sm': '0 0 10px rgba(0, 212, 170, 0.1)',
        'card': '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
