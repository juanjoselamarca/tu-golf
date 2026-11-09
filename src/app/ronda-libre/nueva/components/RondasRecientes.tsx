'use client'

import { formatLabel } from '@/golf/core/rules'
import type { RondaReciente } from '@/lib/data/ronda-libre-nueva'
import { colores } from './estilos'

interface Props {
  rondas: RondaReciente[]
  onRepetir: (ronda: RondaReciente) => void
}

function fechaCorta(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

/**
 * Atajo del paso 1: repetir una ronda anterior (cancha, tees, hoyos, formato y
 * gente) y saltar directo a revisar a los jugadores. No se muestra si el
 * usuario todavía no tiene rondas.
 */
export function RondasRecientes({ rondas, onRepetir }: Props) {
  if (rondas.length === 0) return null
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', color: colores.texto2, fontWeight: 500, marginBottom: '10px' }}>
        Tus últimas rondas
      </div>

      {rondas.map((r, i) => (
        <button
          key={`${r.fecha}-${r.course_name}-${i}`}
          type="button"
          onClick={() => onRepetir(r)}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            width: '100%', padding: '14px 16px', marginBottom: '8px',
            background: colores.tarjeta, border: `1px solid ${colores.borde}`,
            borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
            transition: 'border-color 0.15s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '14px', fontWeight: 600, color: colores.texto,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {r.course_name}
            </div>
            <div style={{ fontSize: '12px', color: colores.texto2, marginTop: '2px' }}>
              {/* `formatLabel` es la fuente canónica. El mapa a mano que
                  había acá sólo conocía tres formatos, así que una ronda de
                  Best Ball reaparecía etiquetada "Stroke". */}
              {fechaCorta(r.fecha)} · {formatLabel(r.formato_juego ?? 'stroke_play', r.modo_juego)} · {r.holes}H · {r.jugadores.length} {r.jugadores.length === 1 ? 'jugador' : 'jugadores'}
            </div>
          </div>
          {/* H18: el card entero ya es el target. Un chevron comunica la
              afordance sin competir por el gesto como hacía "Repetir". */}
          <span aria-hidden="true" style={{ color: colores.oroTexto, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>
      ))}

      <div style={{ borderBottom: `1px solid ${colores.borde}`, margin: '4px 0 12px' }} />
    </div>
  )
}
