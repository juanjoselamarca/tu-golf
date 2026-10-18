// Clasificación visual de cada tarjeta en el paso de revisión del import
// (nivel de confianza, etiqueta, borde, sombra). Funciones puras, sin React.
import type { ImportRoundData } from '@/lib/import-types'

export type CardStatus = 'accepted' | 'rejected'
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'incomplete' | 'garmin'

// ── Validation helpers ──
export function isComplete(round: ImportRoundData): boolean {
  const holes = round.holes_played || 0
  if (holes !== 9 && holes !== 18) return false
  const filledHoles = Object.values(round.scores).filter(v => typeof v === 'number' && v > 0).length
  return filledHoles === holes
}

export function isGarminRound(round: ImportRoundData): boolean {
  return round.import_confidence === 1.0 || round.metadata?.import_source === 'garmin_zip'
}

export function getConfidenceLevel(round: ImportRoundData): ConfidenceLevel {
  if (isGarminRound(round)) return 'garmin'
  if (!isComplete(round)) return 'incomplete'
  const conf = round.import_confidence || 0
  const hasAmbiguous = (round.metadata?.ambiguous_holes?.length || 0) > 0
  if (conf >= 0.9 && !hasAmbiguous) return 'high'
  if (conf >= 0.7) return 'medium'
  return 'low'
}

export function getStatusLabel(level: ConfidenceLevel): { text: string; color: string; bg: string } {
  switch (level) {
    case 'garmin': return { text: 'DATOS DE GARMIN', color: 'var(--status-live-fg)', bg: 'rgba(34,197,94,0.10)' }
    case 'high': return { text: 'VERIFICADA', color: 'var(--brand-on-bg)', bg: 'rgba(196,153,42,0.10)' }
    case 'medium': return { text: 'REVISAR', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' }
    case 'low': return { text: 'REVISAR', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' }
    case 'incomplete': return { text: 'INCOMPLETA', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' }
  }
}

export function getCardBorder(level: ConfidenceLevel, status: CardStatus | undefined): string {
  if (status === 'rejected') return '1px solid rgba(255,255,255,0.06)'
  switch (level) {
    case 'garmin': return '1px solid rgba(34,197,94,0.3)'
    case 'high': return '1px solid rgba(196,153,42,0.25)'
    case 'medium': return '1px solid rgba(245,158,11,0.2)'
    case 'low': return '1px solid rgba(245,158,11,0.15)'
    case 'incomplete': return '1px solid rgba(239,68,68,0.2)'
  }
}

export function getCardShadow(level: ConfidenceLevel, status: CardStatus | undefined): string {
  if (status === 'rejected') return 'none'
  if (level === 'garmin') return '0 0 16px rgba(34,197,94,0.06)'
  if (level === 'high') return '0 0 16px rgba(196,153,42,0.08)'
  return 'none'
}

/** Contadores de los chips del encabezado y del botón Importar. */
export interface ResumenDeRevision {
  aceptadas: number
  descartadas: number
  garmin: number
  listas: number
  porRevisar: number
  incompletas: number
}

export function resumenDeRevision(
  rounds: ImportRoundData[],
  decisions: Record<string, CardStatus>,
): ResumenDeRevision {
  const resumen: ResumenDeRevision = { aceptadas: 0, descartadas: 0, garmin: 0, listas: 0, porRevisar: 0, incompletas: 0 }
  for (const r of rounds) {
    const status = decisions[r.tempId]
    if (status === 'rejected') { resumen.descartadas++; continue }
    if (status === 'accepted') resumen.aceptadas++
    const level = getConfidenceLevel(r)
    if (level === 'garmin' && status === 'accepted') resumen.garmin++
    else if (level === 'high' && status === 'accepted') resumen.listas++
    else if (level === 'medium' || level === 'low') resumen.porRevisar++
    else if (level === 'incomplete') resumen.incompletas++
  }
  return resumen
}

/**
 * Golpes sobre el par de la ronda importada, o `null` si la ronda no trae el par
 * de TODOS sus hoyos (un par parcial daría un "+/-" inventado).
 */
export function vsParDeImportacion(round: ImportRoundData): number | null {
  const pares = round.par_per_hole
  if (!pares || round.total_gross == null) return null
  let par = 0
  for (let h = 1; h <= round.holes_played; h++) {
    const p = Number(pares[String(h)])
    if (!Number.isFinite(p) || p <= 0) return null
    par += p
  }
  return round.total_gross - par
}
