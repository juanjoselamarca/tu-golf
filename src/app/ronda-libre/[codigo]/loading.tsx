// Loading screen de la ronda libre (leaderboard/viewer).
// Cold start de Vercel puede tomar 5-10s — barra de progreso animada.

export default function RondaLoading() {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
      }}
      aria-busy="true"
      aria-label="Cargando ronda"
    >
      <style>{`
        @keyframes ronda-progress {
          0% { width: 0% }
          15% { width: 25% }
          40% { width: 55% }
          65% { width: 75% }
          85% { width: 88% }
          100% { width: 96% }
        }
        @keyframes ronda-pulse {
          0%, 100% { opacity: 0.5 }
          50% { opacity: 1 }
        }
        @keyframes ronda-fade-in {
          from { opacity: 0; transform: translateY(8px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>

      <div
        style={{
          fontSize: '20px',
          fontWeight: 700,
          fontFamily: 'var(--font-playfair), "Playfair Display", serif',
          color: 'var(--brand-on-bg)',
          letterSpacing: '0.02em',
          marginBottom: '32px',
          animation: 'ronda-fade-in 0.4s ease both',
        }}
      >
        Golfers<span style={{ fontWeight: 400, opacity: 0.7 }}>+</span>
      </div>

      <div
        style={{
          marginBottom: '24px',
          animation: 'ronda-pulse 2s ease-in-out infinite',
          color: 'var(--brand-on-bg)',
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      </div>

      <div
        style={{
          fontSize: '15px',
          fontWeight: 500,
          color: 'var(--text)',
          marginBottom: '6px',
          animation: 'ronda-fade-in 0.4s ease 0.1s both',
        }}
      >
        Cargando ronda
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--text-2)',
          marginBottom: '28px',
          animation: 'ronda-fade-in 0.4s ease 0.2s both',
        }}
      >
        Leaderboard, jugadores y puntajes...
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '240px',
          height: '3px',
          borderRadius: '2px',
          background: 'var(--border)',
          overflow: 'hidden',
          animation: 'ronda-fade-in 0.4s ease 0.3s both',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: '2px',
            background: 'var(--brand)',
            animation: 'ronda-progress 12s cubic-bezier(0.4, 0, 0.2, 1) forwards',
          }}
        />
      </div>
    </div>
  )
}
