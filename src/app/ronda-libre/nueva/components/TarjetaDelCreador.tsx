'use client'

import type { CourseTee } from '@/lib/data/ronda-libre-nueva'
import { colores, etiqueta, hcpDeJugador, input, inputNumerico } from './estilos'
import { SelectorDeTeeDelJugador } from './SelectorDeTeeDelJugador'

interface Props {
  nombre: string
  indice: number | null
  onIndice: (indice: number | null) => void
  tees: CourseTee[]
  teeGlobal: string
  onTeeGlobal: (tee: string) => void
  /** Golpes de juego con ese índice desde ese tee; `null` si no se puede calcular. */
  golpes: number | null
}

/** La tarjeta del creador: su índice y su tee. Vive sola para poder ir dentro de un equipo. */
export function TarjetaDelCreador(props: Props) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: '12px',
      background: colores.oroTenue, border: `1px solid ${colores.oroBorde}`,
      marginBottom: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: colores.texto }}>{props.nombre}</div>
        <span style={{
          fontSize: '11px', color: colores.oroTexto, fontWeight: 600,
          border: `1px solid ${colores.oroBorde}`, padding: '3px 10px', borderRadius: '10px',
        }}>
          Tú
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="indice-creador" style={{ ...etiqueta, marginBottom: 0, fontSize: '12px', color: colores.texto3, flexShrink: 0 }}>
          Índice
        </label>
        <input
          id="indice-creador"
          type="number"
          step="0.1"
          placeholder="Ej: 10.5"
          value={props.indice ?? ''}
          onChange={e => props.onIndice(e.target.value ? Number(e.target.value) : null)}
          style={{ ...input, ...inputNumerico }}
        />
        <SelectorDeTeeDelJugador
          tees={props.tees}
          valor={props.teeGlobal}
          onElegir={props.onTeeGlobal}
          etiquetaAccesible="Tu tee de salida"
        />
        {props.golpes != null && (
          <span style={hcpDeJugador}>
            HCP {props.golpes}
          </span>
        )}
      </div>
    </div>
  )
}
