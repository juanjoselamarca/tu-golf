'use client'

import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { primario, secundario } from './estilos'
import { SelectorFormato } from './SelectorFormato'

interface Props {
  formato: FormatoJuego
  onFormato: (f: FormatoJuego) => void
  modo: ModoJuego
  onModo: (m: ModoJuego) => void
  netoBloqueado: boolean
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
      />

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
