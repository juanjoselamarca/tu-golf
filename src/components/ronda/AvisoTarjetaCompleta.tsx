'use client'

interface AvisoTarjetaCompletaProps {
  /** Ya no falta ningún hoyo por anotar. */
  completa: boolean
  enUltimoHoyo: boolean
}

/**
 * Aviso fijo sobre la barra inferior del scorer: ya no falta ningún hoyo, solo cerrar la
 * ronda. En el último hoyo reserva su alto aunque todavía no se muestre: si apareciera al
 * anotar, los controles de +/- saltarían bajo el dedo.
 */
export function AvisoTarjetaCompleta({ completa, enUltimoHoyo }: AvisoTarjetaCompletaProps) {
  if (!completa && !enUltimoHoyo) return null
  return (
    <div
      role="status"
      style={{
        visibility: completa ? 'visible' : 'hidden',
        flexShrink: 0, padding: '10px 16px', textAlign: 'center',
        background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
        color: 'var(--brand-on-bg)', fontSize: '14px', fontWeight: 600,
      }}
    >
      Tarjeta completa · Finalizar ronda
    </div>
  )
}
