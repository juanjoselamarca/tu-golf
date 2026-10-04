'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Minus, Plus } from 'lucide-react'
import type { HoyoEstimado, MotivoEstimado } from '@/golf/core/ajuste-whs'
import { puedeRestarGolpe, puedeSumarGolpe } from '@/golf/ronda-libre/golpes-por-hoyo'

/**
 * Hoyos de "tu ronda" cuyo score es una estimación WHS (match play: concedidos,
 * ganados sin terminar, no jugados tras decidirse el match). Decisión de Juanjo
 * (02-oct-2026): aparecen marcados y se pueden corregir antes de "Guardar en mi
 * historial"; si no se tocan, queda la estimación. Con la tarjeta ya guardada (la
 * guardó quien finalizó) la corrección se hace en el historial.
 *
 * `incrustado`: va dentro de la misma superficie que "Guardar en mi historial"
 * (corregir y guardar son una sola unidad; la CTA no queda pantallas abajo). Los
 * hoyos no jugados se agrupan en una fila y sólo se abren si el jugador los jugó.
 */
const MOTIVO: Record<Exclude<MotivoEstimado, 'no_jugado'>, string> = {
  concedido: 'Lo concediste',
  ganado_sin_terminar: 'Te lo concedieron',
}

interface Props {
  estimados: readonly HoyoEstimado[]
  /** Golpes como van al historial (estimación o corrección). */
  scores: Record<number, number>
  parMap: Record<number, number>
  correcciones: Record<number, number>
  /** La tarjeta aún no está en el historial: se puede corregir acá. */
  editable: boolean
  onCorregir: (hoyo: number, golpes: number) => void
  /** Tarjeta ya guardada: dónde corregirla. */
  historialHref: string | null
  incrustado?: boolean
}

export function HoyosEstimados({ estimados, scores, parMap, correcciones, editable, onCorregir, historialHref, incrustado }: Props) {
  const [abrirNoJugados, setAbrirNoJugados] = useState(false)
  if (estimados.length === 0) return null

  const empezados = estimados.filter(e => e.motivo !== 'no_jugado')
  const noJugados = estimados.filter(e => e.motivo === 'no_jugado')
  const noJugadosCorregidos = noJugados.some(e => correcciones[e.hoyo] != null)
  const mostrarNoJugados = abrirNoJugados || noJugadosCorregidos

  const fila = (e: HoyoEstimado, detalle: string) => (
    <FilaHoyo
      key={e.hoyo}
      hoyo={e.hoyo}
      par={parMap[e.hoyo]}
      detalle={correcciones[e.hoyo] != null ? 'Corregido por ti' : detalle}
      golpes={scores[e.hoyo]}
      editable={editable}
      onCorregir={onCorregir}
    />
  )

  const contenido = (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h3
          id="hoyos-estimados-titulo"
          style={{
            margin: 0, fontFamily: 'var(--font-dm-mono)', fontSize: '10px', fontWeight: 700,
            color: 'var(--brand-on-bg)', letterSpacing: '0.12em', textTransform: 'uppercase',
          }}
        >
          {estimados.length === 1 ? 'Hoyo estimado' : `${estimados.length} hoyos estimados`}
        </h3>
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.45, color: 'var(--text-2)' }}>
          {estimados.length === 1 ? 'Un hoyo que no terminaste o no jugaste' : 'Hoyos que no terminaste o no jugaste'}.
          {' '}Para tu índice cuentan con la regla WHS.{' '}
          {editable
            ? 'Si los jugaste igual, anota tu score real antes de guardar.'
            : historialHref ? 'Si los jugaste igual, puedes corregirlos en tu historial.' : null}
        </p>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {empezados.map(e => fila(e, MOTIVO[e.motivo as keyof typeof MOTIVO]))}
        {noJugados.length > 0 && (mostrarNoJugados
          ? noJugados.map(e => fila(e, 'Sin jugar · match decidido'))
          : (
            <li style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 0' }}>
                <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                  {rango(noJugados.map(e => e.hoyo))}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                  Sin jugar · match decidido · par neto
                </span>
              </div>
              {editable ? (
                <button
                  type="button"
                  onClick={() => setAbrirNoJugados(true)}
                  style={{
                    minHeight: '44px', padding: '0 14px', borderRadius: '12px', border: '1px solid var(--border)',
                    background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Los jugué
                </button>
              ) : (
                <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: '14px', color: 'var(--text-2)' }}>
                  {noJugados.map(e => scores[e.hoyo] ?? '—').join(' · ')}
                </span>
              )}
            </li>
          ))}
      </ul>

      {!editable && historialHref && (
        <Link
          href={historialHref}
          style={{
            alignSelf: 'flex-start', minHeight: '44px', display: 'inline-flex', alignItems: 'center',
            fontSize: '14px', fontWeight: 600, color: 'var(--brand-on-bg)', textDecoration: 'underline',
            textUnderlineOffset: '3px',
          }}
        >
          Corregir en mi historial
        </Link>
      )}
    </>
  )

  if (incrustado) {
    return (
      <div aria-labelledby="hoyos-estimados-titulo" role="group" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {contenido}
      </div>
    )
  }
  return (
    <section
      aria-labelledby="hoyos-estimados-titulo"
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px',
        padding: '16px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '12px',
      }}
    >
      {contenido}
    </section>
  )
}

