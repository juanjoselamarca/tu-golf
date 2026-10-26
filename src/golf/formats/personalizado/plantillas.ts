/**
 * Plantillas del catálogo de Timba libre. Cada una es una config armada con las piezas de `config.ts`:
 * el motor no sabe de plantillas, solo de piezas.
 */
import { LIMITES_JUEGO, VERSION_CONFIG_JUEGO, type ConfigJuego, type Pareja, type PuntitoConfig } from './config'

export type PlantillaJuego = ConfigJuego['plantilla']

/** Generador de números en [0, 1). Se inyecta para que el sorteo sea testeable. */
export type Azar = () => number

const BASE = {
  version: VERSION_CONFIG_JUEGO,
  modo: 'gross',
  handicap: 'diferencia_mas_bajo',
  repartoPareja: 'total_a_cada_uno',
  puntitos: [] as PuntitoConfig[],
} as const satisfies Partial<ConfigJuego>

/** Nombre de cada plantilla para mostrar. */
export const NOMBRE_PLANTILLA: Record<PlantillaJuego, string> = {
  colombiana: 'La Colombiana',
  dos_cero_dos: 'El 2-0-2',
  subterranea: 'La Subterránea',
  subterror: 'La Subterror',
  personalizado_total: 'Personalizado total',
}

/** Jugadores que pide cada plantilla (mínimo y máximo). */
export const JUGADORES_POR_PLANTILLA: Record<PlantillaJuego, { min: number; max: number }> = {
  colombiana: { min: 4, max: 4 },
  dos_cero_dos: LIMITES_JUEGO.jugadores,
  subterranea: { min: 4, max: 4 },
  subterror: LIMITES_JUEGO.jugadores,
  personalizado_total: LIMITES_JUEGO.jugadores,
}

function barajar<T>(items: readonly T[], azar: Azar): T[] {
  const copia = [...items]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/** Orden de las 3 combinaciones de parejas de La Colombiana. Se sortea al crear y se guarda. */
export function sortearOrdenDeParejas(azar: Azar = Math.random): [number, number, number] {
  const [a, b, c] = barajar([0, 1, 2], azar)
  return [a, b, c]
}

/** Parejas fijas al azar (A con quién juega). Se sortea al crear y se guarda. */
export function sortearParejasFijas(azar: Azar = Math.random): [Pareja, Pareja] {
  const [a, b, c, d] = barajar([0, 1, 2, 3], azar)
  const p1: Pareja = a < b ? [a, b] : [b, a]
  const p2: Pareja = c < d ? [c, d] : [d, c]
  return p1[0] === 0 ? [p1, p2] : [p2, p1]
}

export function crearConfigDePlantilla(plantilla: PlantillaJuego, azar: Azar = Math.random): ConfigJuego {
  switch (plantilla) {
    case 'colombiana':
      return {
        ...BASE,
        puntitos: [],
        plantilla,
        unidad: 'parejas_rotativas',
        duelos: [
          { tipo: 'mejor_bola', valor: 2, perdedorResta: false },
          { tipo: 'peor_bola', valor: 1, perdedorResta: false },
          { tipo: 'suma', valor: 1, perdedorResta: false },
        ],
        sorteo: sortearOrdenDeParejas(azar),
      }
    case 'dos_cero_dos':
      return {
        ...BASE,
        puntitos: [],
        plantilla,
        unidad: 'individual',
        duelos: [{ tipo: 'por_puesto', tablas: { '3': [2, 0, -2], '4': [2, 0, 0, -2] } }],
      }
    case 'subterranea':
      return {
        ...BASE,
        puntitos: [],
        plantilla,
        unidad: 'parejas_fijas',
        duelos: [{ tipo: 'peor_bola', valor: 1, perdedorResta: false }],
        parejas: sortearParejasFijas(azar),
      }
    case 'subterror':
      return {
        ...BASE,
        puntitos: [],
        plantilla,
        unidad: 'individual',
        duelos: [{ tipo: 'por_puesto', tablas: { '3': [0, 0, -1], '4': [0, 0, 0, -1] } }],
      }
    case 'personalizado_total':
      // Punto de partida del armado libre: el 2-0-2 (el más simple), que el usuario modifica.
      return { ...crearConfigDePlantilla('dos_cero_dos', azar), plantilla }
  }
}
