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
  /** Pares por hoyo. Si para un hoyo dado no hay dato, ese segmento se renderiza
   *  como neutro (gris-par) en vez de asumir par=4 — porque asumir par=4 con un
   *  cache vacío producía colores incoherentes con el detalle de la ronda. */
  pars: Record<string, number> | number[]
  totalHoles: number
  height?: number
  gap?: number
  /** Cuando se listan rondas de 9 y 18 juntas, reservar 18 slots
   *  para que una ronda de 9 ocupe visualmente la mitad del ancho.
   *  Default: true. Pasar false para forzar full-width en contextos
   *  single-row (p.ej. detalle de ronda). */
  fillTo18?: boolean
}

function getColor(score: number | null | undefined, par: number | null): string {
  if (score == null || score === 0) return 'transparent'
  if (par == null) return '#d0d5dc' // sin dato de par confiable → neutro, no asumir resultado
  const d = score - par
  if (d <= -1) return GARMIN_COLORS.birdie
  if (d === 0) return '#d0d5dc' // gris claro para par — baseline visual, casi invisible
  if (d === 1) return GARMIN_COLORS.bogey
  return GARMIN_COLORS.double
}

function getS(scores: HoleBarProps['scores'], h: number): number | null {
  if (Array.isArray(scores)) return scores[h - 1] ?? null
  const v = scores[String(h)] ?? (scores as Record<number, number>)[h]
  return typeof v === 'number' && v > 0 ? v : null
}

function getP(pars: HoleBarProps['pars'], h: number): number | null {
  if (Array.isArray(pars)) {
    const v = pars[h - 1]
    return typeof v === 'number' ? v : null
  }
  const v = pars[String(h)] ?? (pars as Record<number, number>)[h]
  return typeof v === 'number' ? v : null
}

export default function HoleBar({
  scores, pars, totalHoles,
  height = 6,
  gap = 2,
  fillTo18 = true,
}: HoleBarProps) {
  // Slots = 18 cuando fillTo18 y la ronda es <18; así una ronda de 9
  // ocupa la mitad del ancho (visual correcto en listas mezcladas
  // de 9 y 18 hoyos — cierra H10). totalHoles manda el límite de
  // datos reales; los slots extra quedan como placeholder vacío.
  const slots = fillTo18 && totalHoles < 18 ? 18 : totalHoles

  const segs = Array.from({ length: slots }, (_, i) => {
    const h = i + 1
    const inRound = h <= totalHoles
    const s = inRound ? getS(scores, h) : null
    const p = inRound ? getP(pars, h) : null
    return { h, color: getColor(s, p), has: s != null, inRound }
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap,
      width: '100%', height,
    }}>
      {segs.map(seg => {
        // Placeholder fuera del rango jugado: muy sutil, sin borde, solo para
        // reservar el espacio. No confundir con "hoyo sin score" dentro del rango.
        const isPlaceholder = !seg.inRound
        return (
          <div
            key={seg.h}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: 1,
              background: seg.has ? seg.color : 'transparent',
              border: isPlaceholder
                ? '1px dashed rgba(0,0,0,0.04)'
                : (seg.has ? 'none' : `1px solid ${GARMIN_COLORS.empty}`),
              minWidth: 3,
              transition: 'background 0.2s',
              opacity: isPlaceholder ? 0.5 : 1,
            }}
          />
        )
      })}
    </div>
  )
}
