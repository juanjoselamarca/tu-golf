/* ── Design tokens de /perfil/stats (una fuente para vista y charts) ── */

import type { CSSProperties } from 'react'

export const C = {
  bg: 'var(--bg)',
  card: 'var(--bg-surface)',
  cardBorder: 'var(--border)',
  gold: 'var(--brand-on-bg)',
  ivory: 'var(--text)',
  muted: 'var(--text-2)',
}

export const cardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.cardBorder}`,
  borderRadius: 16,
  padding: 16,
}
