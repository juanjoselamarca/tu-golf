'use client'

import type { FormatoJuego } from '@/golf/core/rules'
import {
  EQUIPOS_PARA_COMPETIR,
  jugadoresPorEquipo,
  puedeSumarCompanero,
  puedeSumarEquipo,
} from '@/golf/ronda-libre/plantilla-de-jugadores'
import type { CourseTee } from '@/lib/data/ronda-libre-nueva'
import { ID_DEL_CREADOR, type EquipoDeLaRonda, type RivalDelCreador } from '../hooks/useFormularioDeRonda'
import { colores, input } from './estilos'
import { TarjetaDelCreador } from './TarjetaDelCreador'
import { TarjetaDeRival } from './TarjetaDeRival'

interface Props {
  formato: FormatoJuego
  equipos: EquipoDeLaRonda[]
  rivales: RivalDelCreador[]
  creador: { nombre: string; indice: number | null }
  onIndiceCreador: (indice: number | null) => void
  teeGlobal: string
  onTeeGlobal: (tee: string) => void
  tees: CourseTee[]
  golpesDe: (indice: number | null | undefined, tee: string | null | undefined) => number | null
  onCampoRival: <K extends keyof RivalDelCreador>(idx: number, campo: K, valor: RivalDelCreador[K]) => void
  onQuitarRival: (idx: number) => void
  onAgregarCompanero: (equipoIdx: number) => void
  onAgregarEquipo: () => void
  onQuitarEquipo: (equipoIdx: number) => void
  onRenombrarEquipo: (equipoIdx: number, nombre: string) => void
  onMoverAlEquipo: (id: string, equipoIdx: number) => void
}

const botonPunteado = {
  width: '100%', background: 'transparent',
  border: `1px dashed ${colores.oro}`, color: colores.oroTexto,
  borderRadius: '10px', padding: '12px', cursor: 'pointer',
  fontSize: '14px', fontWeight: 500, textAlign: 'center' as const, minHeight: '44px',
}

const botonTexto = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontSize: '13px', fontWeight: 500, padding: '10px 8px', minHeight: '44px',
}

/**
 * Los jugadores YA repartidos en equipos. El usuario no asigna a nadie: el
 * formulario arma los equipos con la gente que hay, y acá sólo se corrige
 * (mover a alguien, renombrar, sumar un compañero o un equipo rival).
 *
 * Reemplaza a la asignación por toques que exigía 4 jugadores y dos equipos
 * antes de dejar seguir. Un equipo solo contra el par es una ronda válida.
 */
export function EquiposDeLaRonda(props: Props) {
  const totalJugadores = 1 + props.rivales.length
  const posicionDeRival = new Map(props.rivales.map((r, i) => [r.id, i]))
  const topePorEquipo = jugadoresPorEquipo(props.formato)?.max ?? 0
  // El otro equipo al que se puede mover a alguien: existe y le queda cupo.
  const equipoDestinoDesde = (equipoIdx: number) =>
    props.equipos.findIndex((e, i) => i !== equipoIdx && e.miembros.length < topePorEquipo)

  return (
    <div>
      {props.equipos.map((equipo, equipoIdx) => (
        <section
          key={equipoIdx}
          aria-label={equipo.nombre}
          style={{
            padding: '12px', marginBottom: '12px', borderRadius: '14px',
            border: `1px solid ${colores.borde}`, background: 'rgba(196,153,42,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <input
              type="text"
              aria-label={`Nombre del equipo ${equipoIdx + 1}`}
              value={equipo.nombre}
              onChange={e => props.onRenombrarEquipo(equipoIdx, e.target.value)}
              style={{ ...input, flex: 1, fontWeight: 600, background: 'transparent', border: 'none', padding: '8px 4px' }}
            />
            {equipoIdx > 0 && (
              <button
                type="button"
                onClick={() => props.onQuitarEquipo(equipoIdx)}
                style={{ ...botonTexto, color: colores.peligro }}
              >
                Quitar equipo
              </button>
            )}
          </div>

          {equipo.miembros.map(id => {
            if (id === ID_DEL_CREADOR) {
              return (
                <TarjetaDelCreador
                  key={id}
                  nombre={props.creador.nombre}
                  indice={props.creador.indice}
                  onIndice={props.onIndiceCreador}
                  tees={props.tees}
                  teeGlobal={props.teeGlobal}
                  onTeeGlobal={props.onTeeGlobal}
                  golpes={props.golpesDe(props.creador.indice, props.teeGlobal)}
                />
              )
            }
            const idx = posicionDeRival.get(id)
            if (idx == null) return null
            const rival = props.rivales[idx]
            const otroEquipo = equipoDestinoDesde(equipoIdx)
            return (
              <div key={id}>
                <TarjetaDeRival
                  rival={rival}
                  indiceEnLista={idx}
                  tees={props.tees}
                  teeGlobal={props.teeGlobal}
                  golpes={props.golpesDe(rival.handicap, rival.tees ?? props.teeGlobal)}
                  onCampo={(campo, valor) => props.onCampoRival(idx, campo, valor)}
                  onQuitar={() => props.onQuitarRival(idx)}
                />
                {otroEquipo >= 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-6px', marginBottom: '6px' }}>
                    <button
                      type="button"
                      onClick={() => props.onMoverAlEquipo(id, otroEquipo)}
                      style={{ ...botonTexto, color: colores.oroTexto }}
                    >
                      Mover a {props.equipos[otroEquipo].nombre.trim() || `Equipo ${otroEquipo + 1}`} →
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {puedeSumarCompanero(props.formato, equipo.miembros.length, totalJugadores) && (
            <button type="button" onClick={() => props.onAgregarCompanero(equipoIdx)} style={botonPunteado}>
              + Agregar compañero
            </button>
          )}
        </section>
      ))}

      {puedeSumarEquipo(props.formato, props.equipos.length, totalJugadores) && (
        <button type="button" onClick={props.onAgregarEquipo} style={{ ...botonPunteado, marginBottom: '12px' }}>
          + Agregar equipo rival
        </button>
      )}

      {props.equipos.length < EQUIPOS_PARA_COMPETIR && (
        <div style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.5, padding: '0 4px' }}>
          Tu equipo juega contra el par. Con un rival hay ganador.
        </div>
      )}
    </div>
  )
}
