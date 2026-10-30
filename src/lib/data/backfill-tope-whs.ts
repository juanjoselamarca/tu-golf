// ─── Capa de datos — tope WHS 3.1 sobre las rondas que ya están en el historial (#545, PR3) ─
//
// Los PR1/PR2 topan cada tarjeta NUEVA (Adjusted Gross Score). Las que ya estaban
// guardadas tienen el diferencial sobre el bruto: un 11 en un par 4 pesa entero.
// Esto las re-topa con la MISMA función que el guardado (`grossAjustadoDeFila`) y
// recalcula el diferencial con la MISMA regla (`diferencialRecalculado`).
//
// Regla de oro: el backfill cambia SÓLO lo que cambia el tope. Antes de escribir,
// se reproduce el diferencial guardado (con el bruto o con el `adjusted_gross` ya
// guardado) y unos ratings candidatos (los de la fila; si no calzan, los del tee en
// el catálogo). Si ninguno lo reproduce, la fila tiene otra diferencia (catálogo
// corregido después, regla vieja) y NO se toca: se reporta. Tampoco se toca si la
// suma de los golpes por hoyo no da el `total_gross` (hoyo ilegible, estimado fuera
// de `scores`): el gross ajustado sale de la suma y bajaría el diferencial por algo
// que no es el tope. Así el índice sólo se mueve por el tope.
//
// Índice del tope = el vigente ANTES de la ronda (`indiceDelDia`): federado de ese
// día o, si no hay, el Golfers+ reconstruido con las rondas anteriores. Una fila que ya tiene `metadata.ajuste_whs`
// conserva el suyo (`grossAjustadoDeFila` lo reutiliza).

import type { SupabaseClient } from '@supabase/supabase-js'
import { indiceParaTope } from '@/golf/core/ajuste-whs'
import { hoyosDesdeElUno } from '@/golf/core/hoyos-jugados'
import { computeGolfersIndex } from '@/golf/core/whs-index'
import { indexWindowDifferentials, type IndexWindowRound } from '@/golf/core/index-window'
import { fetchRatingsDelTee } from './ronda-libre-finalizar'
import { diferencialRecalculado } from './recompute-tee-rounds'
import {
  COLS_AJUSTE_WHS,
  grossAjustadoDeFila,
  metadataConAjusteWHS,
  ratingsGuardadosDeLaFila,
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
 * no cuentan: WHS 5.4, las rondas jugadas antes de que se revise el índice, como varias el mismo día, usan el vigente).
 * `filas` con los diferenciales guardados (los que daban el índice de ese día).
 */
