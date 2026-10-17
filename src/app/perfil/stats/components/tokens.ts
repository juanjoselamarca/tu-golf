/* ── Design tokens de /perfil/stats (una fuente para vista y charts) ── */

import type { CSSProperties } from 'react'
import { scoreFgVar } from '@/lib/score-tokens'

export const C = {
  bg: 'var(--bg)',
  card: 'var(--bg-surface)',
  cardBorder: 'var(--border)',
  /* Relleno (gauge, barras): celeste Garmin. Como TEXTO usar greenText: --birdie
     sobre fondo claro da 2.5:1 (reprueba); --score-birdie-fg cambia por tema. */
  green: 'var(--birdie)',
  greenDim: 'rgba(20,179,217,0.15)',
  greenText: scoreFgVar(-1),
  eagleText: scoreFgVar(-2),
  gold: 'var(--brand-on-bg)',
  red: scoreFgVar(2),
  ivory: 'var(--text)',
  muted: 'var(--text-2)',
}

export const cardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.cardBorder}`,
  borderRadius: 16,
  padding: 20,
}
