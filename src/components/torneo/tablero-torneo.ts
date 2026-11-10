// Tokens y helpers de presentación del board de torneo (TournamentTabs y su
// pestaña Grupos). Salieron de TournamentTabs.tsx al bajarlo de 600 LOC.
import type { Player } from '@/lib/golf-data'
import { hasPlayData } from '@/golf/leaderboard/board-rules'

/* ── Design tokens ────────────────────────────────────────── */
export const T = {
  bg:        'var(--bg)',
  card:      'var(--bg-surface)',
  gold:      'var(--brand-on-bg)',
  ivory:     'var(--text)',
  muted:     'var(--text-2)',
  faint:     'var(--text-3)',
  border:    'var(--border)',
  green:     'var(--status-live-fg)',
  red:       'var(--status-closed-fg)',
  rowAlt:    'var(--surface-soft)',
  leaderBg:  'rgba(196,153,42,0.04)',
  leaderBd:  'rgba(196,153,42,0.25)',
} as const

/* ── Helpers ──────────────────────────────────────────────── */
/**
 * El handicap que se MUESTRA de un jugador, o `null` si a este visor no se le
 * muestra (`Player.hcp === null`: jugador con cuenta visto por un espectador sin
 * sesión — de ahí se deduce el índice). El dato ni siquiera llega: lo anula el
 * servidor (`filaPublica`, vista-publica.ts).
 */
export function hcpAMostrar(p: Player): number | null {
  if (p.hcp == null) return null
  return Math.round(p.hcpDisplay ?? p.hcp)
}

export function scoreColor(n: number, esPuntos: boolean) {
  // Under-par = brand gold (resalta al líder). Par/over = texto normal.
  // Green reservado exclusivamente para live/success (DESIGN.md §3).
  // Los puntos Stableford no tienen "bajo par": texto normal.
  if (!esPuntos && n < 0) return T.gold
  return T.ivory
}

export function thruLabel(p: Player, totalHoyos: number) {
  if (p.status === 'F') return 'F'
  if (!hasPlayData({ holesPlayed: p.holes })) return '-'
  return `${p.holes}`
}
