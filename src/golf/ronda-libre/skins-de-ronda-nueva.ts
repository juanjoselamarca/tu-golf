/**
 * Skins al crear una ronda libre (función pura). Hermana de `prepararJuegoDeRondaNueva` (Timba): valida las reglas
 * con `validarConfigSkins` —el MISMO validador que corre la pantalla— y arma lo que se guarda en
 * `rondas_libres.reglas_juego` = `{ config, jugadorIds }` (spec docs/specs/formato-skins.md, «Datos»).
 *
 * Los ids de los jugadores se generan antes de insertar y viajan en el INSERT de cada fila, igual que en la Timba:
 * `jugadorIds[i]` es, por construcción, el jugador que la pantalla puso en la posición i.
 *
 * El contexto (course handicap de cada jugador y SI de los hoyos) lo arma quien llama, en la escala de los hoyos de
 * la ronda (en 9 hoyos, el CH de 9): `contextoSkinsDeRondaNueva` en `src/lib/data/skins-ronda-nueva.ts`, la misma
 * para la pantalla y la API.
 */
import type { CongeladoSkins } from './skins-congelado'
import { esCantidadDeHoyosDelSkins } from '../formats/skins/armado'
import { validarConfigSkins, type ConfigSkins, type ContextoValidacionSkins, type HoyoSkins } from '../formats/skins'

/** Título de todo problema del skins (pantalla y API lo muestran igual). */
export const TITULO_REVISA_EL_SKINS = 'Revisa el skins'

/** Un skins se anota en un solo celular, como la Timba: sus jugadores quedan fijos al crearlo (la plata va por identidad). */
export const MENSAJE_SKINS_UN_CELULAR =
  'Skins se anota en un solo celular: elige «Yo anoto por todos» y suma a los jugadores.'
export const MENSAJE_SKINS_SIN_CANCHA = 'Skins necesita una cancha del catálogo. Elige la cancha de la lista.'
export const MENSAJE_SKINS_HOYOS = 'Skins se juega en 18 o 9 hoyos. Cambia los hoyos en el paso Cancha.'

export interface ReglasSkinsGuardadas {
  config: ConfigSkins
  jugadorIds: string[]
  /** Golpes y hoyos congelados al crear (`skins-congelado.ts`). Lo agrega la API; las rondas viejas no lo traen. */
  congelado?: CongeladoSkins
}

export type SkinsDeRondaNueva =
  | { ok: true; reglas: ReglasSkinsGuardadas; jugadorIds: string[] }
  | { ok: false; errores: string[] }

/**
 * Hoyos del skins en el orden en que se juegan, con su par y su SI ya normalizado (`parYSiDeLaRonda`). Un hoyo sin
 * SI entra con 0: deja de ser permutación y el motor lo bloquea en neto (sin datos confiables no hay plata). Un
 * hoyo sin par entra con 0: el par solo lo usan la validación (par neto) y los puntos especiales, y sin cancha del
 * catálogo el skins no se crea.
 */
export function hoyosDelSkins(
  hoyosJugados: readonly number[],
  parMap: Readonly<Record<number, number>>,
  siMap: Readonly<Record<number, number>>,
): HoyoSkins[] {
  return hoyosJugados.map(numero => ({ numero, par: parMap[numero] ?? 0, si: siMap[numero] ?? 0 }))
}

/** Lo que no depende de la config: un celular, cancha del catálogo y 18 o 9 hoyos. */
export function problemasDeLaRondaDelSkins(input: { adminMode: boolean; courseId: string | null; holes: number }): string[] {
  if (!input.adminMode) return [MENSAJE_SKINS_UN_CELULAR]
  if (!input.courseId) return [MENSAJE_SKINS_SIN_CANCHA]
  if (!esCantidadDeHoyosDelSkins(input.holes)) return [MENSAJE_SKINS_HOYOS]
  return []
}

export function prepararSkinsDeRondaNueva(input: {
  reglasJuego: unknown
  /** `modo_juego` de la ronda: tiene que ser el mismo del skins. */
  modoDeLaRonda: string
  contexto: ContextoValidacionSkins
  holes: number
  courseId: string | null
  adminMode: boolean
  nuevoId: () => string
}): SkinsDeRondaNueva {
  const previos = problemasDeLaRondaDelSkins(input)
  if (previos.length > 0) return { ok: false, errores: previos }

  const validado = validarConfigSkins(input.reglasJuego, input.contexto)
  if (!validado.ok) return { ok: false, errores: validado.errores }

  // La ronda y el skins no pueden decir modos distintos: el validador de la ronda exige índices solo en neto.
  if (validado.config.modo !== input.modoDeLaRonda) {
    return { ok: false, errores: ['El modo del skins no coincide con el de la ronda. Vuelve a armarlo.'] }
  }

  const jugadorIds = input.contexto.jugadores.map(() => input.nuevoId())
  return { ok: true, jugadorIds, reglas: { config: validado.config, jugadorIds: [...jugadorIds] } }
}
