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
  metadataAjusteWHS,
  type AjusteWHSMetadata,
  type FuenteSI,
  type GrossAjustadoResult,
} from '@/golf/core/ajuste-whs'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { courseHandicapDeLaCancha, resolverCourseData } from '@/golf/core/course-handicap'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { normalizeParPerHole } from '@/golf/coach/hole-pars'
import { isSharedBallFormat } from '@/golf/formats'
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

/**
 * Índice con el que se topa una tarjeta: `profiles.indice` (el declarado/oficial)
 * y, si no hay, el Índice Golfers+. Decisión CTO (#545): un Índice Golfers+ cuenta
 * como índice establecido. `null` = sin índice (Regla 3.1a, par + 5).
 */
export async function fetchIndiceParaTope(supabase: Client, userId: string): Promise<number | null> {
  const { data } = await supabase.from('profiles').select('indice, indice_golfers').eq('id', userId).maybeSingle()
  const p = data as { indice?: number | null; indice_golfers?: number | null } | null
  const v = p?.indice ?? p?.indice_golfers ?? null
  return typeof v === 'number' && Number.isFinite(v) ? v : null
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

  // Par propio de la fila, remapeado de posición a número real de hoyo.
  const parPropio: Record<number, number> = {}
  for (const [pos, par] of Object.entries(normalizeParPerHole(fila.par_per_hole))) {
    const hoyo = hoyosTarjeta[Number(pos) - 1]
    if (hoyo != null) parPropio[hoyo] = par
  }

  const indice = typeof opts.indice === 'function' ? await opts.indice() : opts.indice
  const catalogo = await catalogoDeLaFila(supabase, fila, hoyosTarjeta, hoyosMeta != null, opts.cache)
  const parPorHoyo: Record<number, number> = { ...catalogo.pares, ...parPropio }
  const siPorHoyo = catalogo.siFuente === 'catalogo' && hoyos.every(h => catalogo.si[h] != null)
    ? normalizedStrokeIndexByHole(hoyos.map(h => ({ numero: h, stroke_index: catalogo.si[h] })), hoyos.length, hoyos)
    : null
  const siFuente: FuenteSI = siPorHoyo ? 'catalogo' : catalogo.siFuente === 'catalogo' ? 'desconocido' : catalogo.siFuente

  const courseHcp = await courseHcpDeLaFila(supabase, fila, indice, roundHoles, hoyos, parPorHoyo, opts.cache)
  const r = grossAjustadoWHS({ scores, hoyos, parPorHoyo, siPorHoyo, courseHcp })
  const ctx = { courseHcp, indice, siFuente }
  return { ...r, ...ctx, metadata: metadataAjusteWHS(r, ctx) }
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
  } catch {
    return vacio('desconocido')
  }
  if (filas.length === 0) return vacio('desconocido')
  const numeros = new Set(filas.map(f => f.numero))
  if (numeros.size !== filas.length) return vacio('desconocido')
  if (!hoyosConocidos && hoyosTarjeta.length <= 9 && filas.length > 9) return vacio('front_asumido')

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
  return { pares, si, siFuente: 'catalogo' }
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
): Promise<number | null> {
  if (indice == null || !fila.course_id) return null
  const pares = hoyos.map(h => parPorHoyo[h])
  const parTotal = pares.every(p => typeof p === 'number') ? pares.reduce((a, b) => a + b, 0) : undefined
  let courseData
  try {
    const { course_id: courseId, tee_color: tee } = fila
    const recorridos = fila.metadata?.recorridos ?? null
    courseData = await memo(cache, `cd|${courseId}|${tee ?? ''}|${roundHoles}|${parTotal ?? ''}|${(recorridos ?? []).join(',')}`,
      () => resolverCourseData(supabase as SupabaseClient, courseId, tee ?? '', roundHoles, parTotal, recorridos))
  } catch {
    return null
  }
  return courseHandicapDeLaCancha(indice, courseData, roundHoles)
}
