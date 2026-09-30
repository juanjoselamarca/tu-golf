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
import { normalizeStrokeIndexMap } from '@/golf/core/stroke-index'
import { hoyosDeLaRonda, hoyosDesdeElUno } from '@/golf/core/hoyos-jugados'
import { hoyosSinMarcar } from '@/golf/ronda-libre/tarjeta-historica'
import type { Jugador, TimelineEvent } from '@/types/ronda'

/* ── score/page.tsx helpers ──────────────────────────────────────────── */

export function getTeeYardageColumn(tee: string): string {
  const t = tee.toLowerCase()
  // Aliases defensivos: 'campeonato', 'black', 'negro' siguen aceptados para
  // datos externos (mScorecard, golfcourseapi, snapshots viejos no migrados).
  if (t === 'negras' || t === 'black' || t === 'campeonato' || t === 'negro') return 'yardaje_negras'
  if (t === 'blue' || t === 'azul') return 'yardaje_azul'
  if (t === 'white' || t === 'blanco') return 'yardaje_blanco'
  if (t === 'red' || t === 'rojo') return 'yardaje_rojo'
  return 'yardaje_azul' // default
}

/**
 * Orden de hoyos jugados. Alias histórico de `hoyosDeLaRonda`
 * (`@/golf/core/hoyos-jugados`), que es la fuente única y documenta el wrap.
 */
export function generarOrdenHoyos(hoyoInicio: number, totalHoles: number, courseHoles = 18): number[] {
  return hoyosDeLaRonda(hoyoInicio, totalHoles, courseHoles)
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
  hoyos?: readonly number[],
): number {
  // Delegado al helper centralizado (fuente única de verdad)
  return calcularScoreRonda({ scores, roundHoles: holes, parMap, hoyos }).vsPar
}

/** Calcula vs par NETO aplicando strokes del course handicap por stroke index */
export function getVsParNeto(
  scores: Record<string, number>,
  holes: number,
  parMap: Record<number, number>,
  siMap: Record<number, number>,
  courseHandicap: number,
  hoyos?: readonly number[],
): number {
  // Defensa en profundidad: normaliza el SI a permutación 1..holes para alocar
  // golpes (Σ == course handicap aunque el SI de catálogo sea 18h-impar en 9h).
  // Idempotente si el caller ya normalizó (ej. buildLeaderboard pasa siMapNorm).
  const siMapNorm = normalizeStrokeIndexMap(siMap, holes, hoyos)
  let total = 0
  for (const h of hoyos ?? hoyosDesdeElUno(holes)) {
    const s = scores[String(h)] ?? scores[h]
    if (s == null) continue
    const si = siMapNorm[h] ?? siMap[h] ?? h
    const strokes = strokesRecibidosEnHoyo(courseHandicap, si, holes)
    const neto = s - strokes
    total += neto - (parMap[h] ?? 4)
  }
  return total
}

export function getHolesPlayed(scores: Record<string, number>, holes: number, hoyos?: readonly number[]): number {
  let count = 0
  for (const h of hoyos ?? hoyosDesdeElUno(holes)) {
    if ((scores[String(h)] ?? scores[h]) != null) count++
  }
  return count
}

/**
 * ¿La tarjeta tiene todos los hoyos de la ronda anotados? Cuenta claves
 * numéricas positivas, sin asumir que empiezan en 1: una ronda de 9 que parte
 * en el 10 guarda las claves 10..18.
 *
 * ESPEJO en SQL: `finalizar_ronda_libre` (migración 20260929b) usa la misma
 * regla para decidir si un invitado sin sesión puede cerrar la ronda. Si
 * cambia acá, cambia allá.
 */
export function tarjetaCompleta(scores: Record<string, number> | null | undefined, holes: number): boolean {
  const anotados = Object.keys(scores ?? {}).filter(k => /^[0-9]+$/.test(k) && Number(k) >= 1).length
  return anotados >= holes
}

/**
 * Hoyos de la ronda que NO tienen score registrado (delegado a `hoyosSinMarcar`,
 * fuente única en `@/golf/ronda-libre/tarjeta-historica`). Sin `hoyos` mira
 * 1..totalHoles; una ronda de 9 desde el 10 DEBE pasar `hoyosDeLaRonda(10, 9)`
 * o recibe como "faltantes" nueve hoyos que no se juegan.
 */
export function getMissingHoles(
  scores: Record<string | number, number>,
  totalHoles: number,
  hoyos?: readonly number[],
): number[] {
  return hoyosSinMarcar(scores, hoyos ?? hoyosDesdeElUno(totalHoles))
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
