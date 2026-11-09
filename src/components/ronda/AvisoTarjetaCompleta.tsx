'use client'

interface AvisoTarjetaCompletaProps {
  /** Ya no falta ningún hoyo por anotar. */
  completa: boolean
  enUltimoHoyo: boolean
}

/**
 * Aviso fijo sobre la barra inferior del scorer: ya no falta ningún hoyo, solo cerrar la
 * ronda. En el último hoyo reserva su alto aunque todavía no se muestre: si apareciera al
 * anotar, los controles de +/- saltarían bajo el dedo. La región `status` queda montada y
 * cambia su texto: pasar de oculta a visible no lo anuncian todos los lectores de pantalla.
 */
export function AvisoTarjetaCompleta({ completa, enUltimoHoyo }: AvisoTarjetaCompletaProps) {
  if (!completa && !enUltimoHoyo) return null
  return (
    <div
      role="status"
      style={{
        flexShrink: 0, padding: '10px 16px', textAlign: 'center',
        background: completa ? 'var(--bg-surface)' : 'transparent',
        borderTop: `1px solid ${completa ? 'var(--border)' : 'transparent'}`,
        color: 'var(--brand-on-bg)', fontSize: '14px', fontWeight: 600,
      }}
    >
      {completa ? 'Tarjeta completa · Finalizar ronda' : <>&nbsp;</>}
    </div>
  )
}
