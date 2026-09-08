// Loading screen del scorer — diseñada para cold starts largos (~5-10s).
// En vez de un shimmer mudo, muestra la marca Golfers+ con barra de progreso
// animada que avanza durante 12s. El usuario entiende que algo está cargando
// y no aprieta botones en pánico.

export default function ScorerLoading() {
  return (
    <div
      style={{
        background: '#1a1a2e',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
      }}
      aria-busy="true"
      aria-label="Cargando scorer"
    >
      <style>{`
        @keyframes scorer-progress {
          0% { width: 0% }
          15% { width: 25% }
          40% { width: 55% }
          65% { width: 75% }
          85% { width: 88% }
          100% { width: 96% }
        }
        @keyframes scorer-pulse {
          0%, 100% { opacity: 0.6 }
          50% { opacity: 1 }
        }
        @keyframes scorer-fade-in {
          from { opacity: 0; transform: translateY(8px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>

      {/* Logo / marca */}
      <div
        style={{
          fontSize: '20px',
          fontWeight: 700,
          fontFamily: 'var(--font-playfair), "Playfair Display", serif',
          color: '#c4992a',
          letterSpacing: '0.02em',
          marginBottom: '32px',
          animation: 'scorer-fade-in 0.4s ease both',
        }}
      >
        Golfers<span style={{ fontWeight: 400, color: 'rgba(196,153,42,0.7)' }}>+</span>
      </div>

      {/* Ícono scorer (bandera estilizada) */}
      <div
        style={{
          marginBottom: '24px',
          animation: 'scorer-pulse 2s ease-in-out infinite',
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c4992a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </div>

      {/* Mensaje */}
      <div
        style={{
          fontSize: '15px',
          fontWeight: 500,
          color: 'rgba(255,255,255,0.85)',
          marginBottom: '6px',
          animation: 'scorer-fade-in 0.4s ease 0.1s both',
        }}
      >
        Preparando tu scorer
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'rgba(255,255,255,0.4)',
          marginBottom: '28px',
          animation: 'scorer-fade-in 0.4s ease 0.2s both',
        }}
      >
        Cargando cancha, handicaps y puntajes...
      </div>

      {/* Barra de progreso */}
      <div
        style={{
          width: '100%',
          maxWidth: '240px',
          height: '3px',
          borderRadius: '2px',
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
          animation: 'scorer-fade-in 0.4s ease 0.3s both',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: '2px',
            background: 'linear-gradient(90deg, #c4992a, #d4a94a)',
            animation: 'scorer-progress 12s cubic-bezier(0.4, 0, 0.2, 1) forwards',
          }}
        />
      </div>
    </div>
  )
}
