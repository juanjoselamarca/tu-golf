// Loading screen del scorer por equipo.
// Misma experiencia que el scorer individual: marca + mensaje + barra.

export default function ScoreGrupoLoading() {
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
      aria-label="Cargando scorer de equipo"
    >
      <style>{`
        @keyframes sg-progress {
          0% { width: 0% }
          15% { width: 25% }
          40% { width: 55% }
          65% { width: 75% }
          85% { width: 88% }
          100% { width: 96% }
        }
        @keyframes sg-pulse {
          0%, 100% { opacity: 0.6 }
          50% { opacity: 1 }
        }
        @keyframes sg-fade-in {
          from { opacity: 0; transform: translateY(8px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>

      <div
        style={{
          fontSize: '20px',
          fontWeight: 700,
          fontFamily: 'var(--font-playfair), "Playfair Display", serif',
          color: '#c4992a',
          letterSpacing: '0.02em',
          marginBottom: '32px',
          animation: 'sg-fade-in 0.4s ease both',
        }}
      >
        Golfers<span style={{ fontWeight: 400, color: 'rgba(196,153,42,0.7)' }}>+</span>
      </div>

      <div
        style={{
          marginBottom: '24px',
          animation: 'sg-pulse 2s ease-in-out infinite',
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c4992a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>

      <div
        style={{
          fontSize: '15px',
          fontWeight: 500,
          color: 'rgba(255,255,255,0.85)',
          marginBottom: '6px',
          animation: 'sg-fade-in 0.4s ease 0.1s both',
        }}
      >
        Preparando scorer de equipo
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'rgba(255,255,255,0.4)',
          marginBottom: '28px',
          animation: 'sg-fade-in 0.4s ease 0.2s both',
        }}
      >
        Cargando equipos, cancha y puntajes...
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '240px',
          height: '3px',
          borderRadius: '2px',
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
          animation: 'sg-fade-in 0.4s ease 0.3s both',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: '2px',
            background: 'linear-gradient(90deg, #c4992a, #d4a94a)',
            animation: 'sg-progress 12s cubic-bezier(0.4, 0, 0.2, 1) forwards',
          }}
        />
      </div>
    </div>
  )
}
