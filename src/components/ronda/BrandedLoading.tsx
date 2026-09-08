// Pantalla de carga con marca para las rutas de ronda y el dashboard.
// Dos variantes: "dark" (scorer, fondo #1a1a2e) y "light" (viewer/dashboard).
//
// Barra indeterminada (loop infinito) — no finge progreso que no existe.
// Se usa tanto en loading.tsx de Next.js como en estados internos de client
// components, así la transición entre ambas capas es imperceptible.
//
// No es 'use client' a propósito: debe funcionar como Server Component en
// loading.tsx Y como import en client components (ambos contextos).

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
  const bg = isDark ? '#1a1a2e' : 'var(--bg-surface, #fafaf7)'
  const brandColor = isDark ? '#c4992a' : 'var(--brand-on-bg, #a07c1c)'
  const brandFaint = isDark ? 'rgba(196,153,42,0.7)' : undefined
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : 'var(--text, #1a1a2e)'
  const textFaint = isDark ? 'rgba(255,255,255,0.4)' : 'var(--text-2, #6b7280)'
  const barTrack = isDark ? 'rgba(255,255,255,0.06)' : 'var(--border, #e5e5e0)'
  const barFill = isDark ? '#c4992a' : 'var(--brand, #c4992a)'

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
        @keyframes bl-slide {
          0% { transform: translateX(-100%) }
          100% { transform: translateX(250%) }
        }
        @keyframes bl-pulse {
          0%, 100% { opacity: 0.4 }
          50% { opacity: 1 }
        }
        @keyframes bl-fade {
          from { opacity: 0; transform: translateY(6px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>

      {/* Logo */}
      <div style={{
        fontSize: '20px', fontWeight: 700,
        fontFamily: 'var(--font-playfair, Georgia), "Playfair Display", serif',
        color: brandColor, letterSpacing: '0.02em',
        marginBottom: '28px',
        animation: 'bl-fade 0.4s ease both',
      }}>
        Golfers<span style={{ fontWeight: 400, ...(brandFaint ? { color: brandFaint } : { opacity: 0.7 }) }}>+</span>
      </div>

      {/* Ícono bandera pulsando */}
      <div style={{
        marginBottom: '20px',
        animation: 'bl-pulse 2.4s ease-in-out infinite',
        color: brandColor,
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </div>

      {/* Mensaje */}
      <div style={{
        fontSize: '15px', fontWeight: 500,
        color: textColor, marginBottom: '5px',
        animation: 'bl-fade 0.4s ease 0.1s both',
      }}>
        {message}
      </div>

      {/* Detalle */}
      <div style={{
        fontSize: '12px', color: textFaint,
        marginBottom: '24px',
        animation: 'bl-fade 0.4s ease 0.2s both',
      }}>
        {detail}
      </div>

      {/* Barra indeterminada — loop suave, no finge progreso */}
      <div style={{
        width: '100%', maxWidth: '200px', height: '2px',
        borderRadius: '1px', background: barTrack,
        overflow: 'hidden',
        animation: 'bl-fade 0.4s ease 0.3s both',
      }}>
        <div style={{
          width: '40%', height: '100%', borderRadius: '1px',
          background: barFill,
          animation: 'bl-slide 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        }} />
      </div>
    </div>
  )
}
