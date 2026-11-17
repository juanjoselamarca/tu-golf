/**
 * Copy del catálogo de Timba libre (fuente única para el banner informativo y la pantalla "elegir el juego").
 * Textos aprobados por Juanjo (maquetas Bloqueo y Main).
 */
import {
  JUGADORES_POR_PLANTILLA, NOMBRE_FORMATO_PERSONALIZADO, NOMBRE_PLANTILLA, hoyosPorTramoParejo,
  type PlantillaJuego,
} from '@/golf/formats/personalizado'

export const TITULO_TIMBA = NOMBRE_FORMATO_PERSONALIZADO
export const SUBTITULO_TIMBA = 'Tú anotas el score, la app lleva los puntos.'
export const MARCA_PROXIMAMENTE = 'Próximamente'

/** Los juegos armados del catálogo: todas las plantillas (`NOMBRE_PLANTILLA`) menos la que se arma a mano. */
export const PLANTILLAS_DEL_CATALOGO: readonly PlantillaJuego[] =
  (Object.keys(NOMBRE_PLANTILLA) as PlantillaJuego[]).filter(p => p !== 'personalizado_total')

/** Bajada de cada juego. La Colombiana rota por tramos (`hoyosPorTramoParejo`: 6 en 18, 3 en 9). */
export function bajadaDePlantilla(p: PlantillaJuego, holes = 18): string {
  switch (p) {
    case 'colombiana': {
      const n = hoyosPorTramoParejo(holes)
      return n ? `Parejas que rotan cada ${n} hoyos` : 'Parejas que rotan'
    }
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

// Fuente única en el dominio (la usan también el scorer y la pestaña Juego).
export { NOMBRE_PUNTITO } from '@/golf/formats/personalizado'
