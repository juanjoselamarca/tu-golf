'use client'

import type React from 'react'
import { CTA_RELLENO } from '@/components/torneo/cta-aviso'
import { MENSAJE_CREAR_TARJETA, type ResultadoCrearTarjeta } from '../hooks/useCrearTarjeta'
import { inscritoAprobado } from '@/golf/tournament-status'

/** Por qué un inscrito no aprobado no tiene tarjeta: no juega, y no hay nada que crear (el servidor lo rechaza). */
export function motivoNoJuega(status: string | null | undefined): string {
  if (status === 'withdrawn') return 'Se retiró: no juega esta ronda.'
  if (status === 'disqualified') return 'Descalificación: no juega esta ronda.'
  return 'Inscripción sin aprobar: no juega esta ronda.'
}

/**
 * Qué muestra el panel para un jugador SIN tarjeta en la ronda que se está viendo:
 * - `no_juega`: WD/DQ/pendiente. No hay nada que crear.
 * - `no_jugo`: aprobado mirando una ronda pasada (se inscribió después). El servidor crea la tarjeta en la
 *   ronda VIGENTE: ofrecer "Crear su tarjeta" acá terminaba en un "No se pudo crear" falso (Fable #829 v2).
 * - `crear`: aprobado en la ronda vigente: el golpe no tiene dónde guardarse y se ofrece crearla.
 */
export type CasoSinTarjeta = 'no_juega' | 'no_jugo' | 'crear'

export function casoSinTarjeta(
  status: string | null | undefined,
  esRondaVigente: boolean,
  /** El torneo recibe golpes. Cerrado o publicado, quien no tiene tarjeta "no jugó" (sea cual sea su estado). */
  admiteTarjetas = true,
): CasoSinTarjeta {
  // Una ronda pasada sin tarjeta es "no jugó", sea cual sea su estado HOY: un WD de la ronda 3 sí jugó (o no)
  // la 1, y "Se retiró: no juega esta ronda" sobre la ronda 1 dice otra cosa (Fable #829).
  // Torneo cerrado o publicado: la tarjeta ya no se va a jugar, igual que una ronda pasada (Fable #833 v2).
  if (!esRondaVigente || !admiteTarjetas) return 'no_jugo'
  return inscritoAprobado(status) ? 'crear' : 'no_juega'
}

const CAJA = { margin: '16px 20px 0', padding: '12px 14px', borderRadius: '10px', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 } as const
/** Error (el golpe no se guarda): rojo tenue. */
const CAJA_ERROR: React.CSSProperties = { ...CAJA, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)' }
/** Informativo (no juega / no jugó): neutro, como el WD de PlayersTable. */
const CAJA_NEUTRA: React.CSSProperties = { ...CAJA, background: 'var(--surface-soft)', border: '1px solid var(--surface-border)' }

/**
 * Scorer del organizador: el jugador elegido no tiene tarjeta en la ronda que se está viendo. Si juega la ronda
 * vigente, sus golpes no tienen dónde guardarse (antes se descartaban en silencio): el organizador la crea acá y,
 * cuando el roster la trae, el aviso se va solo. Si no juega esa ronda, se dice sin botón.
 */
export function AvisoJugadorSinTarjeta(props: {
  nombre: string
  /** `players.status`: solo a un aprobado se le ofrece crear la tarjeta (WD/DQ/pendiente no juegan). */
  status: string | null | undefined
  /** Número de la ronda que se está viendo y si es la vigente (`useScoringData.esRondaVigente`). */
  ronda: { numero: number; vigente: boolean }
  /** El torneo recibe golpes (no está cerrado ni publicado). */
  admiteTarjetas?: boolean
  creando: boolean
  resultado: ResultadoCrearTarjeta | null
  crear: () => void
}) {
  const { nombre, status, ronda, creando, resultado, crear, admiteTarjetas = true } = props
  const caso = casoSinTarjeta(status, ronda.vigente, admiteTarjetas)
  if (caso !== 'crear') {
    return (
      <div role="status" data-testid={caso === 'no_juega' ? 'organizador-no-juega' : 'organizador-no-jugo'} style={CAJA_NEUTRA}>
        {caso === 'no_juega'
          ? <><strong>{nombre}.</strong> {motivoNoJuega(status)}</>
          : <><strong>{nombre} no jugó la ronda {ronda.numero}.</strong></>}
      </div>
    )
  }
  return (
    <div role="alert" data-testid="organizador-sin-tarjeta" style={CAJA_ERROR}>
      <strong>{nombre} no tiene tarjeta en esta ronda.</strong> Sus golpes no se pueden guardar hasta crearla.
      <div style={{ marginTop: '10px' }}>
        <button
          type="button" onClick={crear} disabled={creando}
          style={{ ...CTA_RELLENO, cursor: creando ? 'wait' : 'pointer', opacity: creando ? 0.7 : 1 }}
        >
          {creando ? 'Creando...' : 'Crear su tarjeta'}
        </button>
      </div>
      {/* Siempre montado: aria-live anuncia el cambio de texto. */}
      <p aria-live="polite" data-testid="resultado-crear-tarjeta" style={{ margin: resultado ? '8px 0 0' : 0, fontSize: '14px', color: 'var(--text-2)' }}>
        {resultado ? MENSAJE_CREAR_TARJETA[resultado] : ''}
      </p>
    </div>
  )
}
