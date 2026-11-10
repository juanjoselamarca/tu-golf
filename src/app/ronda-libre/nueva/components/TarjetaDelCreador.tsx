'use client'

import type { CourseTee } from '@/lib/data/ronda-libre-nueva'
import { formatearHandicap, MENSAJE_HANDICAP_NO_ES_NUMERO } from '@/golf/handicap-index-range'
import { useCampoHandicap } from '@/hooks/useCampoHandicap'
import { AvisoCampo } from '@/components/ui/AvisoCampo'
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
  // Texto local: "+2" y "18,5" se pueden escribir, y un plus se precarga "+2" (antes type=number decía "-2"
  // y el "HCP +2" de al lado lo contradecía).
  const campo = useCampoHandicap(props.indice, props.onIndice)
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
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="Ej: 10.5"
          value={campo.texto}
          onChange={e => campo.onTexto(e.target.value)}
          aria-invalid={campo.invalido}
          aria-describedby={campo.invalido ? 'indice-creador-error' : undefined}
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
            HCP {formatearHandicap(props.golpes)}
          </span>
        )}
      </div>
      {campo.invalido && <AvisoCampo id="indice-creador-error">{MENSAJE_HANDICAP_NO_ES_NUMERO}</AvisoCampo>}
    </div>
  )
}
