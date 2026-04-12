'use client'

/**
 * ScoreSymbol — Íconos de score estilo Garmin Golf.
 *
 * Paleta verificada contra capturas reales de Garmin Golf (24 Mar 2026):
 * - Eagle/Albatross (-2 o mejor): doble círculo AZUL OSCURO
 * - Birdie (-1): círculo CELESTE
 * - Par (0): número sin marca
 * - Bogey (+1): cuadrado DORADO/NARANJA
 * - Double bogey+ (+2 o peor): doble cuadrado ROJO
 *
 * El número va DENTRO del ícono, no al lado. Trazos outline (no fill),
 * el color del número queda negro para legibilidad.
 *
 * Hole-in-one: NO se diferencia visualmente (Garmin tampoco lo hace).
 * El propio número 1 ya comunica el momento.
 */

// ═══════════════════════════════════════════════════════════
// PALETA GARMIN (verified vs app real)
// ═══════════════════════════════════════════════════════════

export const GARMIN_COLORS = {
  /** Azul oscuro Garmin — eagle, albatross, hole in one en par 4+ */
  eagle: '#0B6BA6',
  /** Celeste Garmin — birdie */
  birdie: '#14B3D9',
  /** Dorado/naranja Garmin — bogey */
  bogey: '#E8A838',
  /** Rojo Garmin — doble bogey o peor */
  double: '#DC3B2E',
  /** Gris neutro para par y fondo */
  neutral: '#374151',
  /** Gris claro para números de hoyo y par */
  mutedDark: '#9ca3af',
  /** Gris muy claro (sin score) */
  empty: '#d1d5db',
} as const

interface ScoreSymbolProps {
  score: number | null | undefined
  par: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
  /** dark=texto claro sobre fondo oscuro, light=texto oscuro sobre fondo claro */
  theme?: 'dark' | 'light'
}

const SIZES = {
  sm: { box: 24, font: 12, border: 1.5, gap: 3 },
  md: { box: 30, font: 14, border: 1.5, gap: 3.5 },
  lg: { box: 38, font: 17, border: 2, gap: 4 },
}

export default function ScoreSymbol({ score, par, size = 'md', theme = 'light' }: ScoreSymbolProps) {
  const s = SIZES[size]
  const isDark = theme === 'dark'
  const baseColor = isDark ? 'rgba(255,255,255,0.92)' : '#111827'
  const mutedColor = isDark ? 'rgba(255,255,255,0.18)' : GARMIN_COLORS.empty

  // No score
  if (score == null || par == null) {
    return (
      <div style={{ width: s.box, height: s.box, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: s.font, color: mutedColor }}>
        ·
      </div>
    )
  }

  const diff = score - par

  // ── EAGLE o mejor (-2, -3, -4...) — doble círculo azul oscuro ──
  if (diff <= -2) {
    return (
      <div style={{ width: s.box, height: s.box, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{
          position: 'absolute',
          inset: -s.gap,
          borderRadius: '50%',
          border: `${s.border}px solid ${GARMIN_COLORS.eagle}`,
        }} />
        <div style={{
          width: s.box, height: s.box, borderRadius: '50%',
          border: `${s.border}px solid ${GARMIN_COLORS.eagle}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.font, fontWeight: 700, color: baseColor, lineHeight: 1,
          fontFamily: '"DM Mono", ui-monospace, monospace',
        }}>
          {score}
        </div>
      </div>
    )
  }

  // ── BIRDIE (-1) — círculo celeste simple ──
  if (diff === -1) {
    return (
      <div style={{
        width: s.box, height: s.box, borderRadius: '50%',
        border: `${s.border}px solid ${GARMIN_COLORS.birdie}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: baseColor, lineHeight: 1,
        fontFamily: '"DM Mono", ui-monospace, monospace',
      }}>
        {score}
      </div>
    )
  }

  // ── PAR (0) — sólo número, sin marca ──
  if (diff === 0) {
    return (
      <div style={{
        width: s.box, height: s.box,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: baseColor, lineHeight: 1,
        fontFamily: '"DM Mono", ui-monospace, monospace',
      }}>
        {score}
      </div>
    )
  }

  // ── BOGEY (+1) — cuadrado dorado/naranja simple ──
  if (diff === 1) {
    return (
      <div style={{
        minWidth: s.box, height: s.box, borderRadius: '2px',
        border: `${s.border}px solid ${GARMIN_COLORS.bogey}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: baseColor, lineHeight: 1,
        padding: '0 3px',
        fontFamily: '"DM Mono", ui-monospace, monospace',
      }}>
        {score}
      </div>
    )
  }

  // ── DOUBLE BOGEY o peor (+2, +3, +4...) — doble cuadrado rojo ──
  return (
    <div style={{ minWidth: s.box, height: s.box, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={{
        position: 'absolute',
        inset: -s.gap,
        borderRadius: '3px',
        border: `${s.border}px solid ${GARMIN_COLORS.double}`,
      }} />
      <div style={{
        minWidth: s.box, height: s.box, borderRadius: '2px',
        border: `${s.border}px solid ${GARMIN_COLORS.double}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: baseColor, lineHeight: 1,
        padding: '0 3px',
        fontFamily: '"DM Mono", ui-monospace, monospace',
      }}>
        {score}
      </div>
    </div>
  )
}

export function isHoleInOne(score: number | null | undefined): boolean {
  return score === 1
}

/**
 * Indicador de score sin renderizar el componente — útil para canvas/compartir.
 * Devuelve la forma, colores y weight que debe usar el renderer externo.
 */
export function getScoreIndicator(gross: number, par: number): {
  shape: 'none' | 'circle' | 'double-circle' | 'square' | 'double-square'
  color: string
  fontWeight: number
} {
  const diff = gross - par
  if (diff <= -2) return { shape: 'double-circle', color: GARMIN_COLORS.eagle, fontWeight: 700 }
  if (diff === -1) return { shape: 'circle', color: GARMIN_COLORS.birdie, fontWeight: 600 }
  if (diff === 0) return { shape: 'none', color: '', fontWeight: 600 }
  if (diff === 1) return { shape: 'square', color: GARMIN_COLORS.bogey, fontWeight: 600 }
  return { shape: 'double-square', color: GARMIN_COLORS.double, fontWeight: 600 }
}
