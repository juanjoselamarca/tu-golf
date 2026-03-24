'use client'

/**
 * ScoreSymbol — Renderiza un score de golf con el formato estándar PGA:
 * - Eagle o mejor: número dentro de doble círculo (dorado)
 * - Birdie: número dentro de un círculo (dorado)
 * - Par: número solo, sin forma
 * - Bogey: número dentro de un cuadrado (rojo)
 * - Double bogey o peor: número dentro de doble cuadrado (rojo)
 * - Hole-in-one: dorado permanente con brillo
 */

interface ScoreSymbolProps {
  score: number | null | undefined
  par: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
  theme?: 'dark' | 'light'
}

const SIZES = {
  sm: { box: 28, font: 12, border: 1, gap: 2 },
  md: { box: 36, font: 15, border: 1.5, gap: 2.5 },
  lg: { box: 44, font: 18, border: 1.5, gap: 3 },
}

export default function ScoreSymbol({ score, par, size = 'md', theme = 'dark' }: ScoreSymbolProps) {
  const s = SIZES[size]
  const isHoleInOne = score === 1
  const isDark = theme === 'dark'

  if (score == null || par == null) {
    return (
      <div style={{
        width: s.box, height: s.box,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600,
        color: isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db',
      }}>
        ·
      </div>
    )
  }

  const diff = score - par

  // Colors
  const circleColor = isDark ? '#c4992a' : '#b8860b'
  const squareColor = isDark ? '#dc2626' : '#dc2626'
  const textColor = isHoleInOne
    ? '#c4992a'
    : isDark ? 'rgba(255,255,255,0.85)' : '#374151'

  // Determine shape: circle (under par), square (over par), none (par)
  const isCircle = diff < 0
  const isSquare = diff > 0
  const isDouble = Math.abs(diff) >= 2

  // Hole-in-one gets golden glow
  const aceGlow = isHoleInOne ? {
    boxShadow: '0 0 8px rgba(196,153,42,0.6), 0 0 16px rgba(196,153,42,0.3)',
  } : {}

  if (diff === 0) {
    // Par — just the number
    return (
      <div style={{
        width: s.box, height: s.box,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 600,
        color: textColor,
      }}>
        {score}
      </div>
    )
  }

  if (isCircle) {
    // Birdie (1 circle) or Eagle+ (2 circles)
    const borderColor = circleColor
    return (
      <div style={{
        width: s.box, height: s.box,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {/* Outer circle (only for eagle/albatross — double circle) */}
        {isDouble && (
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            border: `${s.border}px solid ${borderColor}`,
            ...aceGlow,
          }} />
        )}
        {/* Inner circle (always for under par) */}
        <div style={{
          width: isDouble ? s.box - (s.gap * 2 + s.border * 2) : s.box,
          height: isDouble ? s.box - (s.gap * 2 + s.border * 2) : s.box,
          borderRadius: '50%',
          border: `${s.border}px solid ${borderColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.font, fontWeight: 700,
          color: textColor,
          ...(!isDouble ? aceGlow : {}),
        }}>
          {score}
        </div>
      </div>
    )
  }

  // Square — Bogey (1 square) or Double+ (2 squares)
  return (
    <div style={{
      width: s.box, height: s.box,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      {/* Outer square (only for double bogey or worse) */}
      {isDouble && (
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '3px',
          border: `${s.border}px solid ${squareColor}`,
        }} />
      )}
      {/* Inner square (always for over par) */}
      <div style={{
        width: isDouble ? s.box - (s.gap * 2 + s.border * 2) : s.box,
        height: isDouble ? s.box - (s.gap * 2 + s.border * 2) : s.box,
        borderRadius: '3px',
        border: `${s.border}px solid ${squareColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.font, fontWeight: 700,
        color: textColor,
      }}>
        {score}
      </div>
    </div>
  )
}

/**
 * Detect if a score is a hole-in-one
 */
export function isHoleInOne(score: number | null | undefined): boolean {
  return score === 1
}
