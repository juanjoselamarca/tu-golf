'use client'

/**
 * ScoreSymbol — Íconos de score estilo Garmin Golf.
 *
 * Paleta Garmin verificada (24 Mar 2026):
 * - Eagle/Albatross (-2 o mejor): doble círculo azul oscuro
 * - Birdie (-1): círculo celeste
 * - Par (0): número sin marca
 * - Bogey (+1): cuadrado dorado
 * - Double bogey+ (+2 o peor): doble cuadrado rojo
 *
 * Trazos FINOS (1px) para elegancia premium. Número oscuro legible.
 */

export const GARMIN_COLORS = {
  eagle: '#0B6BA6',
  birdie: '#14B3D9',
  bogey: '#D4A442',
  double: '#DC3B2E',
  neutral: '#1a1a2e',
  mutedDark: '#6b7280',
  empty: '#e5e7eb',
  parText: '#9ca3af',
} as const

interface ScoreSymbolProps {
  score: number | null | undefined
  par: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
  theme?: 'dark' | 'light'
}

const SIZES = {
  sm: { box: 22, font: 11, border: 1, gap: 3 },
  md: { box: 28, font: 13, border: 1, gap: 3 },
  lg: { box: 34, font: 15, border: 1, gap: 4 },
}

export default function ScoreSymbol({ score, par, size = 'md', theme = 'light' }: ScoreSymbolProps) {
  const s = SIZES[size]
  const isDark = theme === 'dark'
  const numColor = isDark ? 'rgba(255,255,255,0.9)' : '#1a1a2e'
  const muted = isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db'
  const mono = '"DM Mono", ui-monospace, monospace'

  if (score == null || par == null) {
    return (
      <div style={{ width: s.box, height: s.box, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: s.font, color: muted, fontFamily: mono }}>
        —
      </div>
    )
  }

  const diff = score - par

  // Eagle o mejor (-2+): doble círculo azul oscuro
  if (diff <= -2) {
    return (
      <div style={{ width: s.box + s.gap * 2, height: s.box + s.gap * 2, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `${s.border}px solid ${GARMIN_COLORS.eagle}`,
        }} />
        <div style={{
          width: s.box, height: s.box, borderRadius: '50%',
          border: `${s.border}px solid ${GARMIN_COLORS.eagle}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.font, fontWeight: 600, color: numColor, lineHeight: 1,
          fontFamily: mono,
        }}>
          {score}
        </div>
      </div>
    )
  }

  // Birdie (-1): círculo celeste
  if (diff === -1) {
    return (
      <div style={{
        width: s.box, height: s.box, borderRadius: '50%',
        border: `${s.border}px solid ${GARMIN_COLORS.birdie}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: numColor, lineHeight: 1,
        fontFamily: mono,
      }}>
        {score}
      </div>
    )
  }

  // Par (0): sin marca
  if (diff === 0) {
    return (
      <div style={{
        width: s.box, height: s.box,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 500, color: numColor, lineHeight: 1,
        fontFamily: mono,
      }}>
        {score}
      </div>
    )
  }

  // Bogey (+1): cuadrado dorado
  if (diff === 1) {
    return (
      <div style={{
        width: s.box, height: s.box, borderRadius: 1,
        border: `${s.border}px solid ${GARMIN_COLORS.bogey}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: numColor, lineHeight: 1,
        fontFamily: mono,
      }}>
        {score}
      </div>
    )
  }

  // Doble bogey+ (+2 o peor): doble cuadrado rojo
  return (
    <div style={{ width: s.box + s.gap * 2, height: s.box + s.gap * 2, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 2,
        border: `${s.border}px solid ${GARMIN_COLORS.double}`,
      }} />
      <div style={{
        width: s.box, height: s.box, borderRadius: 1,
        border: `${s.border}px solid ${GARMIN_COLORS.double}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: numColor, lineHeight: 1,
        fontFamily: mono,
      }}>
        {score}
      </div>
    </div>
  )
}

export function getScoreIndicator(gross: number, par: number): {
  shape: 'none' | 'circle' | 'double-circle' | 'square' | 'double-square'
  color: string
  fontWeight: number
} {
  const diff = gross - par
  if (diff <= -2) return { shape: 'double-circle', color: GARMIN_COLORS.eagle, fontWeight: 600 }
  if (diff === -1) return { shape: 'circle', color: GARMIN_COLORS.birdie, fontWeight: 600 }
  if (diff === 0) return { shape: 'none', color: '', fontWeight: 500 }
  if (diff === 1) return { shape: 'square', color: GARMIN_COLORS.bogey, fontWeight: 600 }
  return { shape: 'double-square', color: GARMIN_COLORS.double, fontWeight: 600 }
}
