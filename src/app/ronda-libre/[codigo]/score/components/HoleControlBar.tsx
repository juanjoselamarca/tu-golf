'use client'

/**
 * Barra de controles +/- para ajustar el score del hoyo actual.
 * Componente puro de presentación — toda la lógica (score actual, par del hoyo,
 * disabled bounds) vive en el caller via los callbacks onIncrement/onDecrement.
 *
 * Tokens de color para el botón "-" se pasan como props porque page.tsx tiene
 * un objeto theme local que puede cambiar entre light/dark (auth pages fijas).
 */

interface HoleControlBarProps {
  score: number | undefined
  onIncrement: () => void
  onDecrement: () => void
  decrementBg: string
  decrementColor: string
  decrementBorder: string
}

export function HoleControlBar({
  score,
  onIncrement,
  onDecrement,
  decrementBg,
  decrementColor,
  decrementBorder,
}: HoleControlBarProps) {
  const decrementDisabled = score != null && score <= 1
  const incrementDisabled = score != null && score >= 15

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '8px 20px 12px', flexShrink: 0 }}>
      <button
        className="ctrl-btn"
        onTouchStart={() => {}}
        onClick={onDecrement}
        disabled={decrementDisabled}
        aria-label="Disminuir score"
        style={{
          width: '80px', height: '80px', borderRadius: '20px',
          fontSize: '32px', fontWeight: 300,
          background: decrementBg, color: decrementColor,
          border: `1px solid ${decrementBorder}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          userSelect: 'none', transition: 'transform 0.08s ease-out',
          opacity: decrementDisabled ? 0.3 : 1,
          minHeight: 0, minWidth: 0,
        }}
      >{'−'}</button>
      <button
        className="ctrl-btn"
        onTouchStart={() => {}}
        onClick={onIncrement}
        disabled={incrementDisabled}
        aria-label="Aumentar score"
        style={{
          width: '80px', height: '80px', borderRadius: '20px',
          fontSize: '32px', fontWeight: 600,
          background: '#C4992A', color: '#ffffff', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          userSelect: 'none', transition: 'transform 0.08s ease-out',
          opacity: incrementDisabled ? 0.3 : 1,
          minHeight: 0, minWidth: 0,
        }}
      >+</button>
    </div>
  )
}
