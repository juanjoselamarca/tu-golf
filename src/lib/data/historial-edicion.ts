// ─── Capa de datos — corregir los golpes de una ronda del historial ─────────
//
// Antes `useRoundActions.saveEdit` hacía el UPDATE desde el hook (supabase.from
// en src/app) y sólo escribía `scores` + `total_gross`: el `diferencial` quedaba
// el de antes y `calcular_indice_golfers` (que promedia esa columna) recalculaba
// el índice con el número viejo. Corregir una tarjeta no movía el índice.
//
// Ahora, en un solo lugar: hoyos jugados, total, diferencial con la MISMA regla
// que el guardado (`diferencialRecalculado` → `diferencialDeTarjeta`: bola
// compartida y WHS 2.2) y ratings resueltos igual que al guardar la tarjeta
// (`fetchRatingsDelTee`: tee de la fila + rating de la mitad de 9). Un hoyo corregido deja de ser "estimado" (sale de `metadata.estimados`):
// el jugador anotó su score real.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hoyosDesdeElUno } from '@/golf/core/hoyos-jugados'
import { fetchRatingsDelTee } from './ronda-libre-finalizar'
import { diferencialRecalculado } from './recompute-tee-rounds'

type Estimado = { hoyo: number; motivo: string }

interface FilaParaEditar {
  user_id: string
  import_source: string | null
  course_id: string | null
  tee_color: string | null
  slope_rating: number | null
  course_rating: number | null
  formato_juego: string | null
  scores: (number | null)[] | null
  metadata: { hoyos?: number[]; estimados?: Estimado[] } & Record<string, unknown> | null
}

/**
 * Estimados que siguen siéndolo: los hoyos cuyo score NO cambió. `scores` es
 * posicional por número de hoyo; `metadata.hoyos` dice el número real de cada
 * posición (una ronda de 9 desde el 10 guarda 10..18 en las posiciones 0..8).
 */
export function estimadosTrasEditar(
  estimados: readonly Estimado[] | null | undefined,
  hoyos: readonly number[] | null | undefined,
  antes: readonly (number | null)[],
  despues: readonly (number | null)[],
): Estimado[] {
  if (!estimados?.length) return []
  const numeroDe = (i: number) => hoyos?.[i] ?? i + 1
  const cambiados = new Set<number>()
  const n = Math.max(antes.length, despues.length)
  for (let i = 0; i < n; i++) if ((antes[i] ?? null) !== (despues[i] ?? null)) cambiados.add(numeroDe(i))
  return estimados.filter(e => !cambiados.has(e.hoyo))
}

/** ¿Se pueden corregir los golpes de esta ronda? Las de FedeGolf (oficiales, sin golpes por hoyo) no. */
export function esRondaEditable(r: { import_source?: string | null }): boolean {
  return r.import_source !== 'fedegolf'
}

export type ResultadoEdicion =
  | { ok: true; scores: (number | null)[]; total_gross: number | null; holes_played: number; diferencial: number | null; metadata: FilaParaEditar['metadata'] }
  | { ok: false; reason: 'error' | 'noop'; error?: unknown }

/**
 * Guarda los golpes corregidos de una ronda propia y recalcula su diferencial. No
 * recalcula el índice: eso lo hace el que llama (`calcular_indice_golfers`).
 */
