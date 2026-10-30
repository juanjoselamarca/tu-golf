// ─── Capa de datos — Adjusted Gross Score de una fila ya guardada (#545) ─────
//
// La ronda libre topa la tarjeta al guardarla con lo que ya cargó el scorer
// (`ronda-libre-finalizar.ts`). Los caminos que RE-calculan el diferencial de una
// fila de `historical_rounds` (corregir golpes, recompute por tee, backfill) no
// tienen ese contexto: lo reconstruyen acá desde la fila + el catálogo, con las
// mismas fuentes canónicas (`fetchHoyosDeLaRonda`, `hoyosDeLaVuelta`,
// `normalizedStrokeIndexByHole`, `resolverCourseData`/`courseHandicapDeLaCancha`)
// y la misma función de tope (`grossAjustadoWHS`).
//
// Regla de los fallbacks: ante la duda, el tope MÁS ALTO (el índice nunca sale
// más bajo que el oficial). SI dudoso → tope holgado; par desconocido → no se topa;
// sin datos de cancha para el course handicap → tope sin índice (par + 5).

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  grossAjustadoWHS,
  indiceDelDia,
  indiceGolfersAntesDe,
  indiceParaTope,
  metadataAjusteWHS,
  type AjusteWHSMetadata,
  type RegistroIndice,
  type FuenteSI,
  type GrossAjustadoResult,
} from '@/golf/core/ajuste-whs'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { INDEX_WINDOW_COLUMNS, type IndexWindowRound } from '@/golf/core/index-window'
import { courseHandicapDeLaCancha, resolverCourseData } from '@/golf/core/course-handicap'
import { hoyosDeLaVuelta, type HoyoDeCatalogo } from '@/golf/courses/vueltas'
import { normalizeParPerHole } from '@/golf/coach/hole-pars'
import { isSharedBallFormat } from '@/golf/formats'
import { captureError } from '@/lib/error-tracking'
import { ratingsDe9DelDiferencial } from '@/lib/indice-golfers'
import { fetchHoyosDeLaRonda } from './course-holes'

/** Columnas de `historical_rounds` que necesita `grossAjustadoDeFila`. */
export const COLS_AJUSTE_WHS = 'course_id, tee_color, holes_played, scores, par_per_hole, metadata, formato_juego, import_source'

export interface FilaParaAjuste {
  course_id: string | null
  tee_color: string | null
  holes_played: number | null
  /** Posicional por número de hoyo ascendente; el número real de cada posición está en `metadata.hoyos`. */
  scores: ReadonlyArray<number | null> | null
  /** Posicional "1".."N" (mismas posiciones que `scores`). */
  par_per_hole: unknown
  metadata: { hoyos?: number[] | null; recorridos?: string[] | null } & Record<string, unknown> | null
  formato_juego?: string | null
  import_source?: string | null
}

export type GrossAjustadoDeFila = GrossAjustadoResult & {
  courseHcp: number | null
  indice: number | null
  siFuente: FuenteSI
  /** Listo para `metadata.ajuste_whs`. */
  metadata: AjusteWHSMetadata
}

type Client = Pick<SupabaseClient, 'from'>

/**
 * Memo de lecturas del catálogo para un lote de filas (recompute, backfill): las
 * filas de una misma cancha/tee comparten hoyos y course data. Una por llamada de
 * lote; nunca global (el catálogo puede cambiar entre corridas).
 */
export type CacheAjusteWHS = Map<string, Promise<unknown>>

function memo<T>(cache: CacheAjusteWHS | undefined, clave: string, leer: () => Promise<T>): Promise<T> {
  if (!cache) return leer()
  let p = cache.get(clave) as Promise<T> | undefined
  if (!p) { p = leer(); cache.set(clave, p) }
  return p
}

export interface OpcionesAjusteFila {
  /** Índice para el tope, o cómo leerlo (sólo se lee si la fila tiene golpes por hoyo). */
  indice: number | null | (() => Promise<number | null>)
  cache?: CacheAjusteWHS
  /**
   * Reutilizar el course handicap guardado en `metadata.ajuste_whs` (mismo tee y
   * mismo reparto). Sólo al corregir golpes: los ratings no cambiaron y el tope de
   * los demás hoyos debe quedar igual. Los recálculos por catálogo lo dejan en
   * false: si el slope/CR cambió, el CH viejo bajaría el tope (y el índice). Se
   * ignora si vienen `ratings`: el CH sale de ellos (tope y diferencial de los
   * mismos ratings). El índice del día se reutiliza siempre.
   */
  reusarCourseHcp?: boolean
  /**
   * CR/slope YA resueltos para el diferencial de esta fila (la misma fila de
   * course_tees, con el género del jugador). El course handicap del tope sale de
   * ellos para que tope y diferencial nunca usen filas distintas (M y F comparten
   * `nombre`). Sin ellos se resuelven con `resolverCourseData`.
   */
  ratings?: RatingsResueltos
}

