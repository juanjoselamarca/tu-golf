/**
 * Contexto con que se valida un Skins al crear la ronda libre: course handicap de cada jugador y par/SI de los
 * hoyos, en la escala de los hoyos de la ronda (spec docs/specs/formato-skins.md, final: en 9 hoyos, el CH de 9).
 *
 * FUENTE ÚNICA para la pantalla (cliente del navegador) y la API (cliente del request): las dos validan con los
 * mismos números. Arma los datos con las mismas piezas que la vista en vivo y el scorer (`fetchHoyosDeLaRonda` →
 * `parYSiDeLaRonda`, `resolverCourseData` por tee, `resolverCourseHandicapSinRedondear`), así lo que se valida al
 * crear es lo que después reparte el motor.
 *
 * El CH va SIN redondear: el motor aplica el % con `handicapDeJuego` (WHS 6.2a, un solo redondeo).
 *
 * Falla CERRADO: si la base no contesta los hoyos, lanza; en neto, si no se pudo leer el rating y slope de un tee o la
 * cancha no los tiene, también: el CH no se aproxima por índice con plata en juego. `FalloDelContextoSkins.deSenal`
 * separa las dos cosas (releer arregla la primera, no la segunda).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverCourseData, resolverCourseHandicapSinRedondear, type CourseData } from '@/golf/core/course-handicap'
import { hoyosJugadosDeLaRonda } from '@/golf/core/hoyos-jugados'
import type { ContextoValidacionSkins } from '@/golf/formats/skins'
import {
  MENSAJE_SKINS_SIN_CANCHA, hoyosDelSkins, prepararSkinsDeRondaNueva, problemasDeLaRondaDelSkins, type ReglasSkinsGuardadas,
} from '@/golf/ronda-libre/skins-de-ronda-nueva'
import { captureError } from '@/lib/error-tracking'
import { TiempoAgotadoError } from '@/lib/red/con-timeout'
import { LecturaFallidaError, detalleDeLecturaFallida } from '@/lib/red/lectura-fallida'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'
import { congelarContextoSkins } from '@/golf/ronda-libre/skins-congelado'
import { teeLabel } from '@/golf/courses/category-tee-options'
import { resolverHoyosDeLaRonda } from './course-holes'
import { parYSiDeLaRonda, type HoyoDeCatalogoEnVivo } from './ronda-libre'

export interface JugadorDelSkinsNuevo {
  nombre: string
  /** Índice declarado en la tarjeta (`null` = sin índice: en neto, bloqueo). */
  indice: number | null
  /** Tee del jugador; sin tee, el de la ronda. */
  tees?: string | null
}

export interface RondaDelSkinsNuevo {
  courseId: string
  holes: number
  hoyoInicio: number | null
  recorridos: readonly string[] | null
  /** Tee de la ronda (el de los jugadores que no eligieron uno). */
  tees: string
  jugadores: readonly JugadorDelSkinsNuevo[]
  /** Neto: exige rating y slope de cada tee con jugadores con índice. */
  modo: string
}

/**
 * No se pudo armar el contexto. `message` es SIEMPRE el mensaje para el jugador, el de la lectura que falló (los hoyos
 * o el rating del tee, con su salida «juega en gross»): las pantallas lo muestran tal cual, sin mirar `deSenal`. El
 * detalle técnico va en `cause` (se reporta con `detalleDeLecturaFallida`).
 * `deSenal`: falló la red o la base no contestó a tiempo (reintentable solo). Si no, falta un dato de la cancha
 * (rating y slope de un tee) o PostgREST contestó con un código permanente: reintentar no lo arregla.
 */
export class FalloDelContextoSkins extends Error {
  constructor(message: string, readonly deSenal: boolean, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'FalloDelContextoSkins'
  }
}

