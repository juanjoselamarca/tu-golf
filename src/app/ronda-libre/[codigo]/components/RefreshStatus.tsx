// Estado de realtime / countdown del polling fallback. Verbatim del monolito.
export function RefreshStatus({ isRealtimeConnected, countdown }: { isRealtimeConnected: boolean; countdown: number }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{
          color: isRealtimeConnected ? '#16a34a' : '#6b7280',
          fontSize: '13px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {isRealtimeConnected ? (
            <>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#16a34a', display: 'inline-block',
                animation: 'livePulse 1.8s ease-in-out infinite',
              }} />
              En vivo
            </>
          ) : `Actualiza en ${countdown}s`}
        </span>
        <span style={{ color: '#c4992a', fontSize: '11px' }}>
          {isRealtimeConnected ? 'Tiempo real' : 'Auto-refresh'}
        </span>
      </div>
      {!isRealtimeConnected && (
        <div style={{
          width: '100%', height: '4px',
          background: '#e5e7eb',
          borderRadius: '2px', overflow: 'hidden',
        }}>
          <div style={{
            width: `${(countdown / 15) * 100}%`,
            height: '100%',
            background: countdown <= 3 ? '#16a34a' : '#c4992a',
            borderRadius: '2px',
            transition: 'width 1s linear, background 0.3s',
          }} />
        </div>
      )}
    </div>
  )
}
