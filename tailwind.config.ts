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
        sans:      ['var(--font-dm-sans)',    'DM Sans',          'system-ui',    'sans-serif'],
        display:   ['var(--font-playfair)',   'Playfair Display', 'Georgia',      'serif'],
        // DM Mono — data tabular: scores, ratings, slopes, yardajes, códigos.
        // Override del font-mono nativo de Tailwind (que es ui-monospace).
        // DESIGN.md §4: mono OBLIGATORIO para data que se lea/dicte en cancha.
        mono:      ['var(--font-dm-mono)',    'DM Mono',          'ui-monospace', 'monospace'],
        // Cormorant Garamond — "ghost numbers" editoriales (CostoPsicologicoCard,
        // CPI, índices narrativos). Uso rationed según DESIGN.md §4.
        editorial: ['var(--font-cormorant)',  'Cormorant Garamond', 'Georgia',    'serif'],
      },
      fontSize: {
        // Golfers+ canonical scale. The values live in globals.css (--fs-*); inline styles use FONT_SIZE
        // (src/lib/font-size.ts). Tailwind's defaults (text-xs/sm/base/lg/xl/2xl..9xl) remain for gradual
        // migration; new UI uses these tokens.
        caption: ['var(--fs-caption)', { lineHeight: '1rem',   letterSpacing: '0.06em' }],
        small:   ['var(--fs-small)',   { lineHeight: '1.25rem' }],
        body:    ['var(--fs-body)',    { lineHeight: '1.5rem' }],
        lead:    ['var(--fs-lead)',    { lineHeight: '1.6'    }],
        title:   ['var(--fs-title)',   { lineHeight: '1.3'    }],
        h2:      ['var(--fs-h2)',      { lineHeight: '1.2',  letterSpacing: '-0.01em' }],
        h1:      ['var(--fs-h1)',      { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        hero:    ['var(--fs-hero)',    { lineHeight: '1.05' }],
        // Tabular data: pair with font-mono + tabular-nums. All DM Mono text uses these steps.
        // dataCaption…dataH1 match caption…h1 in size only, not in line height or tracking.
        // dataSm 14px → hcp, ratings, slope. dataMd 18px → hole score, yardage. dataLg/Xl → big round score.
        dataCaption: ['var(--fs-data-caption)', { lineHeight: '1.1' }],
        dataSm:      ['var(--fs-data-sm)',      { lineHeight: '1.1' }],
        dataBody:    ['var(--fs-data-body)',    { lineHeight: '1.1' }],
        dataMd:      ['var(--fs-data-md)',      { lineHeight: '1.1' }],
        dataTitle:   ['var(--fs-data-title)',   { lineHeight: '1.1' }],
        dataH2:      ['var(--fs-data-h2)',      { lineHeight: '1.1' }],
        dataH1:      ['var(--fs-data-h1)',      { lineHeight: '1'   }],
        dataLg:      ['var(--fs-data-lg)',      { lineHeight: '1'   }],
        dataXl:      ['var(--fs-data-xl)',      { lineHeight: '0.95' }],
      },
      transitionDuration: {
        '2000': '2000ms',
      },
    },
  },
  plugins: [],
}
export default config
