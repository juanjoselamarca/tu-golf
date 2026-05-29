/**
 * Helpers puros para /perfil/historial.
 *
 * Refactor 'el que toca, ordena' — extraído del page.tsx monolítico.
 * Sin side-effects, fáciles de testear unit.
 */

import type { CSSProperties } from 'react'
import { MONTHS } from './constants'
import type { HistoricalRound } from './types'

export interface ComputedStats {
  total:       number
  overUnder:   number
  eagles:      number
  birdies:     number
  pars:        number
  bogeys:      number
  doubles:     number
  front9:      number
  back9:       number | null
  filledHoles: number
  holePars:    number[]
}

/** Calcula stats hoyo-a-hoyo de una ronda (gross). Devuelve null si no hay scores. */
export function computeStats(scores: (number | null)[], holePars?: number[]): ComputedStats | null {
  const filled = scores.filter((s): s is number => s != null)
  if (filled.length === 0) return null
  const total      = filled.reduce((a, b) => a + b, 0)
  const pars_arr   = holePars ?? Array(filled.length).fill(4)
  const par        = pars_arr.reduce((a, b) => a + b, 0)
  const overUnder  = total - par
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0
  for (let i = 0; i < filled.length; i++) {
    const diff = filled[i] - (pars_arr[i] ?? 4)
    if (diff <= -2) eagles++
    else if (diff === -1) birdies++
    else if (diff === 0) pars++
    else if (diff === 1) bogeys++
    else doubles++
  }
  const front9 = filled.slice(0, 9).reduce((a, b) => a + b, 0)
  const back9  = filled.length > 9 ? filled.slice(9).reduce((a, b) => a + b, 0) : null
  return { total, overUnder, eagles, birdies, pars, bogeys, doubles, front9, back9, filledHoles: filled.length, holePars: pars_arr }
}

/** Devuelve el estilo de fondo para una celda según score vs par. */
export function cellBg(score: number | null, par: number = 4): CSSProperties {
  if (score == null) return { background: 'var(--score-empty-bg)',  color: 'var(--score-empty-fg)' }
  const diff = score - par
  if (diff <= -2)  return { background: 'var(--score-eagle-bg)',  color: 'var(--score-eagle-fg)' }
  if (diff === -1) return { background: 'var(--score-birdie-bg)', color: 'var(--score-birdie-fg)' }
  if (diff === 0)  return { background: 'rgba(0,0,0,0.04)',       color: 'var(--text)' }
  if (diff === 1)  return { background: 'var(--score-bogey-bg)',  color: 'var(--score-bogey-fg)' }
  return { background: 'var(--score-double-bg)', color: 'var(--score-double-fg)' }
}

/** Formatea over/under par: +3, E, -2. */
export function formatOv(n: number): string {
  return n > 0 ? `+${n}` : n === 0 ? 'E' : String(n)
}

/** Mensaje de tAIger+ según cantidad de rondas históricas. */
export function taigerMessage(count: number): string {
  if (count === 0) return 'tAIger+ está listo para analizar tu juego'
  if (count < 5)   return 'tAIger+ está aprendiendo tu juego'
  if (count < 10)  return 'Análisis parcial disponible'
  if (count < 20)  return 'tAIger+ detecta tus patrones'
  if (count < 50)  return 'perfil sólido — análisis profundo activo'
  return 'análisis completo'
}

/** "21 mar. 2026" — fecha corta es-CL. */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Marzo 2026" desde "2026-03-21". */
export function getMonthLabel(dateStr: string): string {
  const [year, monthStr] = dateStr.split('-')
  const idx = parseInt(monthStr, 10) - 1
  return `${MONTHS[idx]} ${year}`
}

/** Clave única YYYY-MM para agrupar por mes. */
export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** Agrupa rondas por mes (YYYY-MM), ordenado descendente. */
export function groupByMonth(rounds: HistoricalRound[]): Array<{ key: string; label: string; rounds: HistoricalRound[] }> {
  const map = new Map<string, HistoricalRound[]>()
  for (const r of rounds) {
    const key = getMonthKey(r.played_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, rounds]) => ({ key, label: getMonthLabel(rounds[0].played_at), rounds }))
}

/**
 * Color para el score total según vsPar.
 * Convención: bajo par = verde, par = dorado, sobre par = gris (NUNCA rojo —
 * rojo es lectura emocional negativa y rompe el design system premium).
 */
export function scoreColor(vsPar: number | null): string {
  if (vsPar == null) return '#374151'
  if (vsPar < 0)     return '#16a34a'
  if (vsPar === 0)   return '#c4992a'
  return '#5a6370'
}

/** ¿La ronda es match play? (no se mide vsPar). */
export function isMatchPlay(r: HistoricalRound): boolean {
  return r.formato_juego === 'match_play'
}

/**
 * ¿La ronda está COMPLETA? (todos los hoyos esperados tienen score).
 * Solo rondas completas son válidas para vsPar y promedio del historial.
 */
export function isCompleteRound(r: HistoricalRound): boolean {
  const expected = r.holes_played ?? r.scores?.length ?? 18
  const played   = r.scores?.filter((s): s is number => s != null).length ?? 0
  return played >= expected && played > 0
}