/** CR/slope del diferencial (`resolveRatings` / `fetchRatingsDelTee`). */
export interface RatingsResueltos {
  cr: number
  slope: number
  nineHoleRatings: { cr9h: number; slope9h: number } | null
}

/**
 * Ratings guardados en una fila del historial, para recalcular desde ella sin el
 * tee. Los de 9 hoyos viajan en `metadata.ratings_9h` cuando quien guardó la fila
 * ya los resolvió (torneo de 9: CR de 9 publicado del tee, cancha de 9 hoyos): sin
 * ellos el recálculo parte `course_rating` al medio, y en una cancha de 9 hoyos
 * —cuyo rating ya es de 9— eso da un diferencial ~+40.
 */
export function ratingsGuardadosDeLaFila(f: {
  course_rating: number | string | null
  slope_rating: number | string | null
  metadata?: Record<string, unknown> | null
}): RatingsResueltos | null {
  const cr = Number(f.course_rating), slope = Number(f.slope_rating)
  if (!f.course_rating || !f.slope_rating || !Number.isFinite(cr) || !Number.isFinite(slope)) return null
  const r9 = f.metadata?.ratings_9h as { cr9h?: unknown; slope9h?: unknown } | null | undefined
  const cr9h = Number(r9?.cr9h), slope9h = Number(r9?.slope9h)
  const nineHoleRatings = r9 && cr9h > 0 && slope9h > 0 ? { cr9h, slope9h } : null
  return { cr, slope, nineHoleRatings }
}

/**
 * `metadata` con el detalle del ajuste (`ajuste_whs`). Sin ajuste se quita el
 * detalle viejo: no puede quedar uno que no corresponde al diferencial nuevo.
 */
export function metadataConAjusteWHS<M extends Record<string, unknown>>(
  metadata: M | null | undefined,
  ajuste: GrossAjustadoDeFila | null,
): M | Record<string, unknown> | null {
  if (ajuste) return { ...(metadata ?? {}), ajuste_whs: ajuste.metadata }
  if (!metadata || !('ajuste_whs' in metadata)) return metadata ?? null
  const { ajuste_whs: _viejo, ...resto } = metadata
  void _viejo
  return resto
}

/** La ronda cuyo índice del día se busca. `guardadaEn`: cuándo se guardó la fila (null = ahora). */
export interface RondaDelTope { playedAt: string; guardadaEn?: string | null }


async function fetchFuentesIndiceDelDia(supabase: Client, userId: string) {
  const [historial, perfil, filas] = await Promise.all([
    supabase.from('indice_historial').select('indice, fecha').eq('user_id', userId),
    supabase.from('profiles').select('indice').eq('id', userId).maybeSingle(),
    // Las más recientes primero: el corte de 1000 filas de PostgREST deja fuera las viejas.
    supabase.from('historical_rounds').select(INDEX_WINDOW_COLUMNS).eq('user_id', userId).order('played_at', { ascending: false }),
  ])
  const error = historial.error ?? perfil.error ?? filas.error
  if (error) {
    void captureError(error, { context: 'tope-whs.indice-del-dia', level: 'warning', userId })
    return null
  }
  return {
    historial: (historial.data ?? []) as RegistroIndice[],
    federadoActual: (perfil.data as { indice?: number | null } | null)?.indice ?? null,
    filas: (filas.data ?? []) as IndexWindowRound[],
  }
}

/**
 * Índice del día (`indiceDelDia`) de las rondas de un jugador, con sus fuentes leídas
 * una sola vez por lote: su historial federado, el federado del perfil y sus rondas.
 * RLS deja leerlas sólo al dueño o al service role. Si una lectura falla se reporta y
 * vuelve null (par + 5, el tope más alto).
 */
export function indicesDelDia(supabase: Client, userId: string): (ronda: RondaDelTope) => Promise<number | null> {
  let fuentes: ReturnType<typeof fetchFuentesIndiceDelDia> | null = null
  return async ({ playedAt, guardadaEn = null }) => {
    const f = await (fuentes ??= fetchFuentesIndiceDelDia(supabase, userId))
    if (!f) return null
    return indiceDelDia({
      historial: f.historial, playedAt, guardadaEn, federadoActual: f.federadoActual,
      golfersAntes: indiceGolfersAntesDe(f.filas, playedAt),
    })
  }
}

