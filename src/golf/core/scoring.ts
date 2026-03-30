/**
 * Cálculos de scoring — strokes, neto, stableford, resumen de ronda.
 */

import { type ModoJuego, labelResultado } from './rules'

// ─── Strokes que recibe un jugador en un hoyo ───
export function strokesRecibidosEnHoyo(
  handicapIndex: number,
  strokeIndex: number
): number {
  if (handicapIndex < 0) {
    const hcpAbs = Math.abs(Math.round(handicapIndex))
    return -(hcpAbs >= strokeIndex ? 1 : 0)
  }
  const hcp = Math.round(Math.max(0, Math.min(handicapIndex, 54)))
  const strokesBase = Math.floor(hcp / 18)
  const extra = (hcp % 18) >= strokeIndex ? 1 : 0
  return strokesBase + extra
}

// ─── Score neto de un hoyo ───
export function scoreNetoHoyo(
  grossScore: number,
  handicapIndex: number,
  strokeIndex: number
): number {
  return grossScore - strokesRecibidosEnHoyo(handicapIndex, strokeIndex)
}

// ─── Puntos Stableford (siempre en neto) ───
export function puntosStablefordHoyo(
  grossScore: number,
  par: number,
  handicapIndex: number,
  strokeIndex: number
): number {
  const neto = scoreNetoHoyo(grossScore, handicapIndex, strokeIndex)
  const diff = neto - par
  if (diff <= -2) return 4
  if (diff === -1) return 3
  if (diff === 0)  return 2
  if (diff === 1)  return 1
  return 0
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
  hoyos:           ResultadoHoyo[]
  eagles:          number
  birdiesGross:    number
  birdiesNeto:     number
  pares:           number
  bogiesGross:     number
  dobles:          number
}

// ─── Resumen completo de una ronda ───
export function calcularResumenRonda(
  scores: Record<string, number>,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  handicapIndex: number,
  parTotal: number
): ResumenRonda {
  let totalGross = 0, totalNeto = 0, totalStableford = 0
  let eagles = 0, birdiesGross = 0, birdiesNeto = 0
  let pares = 0, bogiesGross = 0, dobles = 0

  const hoyos: ResultadoHoyo[] = holes
    .map(h => {
      const gross = scores[String(h.numero)]
      if (!gross || gross === 0) return null
      const strokes    = strokesRecibidosEnHoyo(handicapIndex, h.stroke_index)
      const neto       = gross - strokes
      const ouGross    = gross - h.par
      const ouNeto     = neto - h.par
      const stableford = puntosStablefordHoyo(gross, h.par, handicapIndex, h.stroke_index)

      totalGross      += gross
      totalNeto       += neto
      totalStableford += stableford

      if (ouGross <= -2)       eagles++
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
    overUnderGross: totalGross - parTotal,
    overUnderNeto:  totalNeto  - parTotal,
    hoyos, eagles, birdiesGross, birdiesNeto, pares, bogiesGross, dobles,
  }
}

// ─── Score primario según modo ───
export function scorePrimario(resumen: ResumenRonda, modo: ModoJuego): number {
  if (modo === 'gross') return resumen.overUnderGross
  if (modo === 'neto')  return resumen.overUnderNeto
  return resumen.totalStableford
}

// ─── Ordenar jugadores ───
export function ordenarJugadores<T extends {
  overUnderGross:  number
  overUnderNeto:   number
  totalStableford: number
}>(jugadores: T[], modo: ModoJuego): T[] {
  return [...jugadores].sort((a, b) => {
    if (modo === 'stableford') return b.totalStableford - a.totalStableford
    const sa = modo === 'gross' ? a.overUnderGross : a.overUnderNeto
    const sb = modo === 'gross' ? b.overUnderGross : b.overUnderNeto
    return sa - sb
  })
}
