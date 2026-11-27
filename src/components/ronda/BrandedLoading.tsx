// Pantalla de carga con marca Golfers+.
// Dos variantes: "dark" (scorer) y "light" (dashboard/viewer).
// Barra indeterminada — no finge progreso.
// Funciona como Server Component (loading.tsx) y en client components.
// Diseño tier-1: solo marca + monograma + mensaje corto + barra.

import { Wordmark } from '@/components/Wordmark'

interface Props {
  message?: string
  variant?: 'light' | 'dark'
}

export function BrandedLoading({
  message = 'Cargando',
  variant = 'light',
}: Props) {
  const isDark = variant === 'dark'
  const bg = isDark ? '#1a1a2e' : 'var(--bg-surface, #fafaf7)'
  const textColor = isDark ? 'rgba(255,255,255,0.5)' : 'var(--text-2, #6b7280)'
  const barTrack = isDark ? 'rgba(255,255,255,0.06)' : 'var(--border, #e5e5e0)'
  const barFill = isDark ? '#c4992a' : 'var(--brand, #c4992a)'

  return (
    <div
      data-theme={isDark ? 'dark' : undefined}
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
          from { opacity: 0 }
          to { opacity: 1 }
        }
      `}</style>

      {/* Marca + monograma integrados */}
      <div style={{
        marginBottom: '32px',
        animation: 'bl-fade 0.3s ease both',
        textAlign: 'center',
      }}>
        <Wordmark size={22} />
      </div>

      {/* Mensaje — una línea, sin explicaciones */}
      <div style={{
        fontSize: '13px', fontWeight: 400,
        color: textColor,
        marginBottom: '20px',
        letterSpacing: '0.02em',
        animation: 'bl-fade 0.3s ease 0.1s both',
      }}>
        {message}
      </div>

      {/* Barra indeterminada */}
      <div style={{
        width: '100%', maxWidth: '180px', height: '2px',
        borderRadius: '1px', background: barTrack,
        overflow: 'hidden',
        animation: 'bl-fade 0.3s ease 0.15s both',
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
