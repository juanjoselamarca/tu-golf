import Link from 'next/link'

/** Invitación a importar el historial (FedeGolf, Garmin, CSV). */
export function SyncHistorialBlock() {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '16px 18px',
      marginBottom: '16px',
    }}>
      <div style={{
        fontSize: '10px', fontWeight: 700, color: 'var(--text-3)',
        fontFamily: '"DM Mono", monospace',
        letterSpacing: '0.12em', textTransform: 'uppercase',
        marginBottom: '6px',
      }}>
        Sincronización
      </div>
      <div style={{
        fontFamily: '"Playfair Display", serif',
        fontSize: '17px', color: 'var(--text)', fontWeight: 600,
        marginBottom: '4px', letterSpacing: '-0.01em',
      }}>
        Trae tu historial completo
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Importa tus rondas desde FedeGolf, Garmin Connect o un CSV — el Índice Golfers+ y CPI™ se recalculan automáticamente.
      </p>
      <Link
        href="/importar"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '44px', padding: '0 18px',
          background: 'transparent', border: '1px solid rgba(196,153,42,0.6)',
          color: 'var(--brand-on-bg)', borderRadius: '12px',
          fontSize: '13px', fontWeight: 600, textDecoration: 'none',
        }}
      >
        Importar historial →
      </Link>
    </div>
  )
}