export function indiceGolfersAntesDe(filas: ReadonlyArray<IndexWindowRound>, playedAt: string): number | null {
  const dia = playedAt.slice(0, 10)
  return computeGolfersIndex(indexWindowDifferentials(filas.filter(f => f.played_at.slice(0, 10) < dia)))
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
  /** El diferencial guardado no se reproduce (ni con el bruto ni con el ajustado guardado): no se toca. */
  | 'no_reproducible'
  /** La suma de los golpes por hoyo no da `total_gross`: no se toca. */
  | 'bruto_no_calza'
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

/** Ratings candidatos, en orden: los guardados en la fila (con el de 9 si quedó en `metadata.ratings_9h`) y los del tee en el catálogo. */
async function ratingsCandidatos(supabase: SupabaseClient, f: FilaBackfillTope, cache: CacheAjusteWHS): Promise<RatingsResueltos[]> {
  const out: RatingsResueltos[] = []
  const guardados = ratingsGuardadosDeLaFila(f)
  if (guardados) out.push(guardados)
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

  // Ratings con los que el diferencial guardado se reproduce: desde el bruto (fila vieja)
  // o desde el `adjusted_gross` guardado (fila ya topada al guardar o por este backfill).
  const grossGuardados: Array<number | null> = antes.adjusted_gross != null ? [null, antes.adjusted_gross] : [null]
  let ratings: RatingsResueltos | null = null
  if (antes.diferencial != null) {
    for (const r of await ratingsCandidatos(supabase, f, cache)) {
      if (grossGuardados.some(g => igual(diferencialRecalculado({ ...f, adjusted_gross: g }, r), antes.diferencial))) { ratings = r; break }
    }
    if (!ratings) return sinCambio('no_reproducible')
  }

  const ajuste = await grossAjustadoDeFila(supabase, f, { indice: () => Promise.resolve(indice), cache, ratings: ratings ?? undefined })
  if (!ajuste) return sinCambio('sin_tope')
  // El gross ajustado es la suma de los golpes topados: sólo vale si esa suma sin topar es el bruto.
  if (ajuste.grossBruto !== toNum(f.total_gross)) return sinCambio('bruto_no_calza')

  const adjusted_gross = ajuste.grossAjustado
  // Sin diferencial guardado no se crea uno: el backfill no hace contar rondas nuevas.
  const recalculado = ratings ? diferencialRecalculado({ ...f, adjusted_gross }, ratings) : null
  const difCambia = !igual(recalculado, antes.diferencial)
  // Si el tope no lo mueve, queda el guardado (no se re-escribe por un redondeo distinto).
  const diferencial = difCambia ? recalculado : antes.diferencial
  const despues = { adjusted_gross, diferencial }
  const hoyosTopados = ajuste.metadata.hoyos_topados.length
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

// ─── Migración SQL del backfill ──────────────────────────────────────────────
//
// Las escrituras de datos en prod van como migración (`docs/CONVENCIONES_TECNICAS.md`):
// el script calcula todo con el motor (TypeScript) y deja el resultado como UPDATEs
// literales que `migraciones-prod` aplica tras la aprobación. Cada UPDATE exige que la
// fila siga como se leyó (si alguien la editó entre medio, se salta y se cuenta).

const TAG = '$backfill_tope_whs$'
const num = (n: number | null) => (n == null ? 'NULL' : String(n))
/** El diferencial se guarda DECIMAL(5,2): se escribe y se compara ya redondeado. */
const dif2 = (n: number | null) => (n == null ? null : Number(n.toFixed(2)))
const jsonb = (v: unknown) => {
  const s = JSON.stringify(v)
  if (s.includes(TAG)) throw new Error('metadata con el delimitador del bloque SQL')
  return `'${s.replace(/'/g, "''")}'::jsonb`
}
const metadataObjeto = `CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END`

/**
 * Copia del diferencial en las métricas del coach (`round_metrics`, que no se re-calculan:
 * upsert con ignoreDuplicates). Se re-derivan con la fórmula de `computeRoundMetric`
 * (`round1(dif − índice)` = Math.round, de ahí floor(x·10 + 0,5)/10), conservando el índice
 * y la meta congelados en esa fila.
 */
const metricasDelCoach = (id: string, dif: number) =>
  `UPDATE public.round_metrics SET delta_vs_handicap_expected = floor((${dif} - handicap_at_time) * 10 + 0.5) / 10, `
  + `delta_vs_target_handicap = CASE WHEN target_at_time IS NULL THEN NULL ELSE floor((${dif} - target_at_time) * 10 + 0.5) / 10 END `
  // handicap_at_time NULL daría NULL en una columna NOT NULL y abortaría el bloque entero.
  + `WHERE round_id = '${id}' AND handicap_at_time IS NOT NULL;`

interface PasoSql { update: string; /** Sólo si el UPDATE tocó la fila. */ luego: string | null }

function bloque(titulo: string, pasos: PasoSql[], usuarios: string[]): string {
  return [
    `-- ${titulo}`,
    `DO ${TAG}`,
    'DECLARE n integer := 0; c integer;',
    'BEGIN',
    ...pasos.flatMap(p => [
      `  ${p.update}`,
      '  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;',
      ...(p.luego ? [`  IF c > 0 THEN ${p.luego} END IF;`] : []),
    ]),
    // WARNING sí llega al cliente (`supabase db push` no muestra NOTICE): filas editadas entre la
    // generación y la aplicación quedan sin topar; se re-corre el dry-run y, si hay, otra migración.
    `  IF n < ${pasos.length} THEN RAISE WARNING 'backfill tope WHS: % de % filas (el resto cambió después de generarse: re-correr el dry-run)', n, ${pasos.length}; END IF;`,
    `  RAISE NOTICE 'backfill tope WHS: % de % filas', n, ${pasos.length};`,
    ...usuarios.map(u => `  PERFORM public.calcular_indice_golfers('${u}'::uuid);`),
    `END ${TAG};`,
    '',
  ].join('\n')
}

/**
 * Migración y rollback del backfill para las filas con `update`. `filas` = las leídas
 * (los valores de antes, para la condición y para el rollback).
 */
export function sqlDelBackfill(
  resultados: readonly ResultadoBackfillFila[],
  filas: ReadonlyMap<string, Pick<FilaBackfillTope, 'id' | 'user_id' | 'adjusted_gross' | 'diferencial' | 'metadata'>>,
): { migracion: string; rollback: string; filas: number } {
  const aEscribir = resultados.filter(r => r.update)
  const usuarios = [...new Set(aEscribir.map(r => r.user_id))].sort()
  const adelante: PasoSql[] = []
  const atras: PasoSql[] = []
  for (const r of aEscribir) {
    const f = filas.get(r.id)
    if (!f) throw new Error(`fila ${r.id} sin datos de antes`)
    if (!/^[0-9a-f-]{36}$/i.test(r.id) || !/^[0-9a-f-]{36}$/i.test(r.user_id)) throw new Error(`id inválido ${r.id}`)
    const u = r.update!
    const antesA = toNum(f.adjusted_gross), antesD = dif2(toNum(f.diferencial))
    const nuevoD = dif2(u.diferencial)
    const ajuste = (u.metadata as { ajuste_whs?: unknown } | null)?.ajuste_whs
    if (ajuste === undefined) throw new Error(`fila ${r.id} sin ajuste_whs`)
    const difCambia = nuevoD != null && antesD != null && nuevoD !== antesD
    adelante.push({
      update: `UPDATE public.historical_rounds SET adjusted_gross = ${num(u.adjusted_gross)}, diferencial = ${num(nuevoD)}, `
        + `metadata = ${metadataObjeto} || jsonb_build_object('ajuste_whs', ${jsonb(ajuste)}) `
        + `WHERE id = '${r.id}' AND diferencial IS NOT DISTINCT FROM ${num(antesD)} AND adjusted_gross IS NOT DISTINCT FROM ${num(antesA)};`,
      luego: difCambia ? metricasDelCoach(r.id, nuevoD) : null,
    })
    const viejo = f.metadata != null && typeof f.metadata === 'object' && 'ajuste_whs' in f.metadata
      ? ` || jsonb_build_object('ajuste_whs', ${jsonb((f.metadata as { ajuste_whs: unknown }).ajuste_whs)})` : ''
    // Metadata NULL antes: vuelve a NULL si nadie le agregó otra clave después.
    const sinAjuste = f.metadata == null ? `NULLIF(${metadataObjeto} - 'ajuste_whs', '{}'::jsonb)` : `(${metadataObjeto} - 'ajuste_whs')${viejo}`
    atras.push({
      update: `UPDATE public.historical_rounds SET adjusted_gross = ${num(antesA)}, diferencial = ${num(antesD)}, metadata = ${sinAjuste} `
        + `WHERE id = '${r.id}' AND diferencial IS NOT DISTINCT FROM ${num(nuevoD)} AND adjusted_gross IS NOT DISTINCT FROM ${num(u.adjusted_gross)};`,
      luego: difCambia ? metricasDelCoach(r.id, antesD!) : null,
    })
  }
  return {
    migracion: bloque('Backfill del tope WHS 3.1 (#545, PR3). Generado por scripts/backfill-adjusted-gross.ts --migracion.', adelante, usuarios),
    rollback: bloque('Rollback del backfill del tope WHS 3.1 (#545): sólo filas que siguen como las dejó el backfill.', atras, usuarios),
    filas: aEscribir.length,
  }
}

/** Inverse of `sqlDelBackfill`'s rollback: each row it restores, with the differential it had before that backfill. */
export function differentialsBeforeBackfill(rollbackSql: string): Map<string, number | null> {
  return new Map(
    [...rollbackSql.matchAll(/^ {2}UPDATE public\.historical_rounds SET adjusted_gross = (?:NULL|[\d.-]+), diferencial = (NULL|[\d.-]+), .*? WHERE id = '([0-9a-f-]{36})'/gm)]
      .map(m => [m[2], m[1] === 'NULL' ? null : Number(m[1])] as const),
  )
}
