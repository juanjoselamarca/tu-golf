/**
 * Copy del catálogo de Timba libre (fuente única para el banner informativo y la pantalla "elegir el juego").
 * Textos aprobados por Juanjo (maquetas Bloqueo y Main).
 */
import {
  JUGADORES_POR_PLANTILLA, NOMBRE_FORMATO_PERSONALIZADO, NOMBRE_PLANTILLA, type PlantillaJuego, type PuntitoDelCatalogo,
} from '@/golf/formats/personalizado'

export const TITULO_TIMBA = NOMBRE_FORMATO_PERSONALIZADO
export const SUBTITULO_TIMBA = 'Tú anotas el score, la app lleva los puntos.'
export const MARCA_PROXIMAMENTE = 'Próximamente'

export const PLANTILLAS_DEL_CATALOGO = ['colombiana', 'dos_cero_dos', 'subterranea', 'subterror'] as const satisfies readonly PlantillaJuego[]

/** Bajada de cada juego. La Colombiana rota en tramos de un tercio de la ronda (6 en 18, 3 en 9). */
export function bajadaDePlantilla(p: PlantillaJuego, holes = 18): string {
  switch (p) {
    case 'colombiana': return holes % 3 === 0 ? `Parejas que rotan cada ${holes / 3} hoyos` : 'Parejas que rotan'
    case 'dos_cero_dos': return 'El mejor suma, el peor resta'
    case 'subterranea': return 'Solo cuenta la peor bola'
    case 'subterror': return 'El peor del hoyo resta 1'
    case 'personalizado_total': return 'Parejas, valores y puntos a tu pinta'
  }
}

/** Nombre en el banner informativo (copy de Juanjo: ahí La Colombiana lleva también su otro nombre). */
const NOMBRE_EN_BANNER: Partial<Record<PlantillaJuego, string>> = {
  colombiana: 'Colombiana / Hollywood',
  dos_cero_dos: '2-0-2',
}
export const nombreEnBanner = (p: PlantillaJuego) => NOMBRE_EN_BANNER[p] ?? NOMBRE_PLANTILLA[p]

/** "4" o "3–4": cuántos juegan (de `JUGADORES_POR_PLANTILLA`, la misma regla del validador). */
export function jugadoresDePlantilla(p: PlantillaJuego): string {
  const { min, max } = JUGADORES_POR_PLANTILLA[p]
  return min === max ? String(min) : `${min}–${max}`
}

export const NOMBRE_PUNTITO: Record<PuntitoDelCatalogo, string> = {
  birdie: 'Birdie',
  sandy: 'Sandy',
  chipingo: 'Chipingo',
  greenie: 'Greenie',
}
