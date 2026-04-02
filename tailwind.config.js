/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['Courier New', 'monospace'],
        sans: ['system-ui', 'sans-serif'],
      },
      colors: {
        black: '#000000',
        white: '#ffffff',
      },
      spacing: {
        px: '1px',
      },
    },
  },
  plugins: [],
};