/**
 * Índice con el que se topa una tarjeta: el declarado en la ronda (si lo hay, no se
 * lee nada) o el del día de la ronda (`indicesDelDia`). `null` = sin índice (Regla
 * 3.1a, par + 5).
 */
export async function fetchIndiceParaTope(
  supabase: Client,
  userId: string | null,
  ronda: RondaDelTope,
  deLaRonda: number | null = null,
): Promise<number | null> {
  const declarado = indiceParaTope({ deLaRonda })
  if (declarado != null || !userId) return declarado
  return indicesDelDia(supabase, userId)(ronda)
}

/** El ajuste ya guardado en la fila (si lo hay): su índice y course handicap son los del día. */
function ajustePrevio(metadata: FilaParaAjuste['metadata']): AjusteWHSMetadata | null {
  const a = metadata?.ajuste_whs as Partial<AjusteWHSMetadata> | null | undefined
  if (!a || typeof a !== 'object' || !('indice' in a)) return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    course_hcp: num(a.course_hcp),
    indice: num(a.indice),
    si_fuente: a.si_fuente ?? 'desconocido',
    hoyos_topados: [],
    hoyos_sin_par: [],
    tee: typeof a.tee === 'string' ? a.tee : null,
    hoyos_reparto: num(a.hoyos_reparto) ?? undefined,
  }
}

/**
 * Adjusted Gross Score de una fila del historial. `null` cuando no hay nada que
 * topar con honestidad: tarjeta de FedeGolf (su diferencial es el oficial), bola
 * compartida (score del equipo) o fila sin golpes por hoyo. El que llama sigue
 * entonces con `total_gross`, como antes. No lanza por errores de PostgREST: un
 * catálogo que no responde se trata como desconocido (tope más alto).
 */
export async function grossAjustadoDeFila(
  supabase: Client,
  fila: FilaParaAjuste,
  opts: OpcionesAjusteFila,
): Promise<GrossAjustadoDeFila | null> {
  if (fila.import_source === 'fedegolf') return null
  if (isSharedBallFormat(fila.formato_juego)) return null
  if (!Array.isArray(fila.scores) || fila.scores.length === 0) return null

  const hoyosMeta = Array.isArray(fila.metadata?.hoyos) && fila.metadata!.hoyos!.length === fila.scores.length
    ? fila.metadata!.hoyos!
    : null
  // Número real de cada posición de la tarjeta.
  const hoyosTarjeta = hoyosMeta ?? fila.scores.map((_, i) => i + 1)
  const scores: Record<number, number> = {}
  fila.scores.forEach((s, i) => {
    if (typeof s === 'number' && Number.isFinite(s) && s >= 1) scores[hoyosTarjeta[i]] = s
  })
  const jugados = hoyosTarjeta.filter(h => scores[h] != null)
  if (jugados.length === 0) return null

  // Los hoyos que cuentan para el reparto: los de la tarjeta, salvo que una tarjeta
  // de más de 9 casillas tenga 9 o menos jugados (el diferencial la trata como de 9).
  const hoyos = hoyosTarjeta.length > 9 && jugados.length <= 9 ? jugados : hoyosTarjeta
  const roundHoles = hoyos.length <= 9 ? 9 : 18

  const catalogo = await catalogoDeLaFila(supabase, fila, hoyosTarjeta, hoyosMeta != null, opts.cache)
  const parPorHoyo = parDeLaFila(fila, hoyosTarjeta, catalogo.pares, 'tope')
  const siPorHoyo = catalogo.siFuente === 'catalogo' && hoyos.every(h => catalogo.si[h] != null)
    ? normalizedStrokeIndexByHole(hoyos.map(h => ({ numero: h, stroke_index: catalogo.si[h] })), hoyos.length, hoyos)
    : null
  const siFuente: FuenteSI = siPorHoyo ? 'catalogo' : catalogo.siFuente === 'catalogo' ? 'desconocido' : catalogo.siFuente

  // El índice del día de la ronda: si la fila ya tiene su ajuste, se reutiliza. El
  // CH guardado, sólo si quien llama lo pide (corregir golpes), no trae los ratings del
  // diferencial (que mandan: tope y diferencial salen de los mismos) y vale para el mismo
  // tee y el mismo reparto de hoyos.
  const previo = ajustePrevio(fila.metadata)
  const tee = fila.tee_color ?? null
  const indice = previo ? previo.indice : typeof opts.indice === 'function' ? await opts.indice() : opts.indice
  const courseHcp = indice == null
    ? null
    : opts.reusarCourseHcp && !opts.ratings && previo && previo.course_hcp != null && previo.tee === tee && previo.hoyos_reparto === hoyos.length
      ? previo.course_hcp
      : await courseHcpDeLaFila(supabase, fila, indice, roundHoles, hoyos, parDeLaFila(fila, hoyosTarjeta, catalogo.pares, 'courseHcp'), opts.cache, opts.ratings)
  const r = grossAjustadoWHS({ scores, hoyos, parPorHoyo, siPorHoyo, courseHcp })
  const ctx = { courseHcp, indice, siFuente, tee, hoyosReparto: hoyos.length }
  return { ...r, courseHcp, indice, siFuente, metadata: metadataAjusteWHS(r, ctx) }
}

