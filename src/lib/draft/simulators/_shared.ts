// src/lib/draft/simulators/_shared.ts
//
// Tipos comunes + helpers reutilizados por los 7 simuladores polimórficos
// del preview del live. Mantenerlos centralizados evita drift entre
// formatos y permite testear una sola vez los rangos sensatos de score.

import type { TournamentConfig } from '../types'

// Nombres demo mixtos (golf chileno) — 10 nombres alcanzan para:
// - 6 jugadores individuales (stroke/stableford)
// - 4 equipos de 2 (best_ball/scramble/foursome)
// - 8 jugadores en bracket eliminatorio
// - 5 parejas head-to-head en match_play 1v1
export const DEMO_NAMES: readonly string[] = [
  'Juan Demo',
  'María Demo',
  'Pedro Demo',
  'Ana Demo',
  'Luis Demo',
  'Carla Demo',
  'Diego Demo',
  'Sofía Demo',
  'Tomás Demo',
  'Valentina Demo',
]

export interface SimulatedPlayer {
  name: string
  category_id?: string
  handicap_index: number
  scores: number[]
}

export interface SimulatedIndividualResult {
  kind: 'individual'
  players: SimulatedPlayer[]
  format: TournamentConfig['format']
  hole_count: number
}

export interface SimulatedStablefordPlayer extends SimulatedPlayer {
  // Puntos por hoyo (resultado de aplicar points_table al score)
  points: number[]
  total_points: number
}

export interface SimulatedStablefordResult {
  kind: 'stableford'
  players: SimulatedStablefordPlayer[]
  format: 'stableford'
  hole_count: number
}

export interface SimulatedTeam {
  team_id: string
  team_name: string
  players: Array<{ name: string; handicap_index: number }>
  // scores[i] = score del equipo en el hoyo i
  scores: number[]
}

export interface SimulatedTeamResult {
  kind: 'team'
  teams: SimulatedTeam[]
  format: 'best_ball' | 'scramble' | 'foursome'
  hole_count: number
}

// ── Match Play ─────────────────────────────────────────────────────────

export interface MatchPlayMatch {
  match_id: string
  round_label: string // 'Cuartos', 'Semifinal', 'Final', 'Group A', etc.
  player_a: { name: string; handicap_index: number }
  player_b: { name: string; handicap_index: number }
  // Resultado en notación match-play: "3&2" (ganó por 3 hoyos cuando quedaban 2)
  // o "AS" (all square) o "1up" (ganó en el 18) etc.
  result: string
  winner: 'a' | 'b' | 'tie'
}

export interface SimulatedMatchPlayBracketResult {
  kind: 'match_play_bracket'
  bracket_mode: 'single_elimination' | 'round_robin'
  matches: MatchPlayMatch[]
  format: 'match_play'
  hole_count: number
}

export interface MatchPlayHoleStatus {
  hole: number
  // 'a_up_1', 'a_up_2', 'all_square', 'b_up_1', etc. + 'dormie' al final si aplica
  status: string
}

export interface SimulatedMatchPlay1v1Match {
  match_id: string
  player_a: { name: string; handicap_index: number }
  player_b: { name: string; handicap_index: number }
  // hole_status[i] = estado del match después de hoyo i+1
  hole_status: MatchPlayHoleStatus[]
  final_result: string // ej. "Juan ganó 3&2", "AS"
  winner: 'a' | 'b' | 'tie'
}

export interface SimulatedMatchPlay1v1Result {
  kind: 'match_play_1v1'
  matches: SimulatedMatchPlay1v1Match[]
  format: 'match_play'
  hole_count: number
}

export type AnySimulationResult =
  | SimulatedIndividualResult
  | SimulatedStablefordResult
  | SimulatedTeamResult
  | SimulatedMatchPlayBracketResult
  | SimulatedMatchPlay1v1Result

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Mulberry32 — PRNG determinístico de 32 bits.
 * Útil para tests deterministas pasando un `seed`. Si seed=undefined, usa
 * Math.random (no determinístico).
 */
export function makeRng(seed?: number): () => number {
  if (seed === undefined) return Math.random
  let s = seed >>> 0
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Score realista para un hoyo par-4 en stroke play.
 * Distribución: ~10% birdie, ~60% par, ~20% bogey, ~10% doble.
 */
export function randomStrokeScore(rng: () => number, par: number = 4): number {
  const r = rng()
  if (r < 0.1) return Math.max(2, par - 1) // birdie/eagle
  if (r < 0.7) return par
  if (r < 0.9) return par + 1
  return par + 2
}

/**
 * Score realista para hoyo par-4 en scramble (siempre bajo: 3-5).
 */
export function randomScrambleScore(rng: () => number): number {
  return 3 + Math.floor(rng() * 3) // 3, 4, o 5
}

/**
 * Score realista en foursome (alternate shot — algo más alto: 4-6 típico).
 */
export function randomFoursomeScore(rng: () => number): number {
  return 4 + Math.floor(rng() * 3) // 4, 5, o 6
}

export function getHoleCount(config: TournamentConfig): 9 | 18 {
  return config.rounds[0]?.hole_count ?? 18
}

export function getCategoryIdForIndex(config: TournamentConfig, i: number): string | undefined {
  if (config.categories.length === 0) return undefined
  return config.categories[i % config.categories.length]?.id
}
