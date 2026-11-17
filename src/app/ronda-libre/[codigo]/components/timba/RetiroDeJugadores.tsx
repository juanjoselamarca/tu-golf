'use client'

interface Jugador {
  id: string
  nombre: string
  /** Hoyo desde el que está retirado, o `null`. */
  retiradoDesde: number | null
  /** Desde qué hoyo se retiraría si se va ahora (`hoyoDesdeElQueSeRetira`); `null` = ya anotó todos. */
  desdeSiSeVa: number | null
}

/**
 * Retiros al pie de la pestaña Juego de una Timba (spec, "Hoyo pendiente y retiro"). Retirar abre la hoja de
 * confirmación (`HojaDeRetiro`, la misma que desde la tarjeta del jugador), porque le hace perder los hoyos que
 * quedan. Se puede deshacer (se equivocaron de jugador). Separado de "Descartar ronda" con aire de sobra.
 */
export function RetiroDeJugadores({ jugadores, ocupado, onPedirRetiro, onDeshacer }: {
  jugadores: readonly Jugador[]
  ocupado: boolean
  onPedirRetiro: (jugadorId: string) => void
  onDeshacer: (jugadorId: string) => void
}) {
  const candidatos = jugadores.filter(j => j.retiradoDesde != null || j.desdeSiSeVa != null)
  if (candidatos.length === 0) return null

  return (
    <section aria-label="Retiros" style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', marginBottom: '32px', borderTop: '1px solid var(--border)' }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-2)' }}>¿Alguien se va antes?</h3>
      {candidatos.map(j => j.retiradoDesde != null ? (
        <div key={j.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minHeight: '48px' }}>
          <span style={{ fontSize: '15px', color: 'var(--text)' }}>{j.nombre} se retiró en el hoyo {j.retiradoDesde}</span>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onDeshacer(j.id)}
            style={{ minHeight: '44px', padding: '0 14px', borderRadius: '10px', border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
          >
            Deshacer
          </button>
        </div>
      ) : (
        <button
          key={j.id}
          type="button"
          disabled={ocupado}
          onClick={() => onPedirRetiro(j.id)}
          style={{ minHeight: '48px', borderRadius: '10px', border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '15px', fontWeight: 500, textAlign: 'left', padding: '0 14px', cursor: 'pointer' }}
        >
          Retirar a {j.nombre}
        </button>
      ))}
    </section>
  )
}
