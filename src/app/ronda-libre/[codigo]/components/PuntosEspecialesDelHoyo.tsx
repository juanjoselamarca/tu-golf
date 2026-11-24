'use client'

import { Fragment, useId, useState } from 'react'
import type { PuntitoConfig } from '@/golf/formats/personalizado'
import type { MarcasDeUnPuntito } from '@/golf/ronda-libre/marcas-de-la-timba'

export interface LineaDelResumen {
  texto: string
  /**
   * `marcada` = ✓: marcada y guardada (puede que el motor todavía no juzgue el hoyo). `no_cuenta` y `sin_enviar` se
   * dicen con palabras.
   */
  estado: 'marcada' | 'no_cuenta' | 'sin_enviar'
}

/** Una línea por marca puesta en el hoyo ("Sandy · Pedro ✓"): cerrado, nunca queda una marca escondida. */
export function resumenDeMarcas(grupos: readonly MarcasDeUnPuntito[], nombres: Readonly<Record<string, string>>): LineaDelResumen[] {
  return grupos.flatMap(g =>
    g.jugadores
      .filter(j => j.marcado)
      .map(j => ({
        texto: `${g.nombre} · ${nombres[j.jugadorId] ?? ''}`,
        estado: j.noCuenta ? ('no_cuenta' as const) : j.enEspera ? ('sin_enviar' as const) : ('marcada' as const),
      })),
  )
}

const primeraEnMinuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * Puntos especiales que se marcan a mano en el hoyo. Cerrado es una fila de 48 px; abierto, un botón por jugador y
 * punto, marcado con ✓ y borde (no solo color). Qué botón se ofrece, la nota y la pista de cada punto y el "no
 * cuenta" los decide `marcasDelHoyo`: acá solo se pintan (sin reglas de golf, se reusa en otros juegos). Una marca
 * que no cuenta se ve con su razón y se puede quitar: nunca se borra sola.
 *
 * Al cambiar de hoyo vuelve a cerrado, salvo que el hoyo ya tenga marcas (abre para mostrarlas); cerrado igual las
 * resume.
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
  const conBotones = grupos.filter(g => g.jugadores.some(j => j.visible))
  const conPista = grupos.filter(g => !g.jugadores.some(j => j.visible) && g.pista)

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
            <span data-resumen style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-2)', lineHeight: 1.35 }}>
              {resumen.map((l, i) => (
                <Fragment key={i}>
                  {i > 0 && ', '}
                  {l.texto}{' '}
                  {l.estado === 'marcada'
                    ? <span style={{ color: 'var(--brand-on-bg)' }}>✓</span>
                    : <span style={{ fontWeight: 700, color: 'var(--text)' }}>{l.estado === 'no_cuenta' ? '(no cuenta)' : '(sin enviar)'}</span>}
                </Fragment>
              ))}
            </span>
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
                {g.nota && <span style={{ fontWeight: 500 }}> · {g.nota}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                {g.jugadores.map(j => {
                  // Oculto = hueco: cada jugador conserva su columna aunque cambie un score.
                  if (!j.visible) return <div key={j.jugadorId} aria-hidden />
                  const nombre = nombres[j.jugadorId] ?? ''
                  return (
                    <div key={j.jugadorId} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
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
                          // Sin marcar, el borde es de --text-3 (≥3:1 contra la tarjeta, WCAG 1.4.11).
                          border: j.marcado ? '2px solid var(--brand)' : '1px solid var(--text-3)',
                          color: 'var(--text)',
                        }}
                      >
                        <span aria-hidden style={{ width: '16px', color: 'var(--brand-on-bg)' }}>{j.marcado ? '✓' : '+'}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
                      </button>
                      {/* Debajo y no dentro del botón: en media grilla el nombre largo no se come. */}
                      {j.enEspera && <span style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.3, color: 'var(--text-2)' }}>Sin enviar</span>}
                      {j.noCuenta && (
                        <span style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3, color: 'var(--text-2)' }}>No cuenta: {primeraEnMinuscula(j.noCuenta)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {conPista.map(g => (
            <p key={g.puntito.id} style={{ margin: 0, fontSize: '13px', lineHeight: 1.35, color: 'var(--text-2)' }}>
              {g.nombre}: {primeraEnMinuscula(g.pista ?? '')}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
