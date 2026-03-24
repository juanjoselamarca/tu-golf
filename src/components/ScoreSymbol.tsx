'use client'

/**
 * ScoreSymbol — Formato estándar PGA completo:
 * - Hole-in-one (1): dorado relleno con doble outline
 * - Albatross (-3+): azul relleno con doble círculo
 * - Eagle (-2): doble círculo dorado vacío
 * - Birdie (-1): círculo dorado simple vacío
 * - Par (0): número solo
 * - Bogey (+1): cuadrado rojo simple vacío
 * - Double bogey (+2): doble cuadrado rojo vacío
 * - Triple bogey+ (+3+): cuadrado rojo relleno, número blanco
 */

interface ScoreSymbolProps {
  score: number | null | undefined
  par: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
  theme?: 'dark' | 'light'
}

const SIZES = {
  sm: { box: 22, font: 11, border: 1, gap: 4 },
  md: { box: 28, font: 13, border: 1.5, gap: 4 },
  lg: { box: 36, font: 16, border: 1.5, gap: 5 },
}

export default function ScoreSymbol({ score, par, size = 'md', theme = 'dark' }: ScoreSymbolProps) {
  const s = SIZES[size]
  const isDark = theme === 'dark'
  const baseColor = isDark ? 'rgba(255,255,255,0.85)' : '#374151'
  const mutedColor = isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db'

  // No score
  if (score == null || par == null) {
    return (
      <div style={{ width: s.box, height: s.box, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: s.font, color: mutedColor }}>
        ·
      </div>
    )
  }

  const diff = score - par
  const isAce = score === 1

  // ── HOLE-IN-ONE — dorado relleno, doble outline ──
  if (isAce) {
    return (
      <div style={{ width: s.box, height: s.box, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: -s.gap, borderRadius: '50%', border: `${s.border}px solid #c4992a` }} />
        <div style={{
          width: s.box, height: s.box, borderRadius: '50%',
          background: '#c4992a', border: `${s.border}px solid #c4992a`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.font, fontWeight: 800, color: '#070d18', lineHeight: 1,
        }}>
          {score}
        </div>
      </div>
    )
  }

  // ── ALBATROSS (-3 o mejor) — azul relleno, doble círculo ──
  if (diff <= -3) {
    return (
      <div style={{ width: s.box, height: s.box, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: -s.gap, borderRadius: '50%', border: `${s.border}px solid #60A5FA` }} />
        <div style={{
          width: s.box, height: s.box, borderRadius: '50%',
          background: '#60A5FA', border: `${s.border}px solid #60A5FA`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.font, fontWeight: 700, color: '#ffffff', lineHeight: 1,
        }}>
          {score}
        </div>
      </div>
    )
  }

  // ── EAGLE (-2) — doble círculo dorado vacío ──
  if (diff === -2) {
    return (
      <div style={{ width: s.box, height: s.box, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: -s.gap, borderRadius: '50%', border: `${s.border}px solid #c4992a` }} />
        <div style={{
          width: s.box, height: s.box, borderRadius: '50%',
          border: `${s.border}px solid #c4992a`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.font, fontWeight: 700, color: baseColor, lineHeight: 1,
        }}>
          {score}
        </div>
      </div>
    )
  }

  // ── BIRDIE (-1) — círculo dorado simple vacío ──
  if (diff === -1) {
    return (
      <div style={{
        width: s.box, height: s.box, borderRadius: '50%',
        border: `${s.border}px solid #c4992a`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: baseColor, lineHeight: 1,
      }}>
        {score}
      </div>
    )
  }

  // ── PAR — número solo ──
  if (diff === 0) {
    return (
      <div style={{
        width: s.box, height: s.box,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: baseColor, lineHeight: 1,
      }}>
        {score}
      </div>
    )
  }

  // ── BOGEY (+1) — cuadrado rojo simple vacío ──
  if (diff === 1) {
    return (
      <div style={{
        minWidth: s.box, height: s.box, borderRadius: '2px',
        border: `${s.border}px solid #EF4444`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600, color: baseColor, lineHeight: 1,
        padding: '0 2px',
      }}>
        {score}
      </div>
    )
  }

  // ── DOUBLE BOGEY (+2) — doble cuadrado rojo vacío ──
  if (diff === 2) {
    return (
      <div style={{ minWidth: s.box, height: s.box, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: -s.gap, borderRadius: '3px', border: `${s.border}px solid #EF4444` }} />
        <div style={{
          minWidth: s.box, height: s.box, borderRadius: '2px',
          border: `${s.border}px solid #EF4444`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.font, fontWeight: 600, color: baseColor, lineHeight: 1,
          padding: '0 2px',
        }}>
          {score}
        </div>
      </div>
    )
  }

  // ── TRIPLE BOGEY+ (+3 o peor) — cuadrado rojo RELLENO, número blanco ──
  return (
    <div style={{
      minWidth: s.box, height: s.box, borderRadius: '2px',
      background: '#DC2626',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: s.font, fontWeight: 700, color: '#ffffff', lineHeight: 1,
      padding: '0 2px',
    }}>
      {score}
    </div>
  )
}

export function isHoleInOne(score: number | null | undefined): boolean {
  return score === 1
}

/** Returns inline style info for rendering score indicators without the component */
export function getScoreIndicator(gross: number, par: number): {
  shape: 'none' | 'circle' | 'double-circle' | 'filled-circle' | 'square' | 'double-square' | 'filled-square'
  borderColor: string
  background: string
  textColor: string
  fontWeight: number
} {
  const diff = gross - par
  if (gross === 1) return { shape: 'filled-circle', borderColor: '#c4992a', background: '#c4992a', textColor: '#070d18', fontWeight: 800 }
  if (diff <= -3) return { shape: 'filled-circle', borderColor: '#60A5FA', background: '#60A5FA', textColor: '#ffffff', fontWeight: 700 }
  if (diff === -2) return { shape: 'double-circle', borderColor: '#c4992a', background: 'transparent', textColor: '', fontWeight: 700 }
  if (diff === -1) return { shape: 'circle', borderColor: '#c4992a', background: 'transparent', textColor: '', fontWeight: 600 }
  if (diff === 0) return { shape: 'none', borderColor: '', background: 'transparent', textColor: '', fontWeight: 600 }
  if (diff === 1) return { shape: 'square', borderColor: '#EF4444', background: 'transparent', textColor: '', fontWeight: 600 }
  if (diff === 2) return { shape: 'double-square', borderColor: '#EF4444', background: 'transparent', textColor: '', fontWeight: 600 }
  return { shape: 'filled-square', borderColor: '#DC2626', background: '#DC2626', textColor: '#ffffff', fontWeight: 700 }
}
