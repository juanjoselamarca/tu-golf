'use client'

// Pantalla de carga con marca para las rutas de ronda.
// Reemplaza los "Cargando ronda..." en texto plano que se veían durante
// 2-8 segundos mientras el client component fetcheaba datos.
//
// Variante "dark" para scorer (fondo #1a1a2e), "light" para viewer/leaderboard.

interface Props {
  message?: string
  detail?: string
  variant?: 'light' | 'dark'
}

export function BrandedLoading({
  message = 'Cargando ronda',
  detail = 'Jugadores, cancha y puntajes...',
  variant = 'light',
}: Props) {
  const isDark = variant === 'dark'
  const bg = isDark ? '#1a1a2e' : 'var(--bg-surface)'
  const brandColor = isDark ? '#c4992a' : 'var(--brand-on-bg)'
  const brandFaint = isDark ? 'rgba(196,153,42,0.7)' : undefined
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : 'var(--text)'
  const textFaint = isDark ? 'rgba(255,255,255,0.4)' : 'var(--text-2)'
  const barTrack = isDark ? 'rgba(255,255,255,0.08)' : 'var(--border)'
  const barFill = isDark ? 'linear-gradient(90deg, #c4992a, #d4a94a)' : 'var(--brand)'
  const prefix = isDark ? 'bl-dark' : 'bl-light'

  return (
    <div
      style={{
        background: bg,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}
      aria-busy="true"
    >
      <style>{`
        @keyframes ${prefix}-progress {
          0% { width: 0% }
          15% { width: 25% }
          40% { width: 55% }
          65% { width: 75% }
          85% { width: 88% }
          100% { width: 96% }
        }
        @keyframes ${prefix}-pulse {
          0%, 100% { opacity: 0.5 }
          50% { opacity: 1 }
        }
        @keyframes ${prefix}-fade {
          from { opacity: 0; transform: translateY(6px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>

      {/* Logo */}
      <div style={{
        fontSize: '20px', fontWeight: 700,
        fontFamily: 'var(--font-playfair), "Playfair Display", serif',
        color: brandColor, letterSpacing: '0.02em',
        marginBottom: '28px',
        animation: `${prefix}-fade 0.4s ease both`,
      }}>
        Golfers<span style={{ fontWeight: 400, ...(brandFaint ? { color: brandFaint } : { opacity: 0.7 }) }}>+</span>
      </div>

      {/* Ícono bandera pulsando */}
      <div style={{
        marginBottom: '20px',
        animation: `${prefix}-pulse 2s ease-in-out infinite`,
        color: brandColor,
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </div>

      {/* Mensaje principal */}
      <div style={{
        fontSize: '15px', fontWeight: 500,
        color: textColor, marginBottom: '5px',
        animation: `${prefix}-fade 0.4s ease 0.1s both`,
      }}>
        {message}
      </div>

      {/* Detalle */}
      <div style={{
        fontSize: '12px', color: textFaint,
        marginBottom: '24px',
        animation: `${prefix}-fade 0.4s ease 0.2s both`,
      }}>
        {detail}
      </div>

      {/* Barra de progreso */}
      <div style={{
        width: '100%', maxWidth: '200px', height: '2px',
        borderRadius: '1px', background: barTrack,
        overflow: 'hidden',
        animation: `${prefix}-fade 0.4s ease 0.3s both`,
      }}>
        <div style={{
          height: '100%', borderRadius: '1px',
          background: barFill,
          animation: `${prefix}-progress 12s cubic-bezier(0.4, 0, 0.2, 1) forwards`,
        }} />
      </div>
    </div>
  )
}
