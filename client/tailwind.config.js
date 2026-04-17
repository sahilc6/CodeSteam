/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#1e1e2e',
          sidebar: '#181825',
          border: '#313244',
          text: '#cdd6f4',
          muted: '#6c7086',
          accent: '#89b4fa',
          green: '#a6e3a1',
          red: '#f38ba8',
          yellow: '#f9e2af',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