/**
 * Lo que ve el jugador cuando no se pudo armar el contexto: el de la lectura que falló. Si no se sabe cuál (el plazo
 * venció a mitad de camino, u otro error), uno neutro que no culpa a los hoyos ni al rating.
 */
export function mensajeDelFalloDelContextoSkins(err: unknown): string {
  return err instanceof FalloDelContextoSkins ? err.message : MENSAJE_SKINS_SIN_LEER_LA_CANCHA
}

/**
 * ¿Volver a leer puede arreglarlo? Sí si falló la red: una lectura que volvió sin `code` de PostgREST o con uno
 * transitorio (`esCodigoTransitorio`: base saturada, plazo de la sentencia), es decir `deSenal`, o el plazo vencido.
 * No si falta un dato de la cancha (un tee sin rating), si PostgREST contestó con un código permanente (permisos,
 * columna) ni ante cualquier otro error: reintentarlo solo repite la falla.
 *
 * Sin rama `TypeError`: `postgrest-js` no lanza cuando el fetch se cae, lo devuelve como `{ error }` sin `code`
 * (ver `LecturaFallidaError`). Un `TypeError` que llegue hasta acá es un bug, y reintentarlo sería para siempre.
 */
export function esFalloDeSenalDelContextoSkins(err: unknown): boolean {
  if (err instanceof FalloDelContextoSkins) return err.deSenal
  return err instanceof TiempoAgotadoError
}

/**
 * Envuelve el fallo de una lectura con el mensaje para el jugador de ESA lectura. De señal si PostgREST no trajo
 * `code` o trajo uno transitorio (`LecturaFallidaError.deSenal`). El detalle técnico queda en `cause`.
 */
function falloDeLectura(err: unknown, mensajeParaElJugador: string): FalloDelContextoSkins {
  const deSenal = err instanceof LecturaFallidaError && err.deSenal
  return new FalloDelContextoSkins(mensajeParaElJugador, deSenal, err)
}

export const MENSAJE_SKINS_SIN_DATOS_DE_CANCHA =
  'No pudimos leer los hoyos de la cancha para armar el skins. Revisa tu señal e intenta de nuevo.'

/** Sin saber qué lectura falló (el plazo cubre todo el contexto): no se le dice al jugador que fueron los hoyos. */
export const MENSAJE_SKINS_SIN_LEER_LA_CANCHA =
  'No pudimos leer la cancha para armar el skins. Revisa tu señal e intenta de nuevo.'

export function mensajeSkinsSinRating(tee: string): string {
  return `No pudimos leer el rating y slope del tee ${teeLabel(tee)} para el skins neto. Revisa tu señal; si sigue, juega en gross.`
}

