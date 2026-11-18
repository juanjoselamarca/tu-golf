'use client'

import type React from 'react'
import { CTA_RELLENO } from '@/components/torneo/cta-aviso'
import { MENSAJE_CREAR_TARJETA, type ResultadoCrearTarjeta } from '../hooks/useCrearTarjeta'
import { inscritoAprobado } from '@/golf/tournament-status'

/** Por qué un inscrito no aprobado no tiene tarjeta: no juega, y no hay nada que crear (el servidor lo rechaza). */
export function motivoNoJuega(status: string | null | undefined): string {
  if (status === 'withdrawn') return 'Retirado: no juega esta ronda.'
  if (status === 'disqualified') return 'Descalificado: no juega esta ronda.'
  return 'Inscripción sin aprobar: no juega esta ronda.'
}

const CAJA: React.CSSProperties = { margin: '16px 20px 0', padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 }

/**
 * Scorer del organizador: el jugador elegido no tiene tarjeta en la ronda en juego. Sin tarjeta no hay
 * dónde guardar sus golpes (antes se descartaban en silencio): la grilla queda de solo lectura y el
 * organizador la crea acá. Si se crea, el roster la trae y este aviso se va solo.
 */
export function AvisoJugadorSinTarjeta(props: {
  nombre: string
  /** `players.status`: solo a un aprobado se le ofrece crear la tarjeta (WD/DQ/pendiente no juegan). */
  status: string | null | undefined
  creando: boolean
  resultado: ResultadoCrearTarjeta | null
  crear: () => void
}) {
  const { nombre, status, creando, resultado, crear } = props
  if (!inscritoAprobado(status)) {
    return (
      <div role="status" data-testid="organizador-no-juega" style={CAJA}>
        <strong>{nombre}.</strong> {motivoNoJuega(status)}
      </div>
    )
  }
  return (
    <div role="alert" data-testid="organizador-sin-tarjeta" style={CAJA}>
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
