import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        editorial: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Paleta editorial alineada con DESIGN.md de la app principal.
        gold: { 400: '#c9a14a', 500: '#a98532', 600: '#876523', 700: '#634717' },
        burgundy: { 500: '#6b1f2a', 600: '#581821', 700: '#3f1217' },
        bone: { 50: '#f7f3ec', 100: '#ebe3d3', 200: '#cfc4ad' },
        ink: { 900: '#0e0c0a', 800: '#1a1714', 700: '#252019' },
        fairway: { 500: '#3f5e3a', 600: '#324a30', 700: '#243a25' },
        sand: { 400: '#d8c391', 500: '#c0a96f' },
      },
    },
  },
  plugins: [],
}
export default config
