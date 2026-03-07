/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    { pattern: /^dark:/ }
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
        surfaceLight: '#202020',
        textMain: '#ffffff',
        textMuted: 'rgb(var(--color-text-muted) / <alpha-value>)'
      }
    },
  },
  plugins: [],
}
