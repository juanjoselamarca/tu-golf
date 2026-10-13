// ─── Capa de datos — re-importar una tarjeta Garmin que ya está en el historial ─
//
// Garmin trae un id estable por tarjeta (`garmin_scorecard_id`). Si el usuario
// vuelve a importar el mismo archivo, la fila existente se ACTUALIZA en vez de
// duplicarse. Antes el UPDATE re-escribía los golpes pero no el diferencial: una
// tarjeta corregida en Garmin dejaba en el índice el diferencial viejo (#545).
// Ahora diferencial, `adjusted_gross` y `metadata.ajuste_whs` salen de la MISMA
// fila que se escribe, con la función canónica del tope (WHS 3.1).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSharedBallFormat } from '@/golf/formats'
import { diferencialDeTarjeta } from '@/lib/indice-golfers'
import { resolveTeeRatingsForCourse } from './course-tees'
import {
  grossAjustadoAlGuardar,
  metadataConAjusteWHS,
  ratingsDelDiferencial,
  type RatingsResueltos,
} from './ajuste-whs-fila'

export interface TarjetaGarminReimportada {
  course_name: string
  course_id?: string | null
  tee_color?: string | null
  played_at: string
  /** Golpes por hoyo, posicional (hoyos 1..N). */
  scores: number[]
  total_gross: number
  holes_played: number
  import_confidence: number
  import_source: string
  par_per_hole?: Record<string, number> | null
  /** CR/slope que trae el archivo: sólo si la cancha no resuelve contra el catálogo. */
  course_rating?: number | null
  slope_rating?: number | null
  formato_juego?: string | null
  metadata: Record<string, unknown> & { tee_box?: string }
}

/**
 * Columnas a escribir en el UPDATE de la tarjeta Garmin ya importada. CR/slope:
 * los del catálogo (`course_tees`, con el género del usuario) y, si la cancha no
 * resuelve, los del archivo, como siempre. El tope usa esos MISMOS ratings.
 */
export async function actualizacionGarmin(
  supabase: SupabaseClient,
  t: TarjetaGarminReimportada,
  ctx: { genero: string | null; indice: number | null },
): Promise<Record<string, unknown>> {
  const tee = t.tee_color ?? t.metadata.tee_box ?? null
  const holes = t.holes_played || t.scores.length
  let ratings: RatingsResueltos | null = t.course_rating != null && t.slope_rating != null
    ? { cr: t.course_rating, slope: t.slope_rating, nineHoleRatings: null }
    : null
  if (t.course_id) {
    const resolved = await resolveTeeRatingsForCourse(supabase, t.course_id, tee, holes, ctx.genero)
    if (resolved) ratings = { cr: resolved.cr, slope: resolved.slope, nineHoleRatings: resolved.nineHoleRatings }
  }

  const ajuste = await grossAjustadoAlGuardar(supabase, {
    course_id: t.course_id ?? null,
    tee_color: tee,
    holes_played: holes,
    scores: t.scores,
    par_per_hole: t.par_per_hole ?? null,
    metadata: t.metadata,
    formato_juego: t.formato_juego ?? 'stroke_play',
    import_source: t.import_source,
  }, { indice: ctx.indice, ratings: ratings ?? undefined }, { context: 'import-garmin.tope-whs', meta: { courseId: t.course_id } })

  const diferencial = ratings
    ? diferencialDeTarjeta({
        grossAjustado: ajuste?.grossAjustado ?? t.total_gross,
        holesPlayed: holes,
        ratings: ratingsDelDiferencial(ratings),
        bolaCompartida: isSharedBallFormat(t.formato_juego),
      })
    : null

  return {
    course_name: t.course_name,
    played_at: t.played_at,
    scores: t.scores,
    total_gross: t.total_gross,
    holes_played: holes,
    import_confidence: t.import_confidence,
    import_source: t.import_source,
    metadata: metadataConAjusteWHS(t.metadata, ajuste),
    course_rating: ratings?.cr ?? null,
    slope_rating: ratings?.slope ?? null,
    diferencial,
    adjusted_gross: ajuste?.grossAjustado ?? null,
    par_per_hole: t.par_per_hole ?? null,
  }
}
