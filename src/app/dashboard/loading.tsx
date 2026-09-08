// Dashboard loading — diseñado para cold starts largos (~5-10s).
// Marca Golfers+ + mensaje + barra de progreso que cubre 12s.
// El shimmer anterior era mudo y no comunicaba nada durante 9 segundos.

export default function DashboardLoading() {
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
      aria-label="Cargando Mi Golf"
    >
      <style>{`
        @keyframes dash-progress {
          0% { width: 0% }
          15% { width: 25% }
          40% { width: 55% }
          65% { width: 75% }
          85% { width: 88% }
          100% { width: 96% }
        }
        @keyframes dash-pulse {
          0%, 100% { opacity: 0.5 }
          50% { opacity: 1 }
        }
        @keyframes dash-fade-in {
          from { opacity: 0; transform: translateY(8px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>

      {/* Logo */}
      <div
        style={{
          fontSize: '22px',
          fontWeight: 700,
          fontFamily: 'var(--font-playfair), "Playfair Display", serif',
          color: 'var(--brand-on-bg)',
          letterSpacing: '0.02em',
          marginBottom: '32px',
          animation: 'dash-fade-in 0.4s ease both',
        }}
      >
        Golfers<span style={{ fontWeight: 400, opacity: 0.7 }}>+</span>
      </div>

      {/* Ícono golf */}
      <div
        style={{
          marginBottom: '24px',
          animation: 'dash-pulse 2s ease-in-out infinite',
          color: 'var(--brand-on-bg)',
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      </div>

      {/* Mensaje */}
      <div
        style={{
          fontSize: '15px',
          fontWeight: 500,
          color: 'var(--text)',
          marginBottom: '6px',
          animation: 'dash-fade-in 0.4s ease 0.1s both',
        }}
      >
        Cargando tu golf
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--text-2)',
          marginBottom: '28px',
          animation: 'dash-fade-in 0.4s ease 0.2s both',
        }}
      >
        Rondas, estadísticas y handicap...
      </div>

      {/* Barra de progreso */}
      <div
        style={{
          width: '100%',
          maxWidth: '240px',
          height: '3px',
          borderRadius: '2px',
          background: 'var(--border)',
          overflow: 'hidden',
          animation: 'dash-fade-in 0.4s ease 0.3s both',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: '2px',
            background: 'var(--brand)',
            animation: 'dash-progress 12s cubic-bezier(0.4, 0, 0.2, 1) forwards',
          }}
        />
      </div>
    </div>
  )
}
