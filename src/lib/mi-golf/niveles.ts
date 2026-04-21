import type { Nivel, NivelNombre } from './types'

type NivelDef = {
  nombre: NivelNombre
  min: number
  max: number
}

export const NIVELES_ORDEN: NivelNombre[] = ['Novato', 'Amateur', 'Intermedio', 'Avanzado', 'Scratch']

const NIVELES: NivelDef[] = [
  { nombre: 'Scratch', min: 0, max: 3 },
  { nombre: 'Avanzado', min: 3, max: 10 },
  { nombre: 'Intermedio', min: 10, max: 18 },
  { nombre: 'Amateur', min: 18, max: 28 },
  { nombre: 'Novato', min: 28, max: Infinity },
]

export function getNivel(indice: number): Nivel {
  const idxClamp = Math.max(0, indice)

  // Find the appropriate level. At boundaries, prefer the better level (earlier in NIVELES)
  // max is inclusive for the range
  let def = NIVELES[NIVELES.length - 1]
  for (let i = 0; i < NIVELES.length; i++) {
    const n = NIVELES[i]
    if (idxClamp >= n.min && (n.max === Infinity || idxClamp <= n.max)) {
      def = n
      break
    }
  }

  const siguienteIdx = NIVELES_ORDEN.indexOf(def.nombre) + 1
  const siguienteNombre = siguienteIdx < NIVELES_ORDEN.length ? NIVELES_ORDEN[siguienteIdx] : null

  const posicion_en_banda =
    def.max === Infinity
      ? 0
      : 1 - (idxClamp - def.min) / (def.max - def.min)

  const golpes_hasta_siguiente = siguienteNombre ? Math.max(0, idxClamp - def.min) : null

  return {
    nombre: def.nombre,
    indice_min: def.min,
    indice_max: def.max === Infinity ? def.min + 10 : def.max,
    posicion_en_banda,
    golpes_hasta_siguiente,
    nombre_siguiente: siguienteNombre,
  }
}
