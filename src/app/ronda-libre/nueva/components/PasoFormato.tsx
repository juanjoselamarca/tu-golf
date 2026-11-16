'use client'

import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { primario, secundario } from './estilos'
import { SelectorFormato } from './SelectorFormato'
import { ElegirJuegoTimba } from './timba/ElegirJuegoTimba'
import type { TimbaDelFormulario } from '../hooks/timba-del-formulario'

interface Props {
  formato: FormatoJuego
  onFormato: (f: FormatoJuego) => void
  modo: ModoJuego
  onModo: (m: ModoJuego) => void
  netoBloqueado: boolean
  holes: number
  /** Timba libre: `actual` null = no elegida. Elegirla depende del permiso (`puedeElegir`). */
  timba: {
    puedeElegir: boolean
    actual: TimbaDelFormulario | null
    onElegir: () => void
    onTimba: (t: TimbaDelFormulario) => void
  }
  onAtras: () => void
  onSiguiente: () => void
}

/**
 * Paso 2: cómo se juega. El formato va ANTES de la gente porque decide cuánta
 * gente hace falta y cómo se anota: elegir Scramble arma el equipo solo y
 * elegir Match Play abre al rival, sin que el usuario tenga que adivinar.
 */
export function PasoFormato(props: Props) {
  return (
    <div>
      <SelectorFormato
        formato={props.formato}
        onFormato={props.onFormato}
        modo={props.modo}
        onModo={props.onModo}
        netoBloqueado={props.netoBloqueado}
        timba={{ puedeElegir: props.timba.puedeElegir, activa: props.timba.actual != null, onElegir: props.timba.onElegir }}
      />

      {props.timba.actual && (
        <ElegirJuegoTimba
          timba={props.timba.actual}
          onTimba={props.timba.onTimba}
          modo={props.modo}
          onModo={props.onModo}
          holes={props.holes}
        />
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={props.onAtras} style={secundario}>
          ← Atrás
        </button>
        <button type="button" onClick={props.onSiguiente} style={{ ...primario(false), flex: 2 }}>
          Siguiente →
        </button>
      </div>
    </div>
  )
}