/**
 * `grossAjustadoDeFila` para los caminos que GUARDAN una tarjeta (ronda libre,
 * import, torneo). Nunca lanza: si algo falla (red, catálogo) se reporta y vuelve
 * `null`, y la ronda se guarda con el diferencial sobre el bruto (más alto: nunca
 * baja el índice de más). Perder la ronda por el tope sería peor que no toparla.
 */
export async function grossAjustadoAlGuardar(
  supabase: Client,
  fila: FilaParaAjuste,
  opts: OpcionesAjusteFila,
  reporte: { context: string; meta?: Record<string, unknown> },
): Promise<GrossAjustadoDeFila | null> {
  try {
    return await grossAjustadoDeFila(supabase, fila, opts)
  } catch (e) {
    void captureError(e, { context: reporte.context, level: 'warning', meta: reporte.meta })
    return null
  }
}

/** `RatingsResueltos` con la forma que pide `diferencialDeTarjeta`. */
export function ratingsDelDiferencial(r: RatingsResueltos | null | undefined): {
  slope: number | null; cr: number | null; nineHole: { cr9h: number; slope9h: number } | null
} {
  return { slope: r?.slope ?? null, cr: r?.cr ?? null, nineHole: r?.nineHoleRatings ?? null }
}

/**
 * Par por número de hoyo de la fila, entre la tarjeta (`par_per_hole`, posicional) y
 * el catálogo. Un par de relleno nunca cuenta: en las tarjetas de ronda libre
 * `par_per_hole` copia el par del scorer, que rellena con par 4 los hoyos que el
 * catálogo no tiene, así que ahí manda sólo el catálogo. En el resto (importadas,
 * foto) cualquiera de los dos puede estar mal cargado, y se elige el que deja el
 * tope más alto (el índice nunca baja de más):
 * - `tope`: el MAYOR (tope por hoyo = par + 2 + golpes).
 * - `courseHcp`: el MENOR. CH = índice × slope/113 + (CR − par): un par de más baja
 *   el CH, y con él el tope de TODOS los hoyos (Regla 6.1: el par de la cancha).
 */
function parDeLaFila(
  fila: FilaParaAjuste,
  hoyosTarjeta: readonly number[],
  parCatalogo: Record<number, number>,
  para: 'tope' | 'courseHcp',
): Record<number, number> {
  if (fila.metadata?.ronda_libre_jugador_id) return { ...parCatalogo }
  const par: Record<number, number> = { ...parCatalogo }
  for (const [pos, p] of Object.entries(normalizeParPerHole(fila.par_per_hole))) {
    const hoyo = hoyosTarjeta[Number(pos) - 1]
    if (hoyo == null) continue
    const catalogo = par[hoyo]
    par[hoyo] = catalogo == null ? p : para === 'tope' ? Math.max(p, catalogo) : Math.min(p, catalogo)
  }
  return par
}

/**
 * Par y SI del catálogo por número de hoyo de la tarjeta. Sólo hoyos que existen
 * en el catálogo (nunca el relleno a par 4). Sin catálogo, o con un catálogo
 * ambiguo (varios recorridos con la misma numeración y no se sabe cuál se jugó),
 * no aporta nada. Una tarjeta de 9 sin `metadata.hoyos` en una cancha de más de
 * 9 hoyos no dice si fue el front o el back: `front_asumido`, sin datos.
 */