export async function actualizarScoresDeRonda(
  supabase: SupabaseClient,
  input: { id: string; scores: (number | null)[] },
): Promise<ResultadoEdicion> {
  const { data: fila, error: errLectura } = await supabase
    .from('historical_rounds')
    .select('user_id, import_source, course_id, tee_color, slope_rating, course_rating, formato_juego, scores, metadata')
    .eq('id', input.id)
    .single()
  if (errLectura || !fila) return { ok: false, reason: errLectura ? 'error' : 'noop', error: errLectura }
  const f = fila as FilaParaEditar
  // Tarjeta oficial de FedeGolf: no trae golpes por hoyo y su diferencial es el oficial;
  // recalcularlo desde casillas tipeadas lo pisaría con uno inventado.
  if (!esRondaEditable(f)) return { ok: false, reason: 'error', error: new Error('ronda importada de FedeGolf: no se edita') }
  // Una ronda de 9 no puede pasar a 10+ hoyos porque se tipeó una casilla de más.
  const scores = f.metadata?.hoyos ? input.scores.slice(0, f.metadata.hoyos.length) : input.scores

  const jugados = scores.filter((s): s is number => s != null && s >= 1)
  const total = jugados.reduce((a, b) => a + b, 0)
  const totalGross = total > 0 ? total : null
  const estimados = estimadosTrasEditar(f.metadata?.estimados, f.metadata?.hoyos, f.scores ?? [], scores)
  const metadata = f.metadata ? { ...f.metadata, estimados } : f.metadata
  if (metadata && estimados.length === 0) delete (metadata as { estimados?: unknown }).estimados

  // Ratings: los del tee (con el rating de la mitad de 9 hoyos), como al guardar; si
  // no se resuelven, los guardados en la fila (sin rating de 9).
  let resolved: { cr: number; slope: number; nineHoleRatings: { cr9h: number; slope9h: number } | null } | null = null
  if (f.course_id && f.tee_color) {
    const hoyos = f.metadata?.hoyos ?? hoyosDesdeElUno(scores.length)
    const r = await fetchRatingsDelTee(supabase, f.course_id, f.tee_color, hoyos)
    if (r.cr && r.slope) resolved = { cr: Number(r.cr), slope: Number(r.slope), nineHoleRatings: r.nineHole }
  }
  if (!resolved && f.course_rating && f.slope_rating) {
    resolved = { cr: Number(f.course_rating), slope: Number(f.slope_rating), nineHoleRatings: null }
  }
  const diferencial = resolved
    ? diferencialRecalculado({ total_gross: totalGross, holes_played: jugados.length, formato_juego: f.formato_juego, metadata }, resolved)
    : null

  const { data, error } = await supabase
    .from('historical_rounds')
    .update({ scores, total_gross: totalGross, holes_played: jugados.length, diferencial, metadata })
    .eq('id', input.id)
    .select('id')
  if (error || !data || data.length === 0) return { ok: false, reason: error ? 'error' : 'noop', error }
  return { ok: true, scores, total_gross: totalGross, holes_played: jugados.length, diferencial, metadata }
}

/* ── Las demás mutaciones del historial (antes, supabase.from en el hook) ──── */

/** Filas afectadas (`.select('id')`): 0 = RLS la filtró o ya no existía. */
export interface ResultadoMutacion { filas: number; error: unknown | null }

async function filas(q: PromiseLike<{ data: unknown[] | null; error: unknown | null }>): Promise<ResultadoMutacion> {
  const { data, error } = await q
  return { filas: data?.length ?? 0, error: error ?? null }
}

export function borrarRonda(supabase: SupabaseClient, id: string): Promise<ResultadoMutacion> {
  return filas(supabase.from('historical_rounds').delete().eq('id', id).select('id'))
}

export function marcarExcluidaDelIndice(supabase: SupabaseClient, id: string, excluida: boolean): Promise<ResultadoMutacion> {
  return filas(supabase.from('historical_rounds').update({ excluded_from_handicap: excluida }).eq('id', id).select('id'))
}

/** Borra TODAS las rondas de `userId` (filtro explícito además de RLS: jamás filas ajenas). */
export function borrarTodasLasRondas(supabase: SupabaseClient, userId: string): Promise<ResultadoMutacion> {
  return filas(supabase.from('historical_rounds').delete().eq('user_id', userId).select('id'))
}

/** Recalcula el índice y lo devuelve (`null` si < 3 rondas válidas); `error` si la RPC falló. */
export async function recalcularYLeerIndice(supabase: SupabaseClient, userId: string): Promise<{ indice: number | null; error: unknown | null }> {
  const { data, error } = await supabase.rpc('calcular_indice_golfers', { p_user_id: userId })
  return { indice: typeof data === 'number' ? data : null, error: error ?? null }
}