export async function contextoSkinsDeRondaNueva(
  supabase: SupabaseClient,
  ronda: RondaDelSkinsNuevo,
): Promise<ContextoValidacionSkins> {
  const recorridos = ronda.recorridos && ronda.recorridos.length > 0 ? [...ronda.recorridos] : null
  let catalogo: Awaited<ReturnType<typeof resolverHoyosDeLaRonda>>['hoyos']
  try {
    catalogo = (await resolverHoyosDeLaRonda(supabase, ronda.courseId, recorridos, {
      columnas: 'numero, par, stroke_index',
      lanzarSiFalla: true,
    })).hoyos
  } catch (err) {
    throw falloDeLectura(err, MENSAJE_SKINS_SIN_DATOS_DE_CANCHA)
  }
  const { parMap, siMap, parTotal } = parYSiDeLaRonda(
    catalogo as unknown as HoyoDeCatalogoEnVivo[], ronda.holes, ronda.hoyoInicio,
  )

  const teeDe = (j: JugadorDelSkinsNuevo) => teeDelJugador(j, ronda)
  const tees = Array.from(new Set(ronda.jugadores.map(teeDe)))
  // En neto la lectura del rating falla CERRADO (`lanzarSiFalla`): «no pude leer» (señal, reintentable) no se
  // confunde con «la cancha no tiene el dato» (`null`, permanente). En gross el CH no reparte nada: degrada.
  const neto = ronda.modo === 'neto'
  const datos = await Promise.all(tees.map(tee => resolverCourseData(
    supabase, ronda.courseId, tee, ronda.holes, parTotal, recorridos, { lanzarSiFalla: neto },
  ).catch((err: unknown) => { throw falloDeLectura(err, mensajeSkinsSinRating(tee)) })))
  const porTee: Record<string, CourseData | null> = Object.fromEntries(tees.map((t, i) => [t, datos[i]]))
  // Leído bien y sin dato: la cancha no tiene rating y slope del tee. Con plata en juego no se aproxima por índice.
  if (neto) {
    const sinRating = ronda.jugadores.find(j => j.indice != null && porTee[teeDe(j)] == null)
    if (sinRating) throw new FalloDelContextoSkins(mensajeSkinsSinRating(teeDe(sinRating)), false)
  }

  return {
    jugadores: ronda.jugadores.map(j => ({
      nombre: j.nombre.trim(),
      courseHandicap: j.indice == null ? null : resolverCourseHandicapSinRedondear(j.indice, porTee[teeDe(j)], ronda.holes),
    })),
    hoyos: catalogo.length === 0 ? [] : hoyosDelSkins(hoyosJugadosDeLaRonda(ronda.hoyoInicio, ronda.holes), parMap, siMap),
  }
}

/** Lo que la API necesita de la ronda pedida para armar el skins. */
export interface PedidoDeSkinsNuevo extends Omit<RondaDelSkinsNuevo, 'modo'> {
  reglasJuego: unknown
  modoDeLaRonda: string
  adminMode: boolean
  nuevoId: () => string
}

export type SkinsParaCrear =
  | { ok: true; reglas: ReglasSkinsGuardadas; jugadorIds: string[] }
  | { ok: false; status: 400 | 503; error: string }

/**
 * El skins de una ronda nueva, listo para insertar (lo usa `POST /api/ronda-libre/create`). Valida lo de la ronda
 * (un celular, cancha, hoyos), carga el contexto con `contextoSkinsDeRondaNueva` y corre `prepararSkinsDeRondaNueva`:
 * el mismo camino que la pantalla. Si la base no contesta, 503 (reintentable), nunca un skins validado a ciegas.
 */
export async function skinsParaCrearRonda(
  supabase: SupabaseClient,
  pedido: Omit<PedidoDeSkinsNuevo, 'courseId'> & { courseId: string | null },
): Promise<SkinsParaCrear> {
  const previos = problemasDeLaRondaDelSkins(pedido)
  if (previos.length > 0 || !pedido.courseId) return { ok: false, status: 400, error: previos.join(' ') || MENSAJE_SKINS_SIN_CANCHA }

  let contexto: ContextoValidacionSkins
  try {
    contexto = await contextoSkinsDeRondaNueva(supabase, { ...pedido, courseId: pedido.courseId, modo: pedido.modoDeLaRonda })
  } catch (err) {
    void captureError(err, {
      context: 'ronda-libre.create.skins-contexto', level: 'warning',
      meta: { courseId: pedido.courseId, ...detalleDeLecturaFallida(err) },
    })
    return { ok: false, status: 503, error: mensajeDelFalloDelContextoSkins(err) }
  }
  const r = prepararSkinsDeRondaNueva({ ...pedido, contexto })
  if (!r.ok) return { ok: false, status: 400, error: r.errores.join(' ') }
  // Los golpes y los hoyos quedan congelados con el MISMO contexto que validó: la tabla ya no depende del rating que
  // la cancha tenga cuando se lea (spec «Golpes congelados»).
  const congelado = congelarContextoSkins(contexto, { ...pedido, courseId: pedido.courseId }, r.jugadorIds)
  return { ...r, reglas: { ...r.reglas, congelado } }
}