async function catalogoDeLaFila(
  supabase: Client,
  fila: FilaParaAjuste,
  hoyosTarjeta: readonly number[],
  hoyosConocidos: boolean,
  cache: CacheAjusteWHS | undefined,
): Promise<{ pares: Record<number, number>; si: Record<number, number>; siFuente: FuenteSI }> {
  const vacio = (siFuente: FuenteSI) => ({ pares: {}, si: {}, siFuente })
  if (!fila.course_id) return vacio('desconocido')
  let filas
  try {
    const courseId = fila.course_id
    const recorridos = fila.metadata?.recorridos ?? null
    filas = await memo(cache, `hoyos|${courseId}|${(recorridos ?? []).join(',')}`, () => fetchHoyosDeLaRonda(supabase, courseId, recorridos))
  } catch (e) {
    // Sin catálogo no se topa con par/SI inventados: el tope queda en lo más alto.
    void captureError(e, { context: 'ajuste-whs.catalogo', level: 'warning', meta: { courseId: fila.course_id } })
    return vacio('desconocido')
  }
  const catalogo = catalogoPorHoyo(filas, hoyosTarjeta)
  if (!catalogo) return vacio('desconocido')
  if (!hoyosConocidos && hoyosTarjeta.length <= 9 && filas.length > 9) return vacio('front_asumido')
  return { ...catalogo, siFuente: 'catalogo' }
}

/**
 * FUENTE ÚNICA de cómo el catálogo (`course_holes`) da el par y el SI de los hoyos
 * de una tarjeta, por número REAL de hoyo (la vuelta de `hoyosDeLaVuelta`: una
 * cancha de 9 jugada en 18 repite sus hoyos). `null` si el catálogo está vacío o
 * es ambiguo (números de hoyo repetidos, p. ej. recorridos de un club de 27h):
 * ahí no se topa con un par que podría ser de otro recorrido.
 */
export function catalogoPorHoyo(
  filas: HoyoDeCatalogo[],
  hoyosTarjeta: readonly number[],
): { pares: Record<number, number>; si: Record<number, number> } | null {
  if (filas.length === 0 || hoyosTarjeta.length === 0) return null
  if (new Set(filas.map(f => f.numero)).size !== filas.length) return null
  const porNumero = new Map(filas.map(f => [f.numero, f]))
  const vuelta = hoyosDeLaVuelta(filas, Math.max(...hoyosTarjeta))
  const pares: Record<number, number> = {}
  const si: Record<number, number> = {}
  for (const h of vuelta) {
    const origen = h.origen != null ? porNumero.get(h.origen) : undefined
    if (!origen) continue
    if (typeof origen.par === 'number' && origen.par > 0) pares[h.numero] = h.par
    if (typeof origen.stroke_index === 'number' && origen.stroke_index > 0) si[h.numero] = h.stroke_index
  }
  return { pares, si }
}

/**
 * Course handicap de los hoyos de la tarjeta (Regla 6.1; 9 hoyos → CH de 9). Sin
 * índice → `null`. Sin datos de cancha creíbles NO se aproxima con el índice
 * (podría quedar bajo el real y bajar el tope): `null`, tope par + 5.
 */
async function courseHcpDeLaFila(
  supabase: Client,
  fila: FilaParaAjuste,
  indice: number | null,
  roundHoles: number,
  hoyos: readonly number[],
  parPorHoyo: Record<number, number>,
  cache: CacheAjusteWHS | undefined,
  ratings?: RatingsResueltos,
): Promise<number | null> {
  if (indice == null) return null
  const pares = hoyos.map(h => parPorHoyo[h])
  const parTotal = pares.every(p => typeof p === 'number') ? pares.reduce((a, b) => a + b, 0) : undefined
  if (ratings) {
    // Sin par conocido no hay CH (no se inventa el par): tope sin índice.
    if (parTotal == null) return null
    // 9 hoyos: los mismos CR/slope de 9 que usa el diferencial (publicados o CR/2).
    const r9 = ratingsDe9DelDiferencial(ratings.cr, ratings.slope, ratings.nineHoleRatings)
    const cd = roundHoles <= 9
      ? { slope: r9.slope9h, courseRating: r9.cr9h, par: parTotal, is9Hole: true }
      : { slope: ratings.slope, courseRating: ratings.cr, par: parTotal }
    return courseHandicapDeLaCancha(indice, cd, roundHoles)
  }
  // Sin tee no se sabe de qué fila salen los ratings: buscar con '' sería
  // `ilike '%'` (un tee cualquiera de la cancha). Sin CH: tope par + 5.
  if (!fila.course_id || !fila.tee_color) return null
  let courseData
  try {
    const { course_id: courseId, tee_color: tee } = fila
    const recorridos = fila.metadata?.recorridos ?? null
    courseData = await memo(cache, `cd|${courseId}|${tee}|${roundHoles}|${parTotal ?? ''}|${(recorridos ?? []).join(',')}`,
      () => resolverCourseData(supabase as SupabaseClient, courseId, tee, roundHoles, parTotal, recorridos))
  } catch {
    return null
  }
  return courseHandicapDeLaCancha(indice, courseData, roundHoles)
}
