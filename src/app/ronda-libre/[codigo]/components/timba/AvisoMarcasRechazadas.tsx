'use client'

/**
 * Marcas que el servidor rechazó para siempre (`reenviarPuntitosPendientes` → `rechazadas`): ya salieron de la
 * cola y no cuentan. En un juego con plata no pueden desaparecer en silencio: se le avisan al grupo hasta que
 * alguien toque "Entendido".
 */
export function AvisoMarcasRechazadas({ lineas, onEntendido }: { lineas: readonly string[]; onEntendido: () => void }) {
  if (lineas.length === 0) return null
  return (
    <div
      role="alert"
      style={{ margin: '8px 8px 0', padding: '12px', borderRadius: '12px', background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.45 }}
    >
      <strong>{lineas.length === 1 ? 'Esta marca no se guardó y no cuenta:' : 'Estas marcas no se guardaron y no cuentan:'}</strong>
      <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
        {lineas.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
      <button
        type="button"
        onClick={onEntendido}
        style={{ marginTop: '8px', minHeight: '44px', padding: '0 16px', borderRadius: '10px', border: '1px solid var(--error-border)', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
      >
        Entendido
      </button>
    </div>
  )
}