/** "Hoyos 15–18" si son consecutivos; si no, "Hoyos 12, 15 y 18". */
function rango(hoyos: readonly number[]): string {
  if (hoyos.length === 1) return `Hoyo ${hoyos[0]}`
  const consecutivos = hoyos.every((h, i) => i === 0 || h === hoyos[i - 1] + 1)
  if (consecutivos) return `Hoyos ${hoyos[0]}–${hoyos[hoyos.length - 1]}`
  return `Hoyos ${hoyos.slice(0, -1).join(', ')} y ${hoyos[hoyos.length - 1]}`
}

function FilaHoyo({ hoyo, par, detalle, golpes, editable, onCorregir }: {
  hoyo: number
  par: number | undefined
  detalle: string
  golpes: number | undefined
  editable: boolean
  onCorregir: (hoyo: number, golpes: number) => void
}) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', borderTop: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 0' }}>
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
          Hoyo {hoyo}
          <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{' · Par '}{par ?? '—'}</span>
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>{detalle}</span>
      </div>
      {editable && golpes != null ? (
        <div role="group" aria-label={`Golpes del hoyo ${hoyo}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <PasoBoton etiqueta={`Un golpe menos en el hoyo ${hoyo}`} deshabilitado={!puedeRestarGolpe(golpes)} onClick={() => onCorregir(hoyo, golpes - 1)}>
            <Minus size={18} aria-hidden="true" />
          </PasoBoton>
          <output
            aria-live="polite"
            style={{ minWidth: '32px', textAlign: 'center', fontFamily: 'var(--font-dm-mono)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}
          >
            {golpes}
          </output>
          <PasoBoton etiqueta={`Un golpe más en el hoyo ${hoyo}`} deshabilitado={!puedeSumarGolpe(golpes)} onClick={() => onCorregir(hoyo, golpes + 1)}>
            <Plus size={18} aria-hidden="true" />
          </PasoBoton>
        </div>
      ) : (
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
          {golpes ?? '—'}
        </span>
      )}
    </li>
  )
}

function PasoBoton({ etiqueta, deshabilitado, onClick, children }: {
  etiqueta: string
  deshabilitado: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={onClick}
      style={{
        width: '44px', height: '44px', borderRadius: '12px', border: '1px solid var(--border)',
        background: 'var(--bg)', color: 'var(--text)', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', cursor: deshabilitado ? 'default' : 'pointer', opacity: deshabilitado ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}
