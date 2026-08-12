'use client'

import type { CourseTee } from '@/lib/data/ronda-libre-nueva'
import { colores, input } from './estilos'

interface Props {
  tees: CourseTee[]
  valor: string
  onElegir: (tee: string) => void
  etiquetaAccesible: string
}

/**
 * Tee propio de un jugador. Se oculta cuando la cancha publica un solo tee: sin
 * alternativa, el selector no aporta nada y ocupa una fila en pantalla chica.
 *
 * El tee por jugador NO es cosmético: cada tee tiene su slope y su CR, así que
 * de él salen los golpes que ese jugador recibe.
 */
export function SelectorDeTeeDelJugador({ tees, valor, onElegir, etiquetaAccesible }: Props) {
  if (tees.length <= 1) return null

  return (
    <select
      value={valor}
      onChange={e => onElegir(e.target.value)}
      aria-label={etiquetaAccesible}
      title="Tee de salida"
      style={{
        ...input,
        minHeight: '38px',
        padding: '8px 10px',
        fontSize: '13px',
        cursor: 'pointer',
        color: colores.texto,
      }}
    >
      {tees.map(t => {
        const val = t.nombre.toLowerCase()
        return (
          <option key={val} value={val}>
            {val.charAt(0).toUpperCase() + val.slice(1)}
          </option>
        )
      })}
    </select>
  )
}
