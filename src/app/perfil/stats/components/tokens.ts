/* ── Design tokens de /perfil/stats (una fuente para vista y charts) ── */

import type { CSSProperties } from 'react'

export const C = {
  bg: 'var(--bg)',
  card: 'var(--bg-surface)',
  cardBorder: 'var(--border)',
  green: '#1a9e6e',
  greenDim: 'rgba(26,158,110,0.15)',
  gold: '#c4992a',
  red: '#e05a4e',
  ivory: 'var(--text)',
  muted: 'var(--text-2)',
}

export const cardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.cardBorder}`,
  borderRadius: 16,
  padding: 20,
}
