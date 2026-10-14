// ─── Capa de datos — tope WHS 3.1 sobre las rondas que ya están en el historial (#545, PR3) ─
//
// Los PR1/PR2 topan cada tarjeta NUEVA (Adjusted Gross Score). Las que ya estaban
// guardadas tienen el diferencial sobre el bruto: un 11 en un par 4 pesa entero.
// Esto las re-topa con la MISMA función que el guardado (`grossAjustadoDeFila`) y
// recalcula el diferencial con la MISMA regla (`diferencialRecalculado`).
//
// Regla de oro: el backfill cambia SÓLO lo que cambia el tope. Antes de escribir,
// se reproduce el diferencial guardado con el bruto y unos ratings candidatos (los
// guardados en la fila; si no calzan, los del tee en el catálogo). Si ninguno lo
// reproduce, la fila tiene otra diferencia (catálogo corregido después, regla
// vieja) y NO se toca: se reporta. Así el índice sólo se mueve por el tope.
//
// Índice del tope = el vigente ANTES de la ronda (`indiceDelDia`): federado de ese
// día o, si no hay, el Golfers+ reconstruido con las rondas anteriores. Una fila que ya tiene `metadata.ajuste_whs`
// conserva el suyo (`grossAjustadoDeFila` lo reutiliza).

import type { SupabaseClient } from '@supabase/supabase-js'
import { indiceParaTope } from '@/golf/core/ajuste-whs'
import { hoyosDesdeElUno } from '@/golf/core/hoyos-jugados'
import { calcularIndiceGolfersLocal } from '@/lib/indice-golfers'
import { fetchRatingsDelTee } from './ronda-libre-finalizar'
import { diferencialRecalculado } from './recompute-tee-rounds'
import {
  COLS_AJUSTE_WHS,
  grossAjustadoDeFila,
  metadataConAjusteWHS,
  type CacheAjusteWHS,
  type FilaParaAjuste,
  type RatingsResueltos,
} from './ajuste-whs-fila'

/** Columnas que lee el backfill (incluye las del tope). */
export const COLS_BACKFILL_TOPE = `id, user_id, played_at, total_gross, course_rating, slope_rating, diferencial, adjusted_gross, excluded_from_handicap, ${COLS_AJUSTE_WHS}`

export interface FilaBackfillTope extends FilaParaAjuste {
  id: string
  user_id: string
  played_at: string
  total_gross: number | null
  course_rating: number | null
  slope_rating: number | null
  diferencial: number | null
  adjusted_gross: number | null
  excluded_from_handicap: boolean | null
}

export interface RegistroIndice { indice: number; fecha: string }

/**
 * Índice con el que se topa una ronda vieja: el vigente ANTES de jugarla, con el
 * orden de `indiceParaTope` (federado primero, después Golfers+):
 * 1. federado: el registro de `indice_historial` más reciente con fecha ≤ played_at
 *    (anterior a todos → el primero); sin historial, el federado del perfil
 *    (simplificación documentada: error acotado a ±1 golpe por hoyo topado);
 * 2. Golfers+: el que daban las rondas ANTERIORES (`golfersAntes`, reconstruido);
 *    nunca el de hoy, que puede salir de esa misma ronda;
 * 3. ninguno → null (Regla 3.1a: par + 5).
 */
export function indiceDelDia(p: {
  historial: readonly RegistroIndice[]
  playedAt: string
  federadoActual: number | null
  golfersAntes: number | null
}): number | null {
  const validos = p.historial.filter(h => Number.isFinite(Number(h.indice)) && h.fecha)
    .map(h => ({ indice: Number(h.indice), t: Date.parse(h.fecha) }))
    .filter(h => Number.isFinite(h.t))
    .sort((a, b) => a.t - b.t)
  if (validos.length > 0) {
    // played_at es fecha (AAAA-MM-DD): vale el registro de cualquier hora de ese día.
    const fin = Date.parse(`${p.playedAt.slice(0, 10)}T23:59:59.999Z`)
    const previos = validos.filter(h => h.t <= fin)
    return (previos.length > 0 ? previos[previos.length - 1] : validos[0]).indice
  }
  return indiceParaTope({ perfil: p.federadoActual, golfersPlus: p.golfersAntes })
}

/**
 * Índice Golfers+ que tenía el jugador ANTES del día `playedAt`: la fórmula de
 * `calcular_indice_golfers` sobre sus filas de fechas anteriores (las del mismo día
 * no cuentan: no se sabe el orden). `filas` ya con los diferenciales re-topados.
 */
export function indiceGolfersAntesDe(filas: Parameters<typeof ultimosVeinte>[0], playedAt: string): number | null {
  const dia = playedAt.slice(0, 10)
  return calcularIndiceGolfersLocal(ultimosVeinte(filas.filter(f => f.played_at.slice(0, 10) < dia)))
}

/** ¿La fila entra al backfill? FedeGolf (diferencial oficial), sin golpes por hoyo o excluida a mano: no. */
export function entraAlBackfill(f: Pick<FilaBackfillTope, 'import_source' | 'scores' | 'excluded_from_handicap'>): boolean {
  return f.import_source !== 'fedegolf' && Array.isArray(f.scores) && f.scores.length > 0 && !f.excluded_from_handicap
}

/** Tolerancia al comparar con el diferencial guardado (se guarda con 1-2 decimales). */
const TOL = 0.051
const igual = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) < TOL)

