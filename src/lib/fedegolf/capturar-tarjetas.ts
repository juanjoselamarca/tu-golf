/**
 * Captura idempotente de tarjetas FedeGolf en `historical_rounds`.
 *
 * - Upsert por `(user_id, fedegolf_ticket)` → re-sync no duplica y refresca el
 *   diferencial si la fede lo reprocesó (spec D1/D5).
 * - `import_source='fedegolf'` + `excluded_from_handicap=TRUE` → las tarjetas
 *   NO alimentan el índice Golfers+ (spec D7); el oficial vive en profiles.indice.
 * - `course_id` es best-effort: se resuelve con un resolver inyectable (default
 *   null). Si no matchea el catálogo, la tarjeta igual sirve (trae CR/slope).
 */

import type { FedegolfTarjeta } from './types'

/** Fila que insertamos en historical_rounds para una tarjeta FedeGolf. */
export interface HistoricalRoundFedegolfRow {
  user_id: string
  course_name: string
  course_id: string | null
  tee_color: string | null
  played_at: string
  total_gross: number
  course_rating: number
  slope_rating: number
  diferencial: number
  holes_played: number | null
  import_source: 'fedegolf'
  excluded_from_handicap: true
  fedegolf_ticket: string
  vale_doble: boolean
  privacy: 'private'
  formato_juego: 'stroke_play'
  modo_juego: 'gross'
}

/** Cliente mínimo (estructural) que satisface el SupabaseClient real. */
type CaptureClient = {
  from: (table: string) => {
    upsert: (
      rows: unknown[],
      opts: { onConflict: string }
    ) => PromiseLike<{ error: { message: string } | null }>
  }
}

/** Mapeo puro tarjeta → fila. `courseId` best-effort (null si no matchea). */
export function tarjetaToRow(
  userId: string,
  t: FedegolfTarjeta,
  courseId: string | null = null
): HistoricalRoundFedegolfRow {
  return {
    user_id: userId,
    course_name: t.clubCancha,
    course_id: courseId,
    tee_color: t.tee,
    played_at: t.fechaJuego,
    total_gross: t.scoreGross,
    course_rating: t.courseRating,
    slope_rating: t.slope,
    diferencial: t.diferencial,
    holes_played: t.holes,
    import_source: 'fedegolf',
    excluded_from_handicap: true,
    fedegolf_ticket: t.ticket,
    vale_doble: t.valeDoble,
    privacy: 'private',
    formato_juego: 'stroke_play',
    modo_juego: 'gross',
  }
}

/**
 * Upsert idempotente de un lote de tarjetas. `resolverCourseId` mapea el nombre
 * crudo de cancha → course_id del catálogo (best-effort; default: null).
 */
export async function capturarTarjetas(
  supabase: CaptureClient,
  userId: string,
  tarjetas: FedegolfTarjeta[],
  resolverCourseId: (clubCancha: string) => Promise<string | null> = () => Promise.resolve(null)
): Promise<{ total: number }> {
  if (tarjetas.length === 0) return { total: 0 }

  // Resolver course_id una vez por cancha distinta (best-effort).
  const canchas = [...new Set(tarjetas.map((t) => t.clubCancha))]
  const courseIdByCancha = new Map<string, string | null>()
  for (const cancha of canchas) {
    try {
      courseIdByCancha.set(cancha, await resolverCourseId(cancha))
    } catch {
      courseIdByCancha.set(cancha, null)
    }
  }

  const rows = tarjetas.map((t) => tarjetaToRow(userId, t, courseIdByCancha.get(t.clubCancha) ?? null))

  const { error } = await supabase
    .from('historical_rounds')
    .upsert(rows, { onConflict: 'user_id,fedegolf_ticket' })

  if (error) {
    throw new Error(`fedegolf: error capturando tarjetas — ${error.message}`)
  }

  return { total: rows.length }
}
