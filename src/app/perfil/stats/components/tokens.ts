/* ── Design tokens de /perfil/stats (una fuente para vista y charts) ── */

import type { CSSProperties } from 'react'
import { scoreFgVar } from '@/lib/score-tokens'

export const C = {
  bg: 'var(--bg)',
  card: 'var(--bg-surface)',
  cardBorder: 'var(--border)',
  /* Solo para el ícono de tendencia (delta con signo e ícono, DESIGN.md §13). */
  greenText: scoreFgVar(-1),
  gold: 'var(--brand-on-bg)',
  red: scoreFgVar(2),
  ivory: 'var(--text)',
  muted: 'var(--text-2)',
}

export const cardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.cardBorder}`,
  borderRadius: 16,
  padding: 16,
}
