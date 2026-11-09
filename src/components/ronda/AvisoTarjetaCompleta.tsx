'use client'

/** Aviso fijo sobre la barra inferior del scorer: ya no falta ningún hoyo, solo cerrar la ronda. */
export function AvisoTarjetaCompleta() {
  return (
    <div
      role="status"
      style={{
        flexShrink: 0, padding: '10px 16px', textAlign: 'center',
        background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
        color: 'var(--brand-on-bg)', fontSize: '14px', fontWeight: 600,
      }}
    >
      Tarjeta completa · Finalizar ronda
    </div>
  )
}
