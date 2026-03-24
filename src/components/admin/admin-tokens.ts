// src/components/admin/admin-tokens.ts
export const adminColors = {
  bg: '#050b14',
  bgDeep: '#070d18',
  card: '#0a1628',
  cardHover: '#0f2035',
  border: '#132540',
  gold: '#c4992a',
  goldDim: 'rgba(196,153,42,0.15)',
  ivory: '#edeae4',
  gray: '#94a8c0',
  grayDim: '#5a7494',
  green: '#22c55e',
  greenDim: 'rgba(34,197,94,0.15)',
  red: '#ef4444',
  redDim: 'rgba(239,68,68,0.15)',
  yellow: '#f59e0b',
  yellowDim: 'rgba(245,158,11,0.15)',
  blue: '#3b82f6',
  blueDim: 'rgba(59,130,246,0.15)',
}

export const adminFonts = {
  kpi: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '2rem',
    color: adminColors.gold,
    fontWeight: 700 as const,
    lineHeight: 1.1,
  },
  kpiSmall: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.5rem',
    color: adminColors.gold,
    fontWeight: 700 as const,
    lineHeight: 1.1,
  },
  sectionTitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '1.1rem',
    color: adminColors.ivory,
    fontWeight: 600 as const,
  },
  label: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.75rem',
    color: adminColors.gray,
    fontWeight: 500 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  body: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.875rem',
    color: adminColors.ivory,
  },
  mono: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.8rem',
    color: adminColors.gray,
  },
}

export const adminCard = {
  background: adminColors.card,
  border: `1px solid ${adminColors.border}`,
  borderRadius: '12px',
  padding: '20px',
}
