/**
 * Timba libre al crear la ronda (función pura): valida el juego con el MISMO validador que la UI
 * (`validarJuegoPersonalizado`) y arma lo que se guarda en `rondas_libres.reglas_juego`.
 *
 * Los ids de los jugadores se generan ANTES de insertar (`nuevoId`) y viajan en el INSERT de cada fila: así
 * `jugadorIds[i]` es, por construcción, la fila del jugador que la pantalla puso en la posición i, y las
 * parejas (índices) quedan traducidas a ids sin depender del orden en que la base devuelve las filas
 * (contrato, cláusula 2). La ronda se inserta con `reglas_juego` ya completo: no hay un UPDATE posterior que
 * pueda fallar a medias.
 */
import { armarReglasGuardadas, validarJuegoPersonalizado, type ReglasJuegoGuardadas } from '@/golf/formats/personalizado'

/** Título de todo problema del juego de la Timba (UI y API lo muestran igual). */
export const TITULO_REVISA_EL_JUEGO = 'Revisa el juego'

/**
 * Una Timba se anota en un solo celular (`admin_mode`): sus jugadores quedan fijos al crearla (los puntos van por
 * identidad), así que nadie puede sumarse después por el link a anotar su tarjeta.
 */
export const MENSAJE_TIMBA_UN_CELULAR =
  'Timba libre se anota en un solo celular: elige «Yo anoto por todos» y suma a los jugadores.'

export interface JugadorDeTimbaNueva {
  nombre: string
  /** Índice declarado en la tarjeta (`null` = sin índice). */
  indice: number | null
}

export type JuegoDeRondaNueva =
  | { ok: true; reglas: ReglasJuegoGuardadas; jugadorIds: string[] }
  | { ok: false; error: string }

export function prepararJuegoDeRondaNueva(input: {
  reglasJuego: unknown
  modoDeLaRonda: string
  jugadores: readonly JugadorDeTimbaNueva[]
  holes: number
  courseId: string | null
  /** `admin_mode` de la ronda: una persona anota por todos. Sin él, no hay Timba. */
  adminMode: boolean
  nuevoId: () => string
}): JuegoDeRondaNueva {
  if (!input.adminMode) return { ok: false, error: MENSAJE_TIMBA_UN_CELULAR }
  // Sin cancha no hay par por hoyo: ni birdie ni greenie (par 3) tendrían referencia.
  if (!input.courseId) return { ok: false, error: 'Timba libre necesita una cancha del catálogo. Elige la cancha de la lista.' }

  const validado = validarJuegoPersonalizado(input.reglasJuego, {
    // En la creación el validador solo pregunta SI cada uno tiene hándicap (`esHandicapUsable`): todavía no hay
    // course handicap, y el que cuenta lo calcula el cargador con `courseHandicapsDeRonda`. `null` = sin índice,
    // la misma condición que deja al jugador en `sinIndice`.
    jugadores: input.jugadores.map(j => ({ nombre: j.nombre.trim(), courseHandicap: j.indice })),
    cantidadHoyos: input.holes,
  })
  if (!validado.ok) return { ok: false, error: validado.errores.join(' ') }

  // La ronda y el juego no pueden decir modos distintos: el validador de la ronda exige índices solo en neto.
  if (validado.config.modo !== input.modoDeLaRonda) {
    return { ok: false, error: 'El modo del juego no coincide con el de la ronda. Vuelve a armarlo.' }
  }

  const jugadorIds = input.jugadores.map(() => input.nuevoId())
  return { ok: true, jugadorIds, reglas: armarReglasGuardadas(validado.config, jugadorIds) }
}
