import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Premium palette ──────────────────────────────
        'bg-deep':      '#070d18',
        'bg-card':      '#0e1c2f',
        'bg-hover':     '#132540',
        'players-blue': '#1a4fd6',
        gold: {
          DEFAULT: '#c4992a',
          light:   '#e8c06a',
        },
        ivory:       '#edeae4',
        'gray-soft': '#7a8fa8',
        'score-eagle':  '#2563eb',
        'score-birdie': '#16a34a',
        'score-bogey':  '#dc2626',

        // ── Legacy colors (leaderboard page, login, etc.) ─
        navy: {
          DEFAULT: '#0d1b2a',
          card:    '#152238',
          border:  '#1e3a5f',
        },
        players:    '#1a56db',
        field:      '#16a34a',
        'score-red':'#dc2626',
        golf: {
          green:        '#1a5c38',
          'green-light':'#2d8653',
          'green-dark': '#0f3d25',
          gold:         '#c9a84c',
          'gold-light': '#e2c97e',
          fairway:      '#4a7c59',
        },
      },
      fontFamily: {
        sans:    ['var(--font-dm-sans)',    'DM Sans',         'system-ui', 'sans-serif'],
        display: ['var(--font-playfair)',   'Playfair Display','Georgia',   'serif'],
      },
      transitionDuration: {
        '2000': '2000ms',
      },
    },
  },
  plugins: [],
}
export default config
