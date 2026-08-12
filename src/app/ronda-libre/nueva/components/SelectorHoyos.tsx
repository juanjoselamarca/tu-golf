'use client'

import type { MitadDeCancha } from '@/golf/ronda-libre/forma-de-la-ronda'
import { colores, etiqueta, opcion, tarjeta } from './estilos'

interface Props {
  hoyos: 9 | 18
  onHoyos: (n: 9 | 18) => void
  mitad: MitadDeCancha
  onMitad: (m: MitadDeCancha) => void
}

const MITADES: Array<{ valor: MitadDeCancha; label: string; desc: string }> = [
  { valor: 'front', label: 'Front 9', desc: 'Hoyos 1-9' },
  { valor: 'back', label: 'Back 9', desc: 'Hoyos 10-18' },
]

/**
 * Ronda completa o media ronda. Sólo se muestra en canchas de un recorrido: en
 * una cancha de 27 los hoyos los definen los recorridos elegidos.
 */
export function SelectorHoyos({ hoyos, onHoyos, mitad, onMitad }: Props) {
  return (
    <div style={tarjeta}>
      <label style={{ ...etiqueta, marginBottom: '10px' }}>¿Cuántos hoyos?</label>

      <div style={{ display: 'flex', gap: '8px' }}>
        {([18, 9] as const).map(n => {
          const activo = hoyos === n
          return (
            <button
              key={n}
              type="button"
              aria-pressed={activo}
              onClick={() => onHoyos(n)}
              style={{ ...opcion(activo), flex: 1, textAlign: 'center' }}
            >
              <div style={{ fontSize: '15px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto }}>
                {n} hoyos
              </div>
              <div style={{ fontSize: '12px', color: colores.texto2, marginTop: '2px' }}>
                {n === 18 ? 'Ronda completa' : 'Media ronda'}
              </div>
            </button>
          )
        })}
      </div>

      {hoyos === 9 && (
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          {MITADES.map(opt => {
            const activo = mitad === opt.valor
            return (
              <button
                key={opt.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => onMitad(opt.valor)}
                style={{ ...opcion(activo), flex: 1, padding: '12px 14px', borderRadius: '10px', textAlign: 'center' }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: '11px', color: colores.texto2, marginTop: '2px' }}>{opt.desc}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
