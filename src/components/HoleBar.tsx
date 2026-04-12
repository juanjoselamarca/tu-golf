'use client'

/**
 * HoleBar — barra horizontal de rendimiento hoyo-por-hoyo.
 *
 * Versión profesional inspirada en Garmin Activity:
 * - Segmentos delgados con bordes redondeados sutiles
 * - Colores Garmin: celeste (birdie+), gris neutro (par), dorado (bogey), rojo (doble+)
 * - Gap mínimo entre segmentos para sensación continua pero articulada
 * - Sin hover, sin tooltips: la barra es un resumen visual puro
 */

import { GARMIN_COLORS } from './ScoreSymbol'

export interface HoleBarProps {
  scores: Record<string, number> | (number | null)[]
  pars: Record<string, number> | number[]
  totalHoles: number
  height?: number
  gap?: number
}

function getColor(score: number | null | undefined, par: number): string {
  if (score == null || score === 0) return 'transparent'
  const d = score - par
  if (d <= -1) return GARMIN_COLORS.birdie
  if (d === 0) return '#b0b8c4' // gris medio sutil para par (no tan oscuro ni tan claro)
  if (d === 1) return GARMIN_COLORS.bogey
  return GARMIN_COLORS.double
}

function getS(scores: HoleBarProps['scores'], h: number): number | null {
  if (Array.isArray(scores)) return scores[h - 1] ?? null
  const v = scores[String(h)] ?? (scores as Record<number, number>)[h]
  return typeof v === 'number' && v > 0 ? v : null
}

function getP(pars: HoleBarProps['pars'], h: number): number {
  if (Array.isArray(pars)) return pars[h - 1] ?? 4
  const v = pars[String(h)] ?? (pars as Record<number, number>)[h]
  return typeof v === 'number' ? v : 4
}

export default function HoleBar({
  scores, pars, totalHoles,
  height = 6,
  gap = 2,
}: HoleBarProps) {
  const segs = Array.from({ length: totalHoles }, (_, i) => {
    const h = i + 1
    const s = getS(scores, h)
    const p = getP(pars, h)
    return { h, color: getColor(s, p), has: s != null }
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap,
      width: '100%', height,
    }}>
      {segs.map(seg => (
        <div
          key={seg.h}
          style={{
            flex: 1,
            height: '100%',
            borderRadius: 1,
            background: seg.has ? seg.color : 'transparent',
            border: seg.has ? 'none' : `1px solid ${GARMIN_COLORS.empty}`,
            minWidth: 3,
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  )
}
