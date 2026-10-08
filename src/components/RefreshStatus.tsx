// Countdown del polling de las vistas en vivo ("Actualiza en Ns" + barra).
// Compartido entre ronda libre y torneo en-vivo. Sin Supabase Realtime desde el
// incidente del torneo Los Leones (04-oct-2026): la actualización es siempre por polling.
export function RefreshStatus({ countdown, maxCountdown = 15, onRefresh }: {
  countdown: number; maxCountdown?: number; onRefresh?: () => void
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{
          color: 'var(--text-3)',
          fontSize: '13px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {`Actualiza en ${countdown}s`}
        </span>
        {onRefresh ? (
          <button
            onClick={onRefresh}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--brand-on-bg)', fontSize: '11px', fontWeight: 500,
              padding: '2px 6px', borderRadius: '4px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2, rgba(0,0,0,0.05))')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            ↻ Actualizar
          </button>
        ) : (
          <span style={{ color: 'var(--brand-on-bg)', fontSize: '11px' }}>
            Auto-refresh
          </span>
        )}
      </div>
      <div style={{
        width: '100%', height: '4px',
        background: 'var(--border)',
        borderRadius: '2px', overflow: 'hidden',
      }}>
        <div style={{
          width: `${(countdown / maxCountdown) * 100}%`,
          height: '100%',
          background: countdown <= 3 ? 'var(--status-live-fg)' : 'var(--brand)',
          borderRadius: '2px',
          transition: 'width 1s linear, background 0.3s',
        }} />
      </div>
    </div>
  )
}
