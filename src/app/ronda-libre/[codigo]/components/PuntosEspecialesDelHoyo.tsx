'use client'

import { useId, useState } from 'react'
import { PUNTITOS_CON_PAR_O_MEJOR, type PuntitoConfig } from '@/golf/formats/personalizado'
import type { MarcasDeUnPuntito } from '@/golf/ronda-libre/marcas-de-la-timba'

/** Una línea por marca puesta en el hoyo: "Sandy · Pedro ✓" (o "(no cuenta)"). Nunca queda una marca escondida. */
export function resumenDeMarcas(grupos: readonly MarcasDeUnPuntito[], nombres: Readonly<Record<string, string>>): string[] {
  return grupos.flatMap(g =>
    g.jugadores.filter(j => j.marcado).map(j => `${g.nombre} · ${nombres[j.jugadorId] ?? ''} ${j.noCuenta ? '(no cuenta)' : '✓'}`),
  )
}

const primeraEnMinuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * Puntos especiales que se marcan a mano en el hoyo (sandy, chipingo, greenie, propios). Cerrado es una fila de
 * 48 px; abierto, un botón por jugador y punto que el motor contaría (lo decide `marcasDelHoyo`), marcado con ✓ y
 * borde (no solo color). Una marca que no cuenta se ve con su razón y se puede quitar: nunca se borra sola.
 *
 * Al cambiar de hoyo vuelve a cerrado, salvo que el hoyo ya tenga marcas (abre para mostrarlas); cerrado igual las
 * resume. Genérico: no sabe de qué juego viene.
 */
export function PuntosEspecialesDelHoyo(props: {
  hoyo: number
  grupos: readonly MarcasDeUnPuntito[]
  nombres: Readonly<Record<string, string>>
  birdieAutomatico: boolean
  onAlternar: (jugadorId: string, puntito: PuntitoConfig) => void
}) {
  const { hoyo, grupos, nombres, birdieAutomatico, onAlternar } = props
  const idPanel = useId()
  // Lo que eligió el scorer en ESTE hoyo; en otro hoyo vale el estado inicial (derivado, sin efectos).
  const [eleccion, setEleccion] = useState<{ hoyo: number; abierto: boolean } | null>(null)
  if (grupos.length === 0) return null

  const resumen = resumenDeMarcas(grupos, nombres)
  const abierto = eleccion?.hoyo === hoyo ? eleccion.abierto : resumen.length > 0
  const conBotones = grupos.filter(g => g.jugadores.length > 0)
  const sinBotonesPorScore = grupos.filter(g => g.jugadores.length === 0 && PUNTITOS_CON_PAR_O_MEJOR.includes(g.puntito.tipo))

  return (
    <section
      aria-label={`Puntos especiales del hoyo ${hoyo}`}
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', display: 'flex', flexDirection: 'column' }}
    >
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => setEleccion({ hoyo, abierto: !abierto })}
        style={{
          minHeight: '48px', padding: '10px 12px', border: 'none', borderRadius: '14px', background: 'transparent', cursor: 'pointer',
          touchAction: 'manipulation', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', fontFamily: 'inherit',
          color: 'var(--text)', width: '100%',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700 }}>
            {resumen.length > 0 ? 'Puntos especiales' : <><span aria-hidden style={{ color: 'var(--brand-on-bg)' }}>+ </span>Punto especial</>}
          </span>
          {!abierto && resumen.length > 0 && (
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-2)', lineHeight: 1.35 }}>{resumen.join(', ')}</span>
          )}
        </span>
        <span aria-hidden style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>{abierto ? 'Cerrar' : resumen.length > 0 ? 'Editar' : ''}</span>
        <span aria-hidden style={{ fontSize: '14px', color: 'var(--text-2)', transform: abierto ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {abierto && (
        <div id={idPanel} style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {birdieAutomatico && <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>El birdie se suma solo</span>}
          {conBotones.map(g => (
            <div key={g.puntito.id} role="group" aria-label={g.nombre} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>
                {g.nombre} <span style={{ fontWeight: 500 }}>+{g.puntito.valor}</span>
                {g.puntito.tipo === 'greenie' && <span style={{ fontWeight: 500 }}> · uno por hoyo</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                {g.jugadores.map(j => {
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
                        <span style={{ fontSize: '12px', lineHeight: 1.3, color: 'var(--text-2)' }}>No cuenta: {primeraEnMinuscula(j.noCuenta)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {sinBotonesPorScore.length > 0 && (
            <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.35, color: 'var(--text-2)' }}>
              {sinBotonesPorScore.map(g => g.nombre).join(' y ')}: {sinBotonesPorScore.length > 1 ? 'aparecen' : 'aparece'} cuando alguien anota par o mejor.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
