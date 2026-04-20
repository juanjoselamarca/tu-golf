/**
 * src/lib/ronda/helpers.ts
 *
 * Helpers puros extraídos de las páginas monolíticas de ronda-libre:
 *   - src/app/ronda-libre/[codigo]/page.tsx
 *   - src/app/ronda-libre/[codigo]/score/page.tsx
 *
 * Zero behavior change: los cuerpos son verbatim desde los call sites.
 * No hay React hooks, ni async, ni Supabase aquí — sólo funciones puras
 * (la única excepción controlada es `haptic`, que tiene side effect via
 * navigator.vibrate — se mueve tal cual porque es trivial y self-contained).
 *
 * NO MODIFICAR sin verificar los dos call sites arriba.
 */

import type { CSSProperties } from 'react'
import { SCORE_STYLES, SCORE_STYLES_LIGHT, getScoreResult } from '@/golf/core/colors'
import { calcularScoreRonda } from '@/golf/core/round-score'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import type { Jugador, TimelineEvent } from '@/types/ronda'

/* ── score/page.tsx helpers ──────────────────────────────────────────── */

export function getTeeYardageColumn(tee: string): string {
  const t = tee.toLowerCase()
  if (t === 'black' || t === 'campeonato' || t === 'negro') return 'yardaje_campeonato'
  if (t === 'blue' || t === 'azul') return 'yardaje_azul'
  if (t === 'white' || t === 'blanco') return 'yardaje_blanco'
  if (t === 'red' || t === 'rojo') return 'yardaje_rojo'
  return 'yardaje_azul' // default
}

/** Genera orden circular de hoyos. hoyoInicio=4, holes=18 → [4,5,...,18,1,2,3] */
export function generarOrdenHoyos(hoyoInicio: number, totalHoles: number): number[] {
  const orden: number[] = []
  for (let i = 0; i < totalHoles; i++) {
    orden.push(((hoyoInicio - 1 + i) % totalHoles) + 1)
  }
  return orden
}

export function haptic(p: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p)
}

export function getChipStyle(gross: number, par: number, isDark: boolean): CSSProperties {
  const result = getScoreResult(gross, par)
  const styles = isDark ? SCORE_STYLES : SCORE_STYLES_LIGHT
  const s = styles[result]
  return { background: s.bg, color: s.textColor, border: `${s.borderWidth} solid ${s.border}` }
}

export function getChipLabel(gross: number, par: number): string {
  const d = gross - par
  if (d <= -2) return `Eagle  ${d}`
  if (d === -1) return 'Birdie  −1'
  if (d === 0) return 'Par'
  if (d === 1) return 'Bogey  +1'
  if (d === 2) return 'Doble  +2'
  return `+${d}`
}

/* ── [codigo]/page.tsx helpers ───────────────────────────────────────── */

export function getVsPar(
  scores: Record<string, number>,
  holes: number,
  parMap: Record<number, number>,
): number {
  // Delegado al helper centralizado (fuente única de verdad)
  return calcularScoreRonda({ scores, roundHoles: holes, parMap }).vsPar
}

/** Calcula vs par NETO aplicando strokes del course handicap por stroke index */
export function getVsParNeto(
  scores: Record<string, number>,
  holes: number,
  parMap: Record<number, number>,
  siMap: Record<number, number>,
  courseHandicap: number,
): number {
  let total = 0
  for (let h = 1; h <= holes; h++) {
    const s = scores[String(h)] ?? scores[h]
    if (s == null) continue
    const si = siMap[h] ?? h
    const strokes = strokesRecibidosEnHoyo(courseHandicap, si, holes)
    const neto = s - strokes
    total += neto - (parMap[h] ?? 4)
  }
  return total
}

export function getHolesPlayed(scores: Record<string, number>, holes: number): number {
  let count = 0
  for (let h = 1; h <= holes; h++) {
    if ((scores[String(h)] ?? scores[h]) != null) count++
  }
  return count
}

export function buildTimelineEvents(
  jugadores: Jugador[],
  holes: number,
  parMap: Record<number, number>,
): TimelineEvent[] {
  return jugadores
    .map((jugador) => {
      for (let h = holes; h >= 1; h--) {
        const score = jugador.scores[String(h)] ?? jugador.scores[h]
        if (score != null) {
          const par = parMap[h] ?? 4
          return { jugador: jugador.nombre, hole: h, score, diff: score - par }
        }
      }
      return null
    })
    .filter((event): event is TimelineEvent => event !== null)
    .sort((a, b) => b.hole - a.hole)
    .slice(0, 4)
}
