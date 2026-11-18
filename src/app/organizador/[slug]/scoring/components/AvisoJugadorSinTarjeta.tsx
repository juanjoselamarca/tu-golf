'use client'

import { CTA_RELLENO } from '@/components/torneo/cta-aviso'
import { MENSAJE_CREAR_TARJETA, type ResultadoCrearTarjeta } from '../hooks/useCrearTarjeta'

/**
 * Scorer del organizador: el jugador elegido no tiene tarjeta en la ronda en juego. Sin tarjeta no hay
 * dónde guardar sus golpes (antes se descartaban en silencio): la grilla queda de solo lectura y el
 * organizador la crea acá. Si se crea, el roster la trae y este aviso se va solo.
 */
export function AvisoJugadorSinTarjeta(props: {
  nombre: string
  creando: boolean
  resultado: ResultadoCrearTarjeta | null
  crear: () => void
}) {
  const { nombre, creando, resultado, crear } = props
  return (
    <div role="alert" data-testid="organizador-sin-tarjeta" style={{ margin: '16px 20px 0', padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 }}>
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
