'use client'

import { formatLabel } from '@/golf/core/rules'
import type { RondaReciente } from '@/lib/data/ronda-libre-nueva'
import { colores, opcion } from './estilos'

interface Props {
  rondasRecientes: RondaReciente[]
  onRepetir: (ronda: RondaReciente) => void
  llevaElScoreDelGrupo: boolean
  onElegirModo: (grupo: boolean) => void
}

function fechaCorta(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

/** Paso 1: cómo se lleva el score, con atajo para repetir la última ronda. */
export function PasoModo({ rondasRecientes, onRepetir, llevaElScoreDelGrupo, onElegirModo }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {rondasRecientes.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '13px', color: colores.texto2, fontWeight: 500, marginBottom: '10px' }}>
            Tus últimas rondas
          </div>

          {rondasRecientes.map((r, i) => (
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
                  {fechaCorta(r.fecha)} · {formatLabel(r.formato_juego ?? 'stroke_play', r.modo_juego)} · {r.holes}H · {r.jugadores.length} jugadores
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
      )}

      {([
        {
          grupo: false,
          titulo: 'Cada uno marca su score',
          desc: 'Cada jugador usa su celular',
        },
        {
          grupo: true,
          titulo: 'Yo llevo el score del grupo',
          desc: 'Tú marcas el score de todos',
        },
      ]).map(op => {
        const activo = llevaElScoreDelGrupo === op.grupo
        return (
          <button
            key={op.titulo}
            type="button"
            aria-pressed={activo}
            onClick={() => onElegirModo(op.grupo)}
            style={{ ...opcion(activo), padding: '28px 24px', borderRadius: '16px' }}
          >
            <div style={{ fontSize: '17px', fontWeight: 700, color: activo ? colores.oroTexto : colores.texto, marginBottom: '4px' }}>
              {op.titulo}
            </div>
            <div style={{ fontSize: '13px', color: colores.texto2 }}>{op.desc}</div>
          </button>
        )
      })}
    </div>
  )
}
