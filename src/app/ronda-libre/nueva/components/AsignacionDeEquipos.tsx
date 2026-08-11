'use client'

import type { FormatoJuego } from '@/golf/core/rules'
import { jugadoresPorEquipo, maxEquipos } from '@/golf/ronda-libre/plantilla-de-jugadores'
import type { EquipoDeLaRonda } from '../hooks/useFormularioDeRonda'
import type { JugadorDeLaRonda } from '../hooks/useCrearRonda'
import { colores, etiqueta, tarjeta } from './estilos'

interface Props {
  formato: FormatoJuego
  /** Jugadores de la ronda. Los equipos los referencian por `id`. */
  jugadores: JugadorDeLaRonda[]
  equipos: EquipoDeLaRonda[]
  onEquipos: (equipos: EquipoDeLaRonda[]) => void
}

/** Reparte a los jugadores en equipos. Un jugador no puede estar en dos. */
export function AsignacionDeEquipos({ formato, jugadores, equipos, onEquipos }: Props) {
  const porEquipo = jugadoresPorEquipo(formato)
  const tope = maxEquipos(formato)

  const alternar = (equipoIdx: number, jugadorId: string) => {
    onEquipos(
      equipos.map((e, i) => {
        if (i !== equipoIdx) return e
        const dentro = e.miembros.includes(jugadorId)
        return {
          ...e,
          miembros: dentro ? e.miembros.filter(id => id !== jugadorId) : [...e.miembros, jugadorId],
        }
      }),
    )
  }

  const renombrar = (equipoIdx: number, nombre: string) => {
    onEquipos(equipos.map((e, i) => (i === equipoIdx ? { ...e, nombre } : e)))
  }

  return (
    <div style={tarjeta}>
      <label style={{ ...etiqueta, marginBottom: '10px' }}>
        Asignar equipos
        {porEquipo && (
          <span style={{ color: colores.texto3, fontWeight: 400 }}>
            {' '}· {porEquipo.min === porEquipo.max
              ? `${porEquipo.min} por equipo`
              : `${porEquipo.min} a ${porEquipo.max} por equipo`}
          </span>
        )}
      </label>

      {equipos.map((equipo, eIdx) => (
        <div key={eIdx} style={{
          background: colores.inputFondo, borderRadius: '12px', padding: '12px',
          marginBottom: '8px', border: `1px solid ${colores.borde}`,
        }}>
          <input
            type="text"
            value={equipo.nombre}
            onChange={e => renombrar(eIdx, e.target.value)}
            aria-label={`Nombre del equipo ${eIdx + 1}`}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              fontSize: '14px', fontWeight: 600, color: colores.texto,
              marginBottom: '8px', outline: 'none',
              fontFamily: '"DM Sans", sans-serif',
            }}
          />

          {jugadores.map(jugador => {
            const enEste = equipo.miembros.includes(jugador.id)
            const enOtro = equipos.some((e, i) => i !== eIdx && e.miembros.includes(jugador.id))
            return (
              <button
                key={jugador.id}
                type="button"
                disabled={enOtro}
                aria-pressed={enEste}
                onClick={() => alternar(eIdx, jugador.id)}
                style={{
                  display: 'block', width: '100%', padding: '12px 14px',
                  marginBottom: '4px', borderRadius: '8px', minHeight: '44px',
                  border: enEste ? `2px solid ${colores.oro}` : `1px solid ${colores.borde}`,
                  background: enEste ? colores.oroTenue : colores.tarjeta,
                  opacity: enOtro ? 0.4 : 1,
                  cursor: enOtro ? 'not-allowed' : 'pointer',
                  fontSize: '13px', color: colores.texto, textAlign: 'left',
                  fontFamily: '"DM Sans", sans-serif',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {jugador.nombre} {enEste && '✓'}
              </button>
            )
          })}
        </div>
      ))}

      {equipos.length < tope && (
        <button
          type="button"
          onClick={() => onEquipos([...equipos, { nombre: `Equipo ${equipos.length + 1}`, miembros: [] }])}
          style={{
            width: '100%', padding: '10px', borderRadius: '8px',
            border: `1px dashed ${colores.borde}`, background: 'transparent',
            fontSize: '13px', color: colores.texto3, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          + Agregar equipo
        </button>
      )}
    </div>
  )
}
