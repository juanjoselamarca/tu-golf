'use client'

import { useState } from 'react'
import { ConfirmarFinalizarHoja } from '@/components/ronda/ConfirmarFinalizarHoja'

export const DETALLE_RETIRO = 'Pierde los hoyos que no juegue: en cada uno queda último. Los demás siguen jugando.'

interface Jugador {
  id: string
  nombre: string
  /** Hoyo desde el que está retirado, o `null`. */
  retiradoDesde: number | null
  /** Desde qué hoyo se retiraría si se va ahora (`hoyoDesdeElQueSeRetira`); `null` = ya anotó todos. */
  desdeSiSeVa: number | null
}

/**
 * Retiro de un jugador desde el scorer de grupo de una Timba (spec, "Hoyo pendiente y retiro"): siempre con
 * confirmación, porque le hace perder los hoyos que quedan. Se puede deshacer (se equivocaron de jugador).
 */
export function RetiroDeJugadores({ jugadores, ocupado, onRetirar }: {
  jugadores: readonly Jugador[]
  ocupado: boolean
  onRetirar: (jugadorId: string, desde: number | null) => Promise<boolean>
}) {
  const [confirmando, setConfirmando] = useState<{ id: string; nombre: string; desde: number } | null>(null)
  const candidatos = jugadores.filter(j => j.retiradoDesde != null || j.desdeSiSeVa != null)
  if (candidatos.length === 0) return null

  return (
    <section aria-label="Retiros" style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-2)' }}>¿Alguien se va antes?</h3>
      {candidatos.map(j => j.retiradoDesde != null ? (
        <div key={j.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minHeight: '48px' }}>
          <span style={{ fontSize: '15px', color: 'var(--text)' }}>{j.nombre} se retiró en el hoyo {j.retiradoDesde}</span>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => { void onRetirar(j.id, null) }}
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
          onClick={() => setConfirmando({ id: j.id, nombre: j.nombre, desde: j.desdeSiSeVa as number })}
          style={{ minHeight: '48px', borderRadius: '10px', border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '15px', fontWeight: 500, textAlign: 'left', padding: '0 14px', cursor: 'pointer' }}
        >
          Retirar a {j.nombre}
        </button>
      ))}

      {confirmando && (
        <ConfirmarFinalizarHoja
          titulo={`¿${confirmando.nombre} se retira desde el hoyo ${confirmando.desde}?`}
          detalle={DETALLE_RETIRO}
          textoConfirmar="Retirar"
          onConfirmar={() => {
            const { id, desde } = confirmando
            setConfirmando(null)
            void onRetirar(id, desde)
          }}
          onCancelar={() => setConfirmando(null)}
        />
      )}
    </section>
  )
}
