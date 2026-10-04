'use client'

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
 */
const MOTIVO: Record<MotivoEstimado, string> = {
  concedido: 'Lo concediste',
  ganado_sin_terminar: 'Te lo concedieron',
  no_jugado: 'Sin jugar · match decidido',
}

export function HoyosEstimados({
  estimados,
  scores,
  parMap,
  correcciones,
  editable,
  onCorregir,
  historialHref,
}: {
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
}) {
  if (estimados.length === 0) return null
  return (
    <section
      aria-labelledby="hoyos-estimados-titulo"
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px',
        padding: '20px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '14px',
      }}
    >
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
          No terminaste {estimados.length === 1 ? 'este hoyo' : 'estos hoyos'}. Para tu índice cuentan
          con la regla WHS (score más probable o par neto).{' '}
          {editable
            ? 'Si recuerdas tu score, corrígelo antes de guardar.'
            : historialHref ? 'Si recuerdas tu score, puedes corregirlo en tu historial.' : null}
        </p>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {estimados.map((e, i) => {
          const golpes = scores[e.hoyo]
          const corregido = correcciones[e.hoyo] != null
          return (
            <li
              key={e.hoyo}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', minHeight: '52px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                  Hoyo {e.hoyo}
                  <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{' · Par '}{parMap[e.hoyo] ?? '—'}</span>
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                  {corregido ? 'Corregido por ti' : MOTIVO[e.motivo]}
                </span>
              </div>
              {editable && golpes != null ? (
                <div role="group" aria-label={`Golpes del hoyo ${e.hoyo}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <PasoBoton
                    etiqueta={`Un golpe menos en el hoyo ${e.hoyo}`}
                    deshabilitado={!puedeRestarGolpe(golpes)}
                    onClick={() => onCorregir(e.hoyo, golpes - 1)}
                  >
                    <Minus size={18} aria-hidden="true" />
                  </PasoBoton>
                  <output
                    aria-live="polite"
                    style={{
                      minWidth: '32px', textAlign: 'center', fontFamily: 'var(--font-dm-mono)',
                      fontSize: '18px', fontWeight: 600, color: 'var(--text)',
                    }}
                  >
                    {golpes}
                  </output>
                  <PasoBoton
                    etiqueta={`Un golpe más en el hoyo ${e.hoyo}`}
                    deshabilitado={!puedeSumarGolpe(golpes)}
                    onClick={() => onCorregir(e.hoyo, golpes + 1)}
                  >
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
        })}
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
    </section>
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
