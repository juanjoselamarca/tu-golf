'use client'

import type { PuntitoConfig } from '@/golf/formats/personalizado'
import type { MarcasDeUnPuntito } from '@/golf/ronda-libre/marcas-de-la-timba'

/**
 * Marcar puntos especiales en el hoyo, desde el scorer de grupo de una Timba (spec, "Puntos especiales"). Un botón
 * por jugador y punto, de 48 px, que se marca con ✓ y borde (no solo color). Si el motor dice que una marca no
 * cuenta, se ve "No cuenta" con su razón: la marca nunca se borra sola.
 */
export function PuntosEspecialesDelHoyo(props: {
  hoyo: number
  grupos: readonly MarcasDeUnPuntito[]
  nombres: Readonly<Record<string, string>>
  /** Jugadores retirados en este hoyo: no ganan puntos especiales, no se les ofrecen. */
  retirados: ReadonlySet<string>
  birdieAutomatico: boolean
  onAlternar: (jugadorId: string, puntito: PuntitoConfig) => void
}) {
  const { hoyo, grupos, nombres, retirados, birdieAutomatico, onAlternar } = props
  if (grupos.length === 0) return null
  return (
    <section
      aria-label={`Puntos especiales del hoyo ${hoyo}`}
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Puntos especiales</h3>
        {birdieAutomatico && <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>El birdie se suma solo</span>}
      </div>
      {grupos.map(g => (
        <div key={g.puntito.id} role="group" aria-label={g.nombre} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>
            {g.nombre} <span style={{ fontWeight: 500 }}>+{g.puntito.valor}</span>
            {g.puntito.tipo === 'greenie' && <span style={{ fontWeight: 500 }}> · uno por hoyo</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
            {g.jugadores.filter(j => !retirados.has(j.jugadorId)).map(j => {
              const nombre = nombres[j.jugadorId] ?? ''
              return (
                <div key={j.jugadorId} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    type="button"
                    aria-pressed={j.marcado}
                    aria-label={`${g.nombre} de ${nombre}`}
                    onClick={() => onAlternar(j.jugadorId, g.puntito)}
                    style={{
                      minHeight: '48px', padding: '0 12px', borderRadius: '10px', cursor: 'pointer', touchAction: 'manipulation',
                      display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left',
                      fontFamily: 'inherit', fontSize: '15px', fontWeight: j.marcado ? 700 : 500,
                      background: j.marcado ? 'var(--status-open-bg)' : 'transparent',
                      border: j.marcado ? '2px solid var(--brand)' : '1px solid var(--border-md)',
                      color: 'var(--text)',
                    }}
                  >
                    <span aria-hidden style={{ width: '16px', color: 'var(--brand-on-bg)' }}>{j.marcado ? '✓' : '+'}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
                    {j.enEspera && <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-2)' }}>sin enviar</span>}
                  </button>
                  {j.noCuenta && (
                    <span style={{ fontSize: '12px', lineHeight: 1.3, color: 'var(--text-2)' }}>No cuenta: {j.noCuenta.charAt(0).toLowerCase() + j.noCuenta.slice(1)}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
