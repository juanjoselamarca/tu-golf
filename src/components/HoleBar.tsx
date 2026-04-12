'use client'

/**
 * HoleBar — barra horizontal de segmentos hoyo-por-hoyo estilo Garmin Activity.
 *
 * Cada hoyo es un segmento corto con gap entre ellos, coloreado según
 * el resultado vs par (igual paleta que ScoreSymbol):
 *
 *   ● ● · ● ● · ● · · · · ● ● ● ● · · ●     (18 hoyos)
 *
 *   Celeste = birdie (-1) o mejor
 *   Gris neutro = par (0)
 *   Naranja = bogey (+1)
 *   Rojo = doble bogey (+2) o peor
 *   Vacío (transparente outline) = hoyo sin score
 *
 * Permite al usuario escanear su historial y ver "cómo le fue" de un vistazo.
 */

import { GARMIN_COLORS } from './ScoreSymbol'

export interface HoleBarProps {
  /** Scores por número de hoyo. */
  scores: Record<string, number> | (number | null)[]
  /** Pares por número de hoyo (same key). Si no está, asume 4. */
  pars: Record<string, number> | number[]
  /** Total de hoyos a renderizar (9 o 18). */
  totalHoles: number
  /** Altura de la barra en px. Default 8. */
  height?: number
  /** Gap entre segmentos en px. Default 2. */
  gap?: number
}

function segmentColor(score: number | null | undefined, par: number): string {
  if (score == null || score === 0) return 'transparent'
  const diff = score - par
  if (diff <= -1) return GARMIN_COLORS.birdie
  if (diff === 0) return GARMIN_COLORS.mutedDark // gris neutro para par
  if (diff === 1) return GARMIN_COLORS.bogey
  return GARMIN_COLORS.double
}

function getScore(scores: HoleBarProps['scores'], hole: number): number | null {
  if (Array.isArray(scores)) {
    return scores[hole - 1] ?? null
  }
  const raw = scores[String(hole)] ?? (scores as Record<number, number>)[hole]
  return typeof raw === 'number' && raw > 0 ? raw : null
}

function getPar(pars: HoleBarProps['pars'], hole: number): number {
  if (Array.isArray(pars)) {
    return pars[hole - 1] ?? 4
  }
  const raw = pars[String(hole)] ?? (pars as Record<number, number>)[hole]
  return typeof raw === 'number' ? raw : 4
}

export default function HoleBar({
  scores,
  pars,
  totalHoles,
  height = 8,
  gap = 2,
}: HoleBarProps) {
  const segments = Array.from({ length: totalHoles }, (_, i) => {
    const hole = i + 1
    const score = getScore(scores, hole)
    const par = getPar(pars, hole)
    const color = segmentColor(score, par)
    return { hole, color, hasScore: score != null }
  })

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: `${gap}px`,
      width: '100%',
    }}>
      {segments.map(seg => (
        <div
          key={seg.hole}
          style={{
            flex: 1,
            height,
            borderRadius: height / 2,
            background: seg.hasScore ? seg.color : 'transparent',
            border: seg.hasScore ? 'none' : `1px solid ${GARMIN_COLORS.empty}`,
            minWidth: 4,
          }}
          title={`Hoyo ${seg.hole}`}
        />
      ))}
    </div>
  )
}
