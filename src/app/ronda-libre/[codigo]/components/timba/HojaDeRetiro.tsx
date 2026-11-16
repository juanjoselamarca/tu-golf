'use client'

import { useId, useState } from 'react'
import { ConfirmarFinalizarHoja } from '@/components/ronda/ConfirmarFinalizarHoja'

export const DETALLE_RETIRO = 'Pierde los hoyos que no juegue: en cada uno queda último. Los demás siguen jugando.'
/** Se suma al detalle cuando el hoyo elegido (o uno posterior) ya tiene golpes de ese jugador. */
export const AVISO_GOLPES_DESDE_EL_RETIRO = 'Lo que anotó desde ese hoyo deja de contar.'

/**
 * Confirmación del retiro de un jugador en una Timba (spec, "Hoyo pendiente y retiro"), la misma desde la pestaña
 * Juego y desde su tarjeta. Por defecto se retira desde el hoyo calculado (`hoyoDesdeElQueSeRetira`); si el grupo
 * se acordó tarde, se elige otro entre la salida y el hoyo actual (`hoyosParaElegirElRetiro`).
 */
export function HojaDeRetiro({ jugador, onConfirmar, onCancelar }: {
  jugador: { nombre: string; desdeSiSeVa: number | null; hoyosParaElegir: readonly number[]; conGolpesDesde?: readonly number[] }
  onConfirmar: (desde: number) => void
  onCancelar: () => void
}) {
  const etiquetaId = useId()
  const opciones = jugador.hoyosParaElegir
  const [desde, setDesde] = useState<number | null>(jugador.desdeSiSeVa ?? opciones.at(-1) ?? null)
  if (desde == null) return null

  return (
    <ConfirmarFinalizarHoja
      titulo={`¿${jugador.nombre} se retira desde el hoyo ${desde}?`}
      detalle={jugador.conGolpesDesde?.includes(desde) ? `${DETALLE_RETIRO} ${AVISO_GOLPES_DESDE_EL_RETIRO}` : DETALLE_RETIRO}
      textoConfirmar="Retirar"
      onConfirmar={() => onConfirmar(desde)}
      onCancelar={onCancelar}
    >
      {opciones.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
          <span id={etiquetaId} style={{ fontSize: '14px', color: 'var(--text-2)', textAlign: 'center' }}>
            ¿Se fue antes? Elige el hoyo
          </span>
          <div
            role="radiogroup"
            aria-labelledby={etiquetaId}
            style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}
          >
            {opciones.map(h => {
              const elegido = h === desde
              return (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={elegido}
                  aria-label={`Hoyo ${h}`}
                  onClick={() => setDesde(h)}
                  style={{
                    minWidth: '44px', minHeight: '44px', borderRadius: '10px', fontFamily: 'inherit',
                    fontSize: '16px', fontWeight: elegido ? 700 : 500, cursor: 'pointer', touchAction: 'manipulation',
                    border: elegido ? '2px solid var(--brand)' : '1px solid var(--border-md)',
                    background: elegido ? 'var(--brand)' : 'transparent',
                    color: elegido ? 'var(--brand-dark)' : 'var(--text)',
                  }}
                >
                  {h}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </ConfirmarFinalizarHoja>
  )
}
