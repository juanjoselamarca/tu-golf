/**
 * Cálculos de scoring — strokes, neto, stableford, resumen de ronda.
 */

import { type ModoJuego, type FormatoJuego, labelResultado } from './rules'
import { strokesRecibidosEnHoyo } from './stableford-score'
export { strokesRecibidosEnHoyo } from './stableford-score'

// ─── Score neto de un hoyo ───
export function scoreNetoHoyo(
  grossScore: number,
  handicapIndex: number,
  strokeIndex: number,
  holeCount: number = 18
): number {
  return grossScore - strokesRecibidosEnHoyo(handicapIndex, strokeIndex, holeCount)
}

// ─── Puntos Stableford (siempre en neto) ───
export function puntosStablefordHoyo(
  grossScore: number,
  par: number,
  handicapIndex: number,
  strokeIndex: number,
  holeCount: number = 18
): number {
  const neto = scoreNetoHoyo(grossScore, handicapIndex, strokeIndex, holeCount)
  const diff = neto - par
  if (diff <= -3) return 5  // Albatross o mejor
  if (diff === -2) return 4 // Eagle
  if (diff === -1) return 3 // Birdie
  if (diff === 0)  return 2 // Par
  if (diff === 1)  return 1 // Bogey
  return 0                  // Doble bogey+
}

// ─── Interfaces ───
export interface ResultadoHoyo {
  numero:           number
  par:              number
  strokeIndex:      number
  gross:            number
  strokesRecibidos: number
  neto:             number
  overUnderGross:   number
  overUnderNeto:    number
  puntosStableford: number
  labelGross:       string
  labelNeto:        string
}

export interface ResumenRonda {
  totalGross:      number
  totalNeto:       number
  totalStableford: number
  overUnderGross:  number
  overUnderNeto:   number
  parJugado:       number
  parTotalRonda:   number
  holesPlayed:     number
  hoyos:           ResultadoHoyo[]
  albatros:        number
  eagles:          number
  birdiesGross:    number
  birdiesNeto:     number
  pares:           number
  bogiesGross:     number
  dobles:          number
}

// ─── Resumen completo de una ronda ───
/**
 * Calcula el resumen completo de una ronda.
 *
 * `overUnderGross` y `overUnderNeto` se calculan SOLO sobre hoyos jugados.
 * Ejemplo: si el jugador hizo par en el hoyo 1 y no jugó el resto,
 * `overUnderGross = 0` (E), NUNCA -71.
 *
 * El parámetro `parTotal` se mantiene por compatibilidad pero ya no
 * se usa para el diferencial: el resumen expone `parJugado` (par de
 * hoyos con score) y `parTotalRonda` (par de toda la ronda, 1..holeCount)
 * por separado para los consumidores que necesiten cada valor.
 */
export function calcularResumenRonda(
  scores: Record<string, number>,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  handicapIndex: number,
  _parTotal: number,
  holeCount?: number
): ResumenRonda {
  void _parTotal
  const totalHoles = holeCount ?? holes.length
  let totalGross = 0, totalNeto = 0, totalStableford = 0
  let parJugado = 0, parTotalRonda = 0
  let albatros = 0, eagles = 0, birdiesGross = 0, birdiesNeto = 0
  let pares = 0, bogiesGross = 0, dobles = 0

  const hoyos: ResultadoHoyo[] = holes
    .map(h => {
      parTotalRonda += h.par
      const gross = scores[String(h.numero)]
      if (!gross || gross === 0) return null
      const strokes    = strokesRecibidosEnHoyo(handicapIndex, h.stroke_index, totalHoles)
      const neto       = gross - strokes
      const ouGross    = gross - h.par
      const ouNeto     = neto - h.par
      const stableford = puntosStablefordHoyo(gross, h.par, handicapIndex, h.stroke_index, totalHoles)

      totalGross      += gross
      totalNeto       += neto
      totalStableford += stableford
      parJugado       += h.par

      if (ouGross <= -3)       albatros++
      else if (ouGross === -2) eagles++
      else if (ouGross === -1) birdiesGross++
      else if (ouGross === 0)  pares++
      else if (ouGross === 1)  bogiesGross++
      else                     dobles++
      if (ouNeto === -1) birdiesNeto++

      return {
        numero:           h.numero,
        par:              h.par,
        strokeIndex:      h.stroke_index,
        gross,
        strokesRecibidos: strokes,
        neto,
        overUnderGross:   ouGross,
        overUnderNeto:    ouNeto,
        puntosStableford: stableford,
        labelGross:       labelResultado(ouGross),
        labelNeto:        labelResultado(ouNeto),
      }
    })
    .filter(Boolean) as ResultadoHoyo[]

  return {
    totalGross, totalNeto, totalStableford,
    overUnderGross: totalGross - parJugado,
    overUnderNeto:  totalNeto  - parJugado,
    parJugado,
    parTotalRonda,
    holesPlayed: hoyos.length,
    hoyos, albatros, eagles, birdiesGross, birdiesNeto, pares, bogiesGross, dobles,
  }
}

// ─── Score primario según formato y modo ───
export function scorePrimario(
  resumen: ResumenRonda,
  formato: FormatoJuego,
  modo: ModoJuego
): number {
  // Stableford es un FORMATO que siempre usa puntos Stableford (neto)
  if (formato === 'stableford') return resumen.totalStableford
  // Otros formatos: gross o neto según el modo
  if (modo === 'gross') return resumen.overUnderGross
  return resumen.overUnderNeto
}

// ─── Ordenar jugadores ───
export function ordenarJugadores<T extends {
  overUnderGross:  number
  overUnderNeto:   number
  totalStableford: number
}>(jugadores: T[], formato: FormatoJuego, modo: ModoJuego): T[] {
  return [...jugadores].sort((a, b) => {
    // Stableford: mayor puntos gana (DESC)
    if (formato === 'stableford') return b.totalStableford - a.totalStableford
    // Stroke play: menor score gana (ASC), usa gross o neto según el modo
    const sa = modo === 'gross' ? a.overUnderGross : a.overUnderNeto
    const sb = modo === 'gross' ? b.overUnderGross : b.overUnderNeto
    return sa - sb
  })
}