export type EstadoBackfill =
  /** Algún hoyo se topa o el diferencial cambia. */
  | 'cambia'
  /** Ningún hoyo pasa el tope: se escribe sólo `adjusted_gross` (= bruto) y `ajuste_whs` si faltan. */
  | 'igual'
  /** El diferencial guardado no se reproduce con el bruto: no se toca. */
  | 'no_reproducible'
  /** `grossAjustadoDeFila` no topa (bola compartida, sin golpes): no se toca. */
  | 'sin_tope'

export interface ResultadoBackfillFila {
  id: string
  user_id: string
  played_at: string
  estado: EstadoBackfill
  antes: { adjusted_gross: number | null; diferencial: number | null }
  despues: { adjusted_gross: number | null; diferencial: number | null }
  /** Columnas a escribir (null = no se escribe nada). */
  update: { adjusted_gross: number | null; diferencial: number | null; metadata: unknown } | null
  hoyosTopados: number
}

function toNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Ratings candidatos, en orden: los guardados en la fila (sin rating de 9) y los del tee en el catálogo. */
async function ratingsCandidatos(supabase: SupabaseClient, f: FilaBackfillTope, cache: CacheAjusteWHS): Promise<RatingsResueltos[]> {
  const out: RatingsResueltos[] = []
  const cr = toNum(f.course_rating), slope = toNum(f.slope_rating)
  if (cr && slope) out.push({ cr, slope, nineHoleRatings: null })
  if (f.course_id && f.tee_color) {
    const hoyos = Array.isArray(f.metadata?.hoyos) && f.metadata!.hoyos!.length === f.scores!.length
      ? f.metadata!.hoyos! : hoyosDesdeElUno(f.scores!.length)
    const clave = `backfill-tee:${f.course_id}:${f.tee_color}:${hoyos.join(',')}`
    let p = cache.get(clave) as Promise<Awaited<ReturnType<typeof fetchRatingsDelTee>>> | undefined
    if (!p) { p = fetchRatingsDelTee(supabase, f.course_id, f.tee_color, hoyos); cache.set(clave, p) }
    const r = await p
    if (r.cr && r.slope) out.push({ cr: Number(r.cr), slope: Number(r.slope), nineHoleRatings: r.nineHole })
  }
  return out
}

/**
 * Re-topa una fila del historial. NO escribe: devuelve el antes/después y, si
 * corresponde, las columnas a escribir. `indice` = el del día de la ronda.
 */
export async function recalcularTopeDeFila(
  supabase: SupabaseClient,
  f: FilaBackfillTope,
  indice: number | null,
  cache: CacheAjusteWHS,
): Promise<ResultadoBackfillFila> {
  const antes = { adjusted_gross: toNum(f.adjusted_gross), diferencial: toNum(f.diferencial) }
  const base = { id: f.id, user_id: f.user_id, played_at: f.played_at, antes }
  const sinCambio = (estado: EstadoBackfill): ResultadoBackfillFila =>
    ({ ...base, estado, despues: antes, update: null, hoyosTopados: 0 })

  // Ratings con los que el diferencial guardado se reproduce desde el bruto (sin tope).
  let ratings: RatingsResueltos | null = null
  if (antes.diferencial != null) {
    for (const r of await ratingsCandidatos(supabase, f, cache)) {
      const sinTope = diferencialRecalculado({ ...f, adjusted_gross: null }, r)
      if (igual(sinTope, antes.diferencial)) { ratings = r; break }
    }
    if (!ratings) return sinCambio('no_reproducible')
  }

  const ajuste = await grossAjustadoDeFila(supabase, f, { indice: () => Promise.resolve(indice), cache, ratings: ratings ?? undefined })
  if (!ajuste) return sinCambio('sin_tope')

  const adjusted_gross = ajuste.grossAjustado
  // Sin diferencial guardado no se crea uno: el backfill no hace contar rondas nuevas.
  const diferencial = ratings ? diferencialRecalculado({ ...f, adjusted_gross }, ratings) : null
  const despues = { adjusted_gross, diferencial }
  const hoyosTopados = ajuste.metadata.hoyos_topados.length
  const difCambia = !igual(diferencial, antes.diferencial)
  // Idempotente: una fila ya topada igual (mismo gross ajustado y diferencial, con su ajuste_whs) no se re-escribe.
  const escribir = difCambia || adjusted_gross !== antes.adjusted_gross || !(f.metadata != null && 'ajuste_whs' in f.metadata)
  return {
    ...base,
    estado: difCambia || hoyosTopados > 0 ? 'cambia' : 'igual',
    despues,
    update: escribir ? { adjusted_gross, diferencial, metadata: metadataConAjusteWHS(f.metadata, ajuste) } : null,
    hoyosTopados,
  }
}

/**
 * Diferenciales que promedia `calcular_indice_golfers` (mismo filtro): con diferencial y
 * slope/CR, no excluidas, las 20 más recientes por `played_at`.
 */
export function ultimosVeinte(filas: ReadonlyArray<{
  played_at: string; diferencial: number | null; slope_rating: number | null; course_rating: number | null; excluded_from_handicap?: boolean | null
}>): number[] {
  return [...filas]
    .filter(f => f.diferencial != null && f.slope_rating != null && f.course_rating != null && !f.excluded_from_handicap)
    .sort((a, b) => b.played_at.localeCompare(a.played_at))
    .slice(0, 20)
    .map(f => Number(f.diferencial))
}
