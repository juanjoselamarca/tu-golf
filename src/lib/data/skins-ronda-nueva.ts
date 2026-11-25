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
 * Falla CERRADO: si la base no contesta los hoyos, lanza; en neto, si no hay rating y slope de un tee (la lectura
 * falló o la cancha no los tiene), también: el CH no se aproxima por índice con plata en juego.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverCourseData, resolverCourseHandicapSinRedondear, type CourseData } from '@/golf/core/course-handicap'
import { hoyosJugadosDeLaRonda } from '@/golf/core/hoyos-jugados'
import type { ContextoValidacionSkins } from '@/golf/formats/skins'
import {
  MENSAJE_SKINS_SIN_CANCHA, hoyosDelSkins, prepararSkinsDeRondaNueva, problemasDeLaRondaDelSkins, type ReglasSkinsGuardadas,
} from '@/golf/ronda-libre/skins-de-ronda-nueva'
import { captureError } from '@/lib/error-tracking'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'
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
 * No se pudo armar el contexto. `deSenal`: falló la lectura (reintentable solo). Si no, falta un dato de la cancha
 * (rating y slope de un tee): reintentar no lo arregla, salvo que la lectura que lo devolvió vacío haya fallado.
 */
export class FalloDelContextoSkins extends Error {
  constructor(message: string, readonly deSenal: boolean) {
    super(message)
    this.name = 'FalloDelContextoSkins'
  }
}

export const MENSAJE_SKINS_SIN_DATOS_DE_CANCHA =
  'No pudimos leer los hoyos de la cancha para armar el skins. Revisa tu señal e intenta de nuevo.'

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
    throw new FalloDelContextoSkins(err instanceof Error ? err.message : String(err), true)
  }
  const { parMap, siMap, parTotal } = parYSiDeLaRonda(
    catalogo as unknown as HoyoDeCatalogoEnVivo[], ronda.holes, ronda.hoyoInicio,
  )

  const teeDe = (j: JugadorDelSkinsNuevo) => teeDelJugador(j, ronda)
  const tees = Array.from(new Set(ronda.jugadores.map(teeDe)))
  const datos = await Promise.all(
    tees.map(tee => resolverCourseData(supabase, ronda.courseId, tee, ronda.holes, parTotal, recorridos)),
  )
  const porTee: Record<string, CourseData | null> = Object.fromEntries(tees.map((t, i) => [t, datos[i]]))
  // `resolverCourseData` se traga el error de lectura y devuelve null, igual que si la cancha no tuviera el dato: en
  // neto eso caería a la aproximación por índice. Con plata en juego, no.
  if (ronda.modo === 'neto') {
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
    void captureError(err, { context: 'ronda-libre.create.skins-contexto', level: 'warning', meta: { courseId: pedido.courseId } })
    const error = err instanceof FalloDelContextoSkins && !err.deSenal ? err.message : MENSAJE_SKINS_SIN_DATOS_DE_CANCHA
    return { ok: false, status: 503, error }
  }
  const r = prepararSkinsDeRondaNueva({ ...pedido, contexto })
  return r.ok ? r : { ok: false, status: 400, error: r.errores.join(' ') }
}
