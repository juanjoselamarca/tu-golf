// ─── Capa de datos — re-importar una tarjeta Garmin que ya está en el historial ─
//
// Garmin trae un id estable por tarjeta (`garmin_scorecard_id`). Si el usuario
// vuelve a importar el mismo archivo, la fila existente se ACTUALIZA en vez de
// duplicarse. Antes el UPDATE re-escribía los golpes pero no el diferencial: una
// tarjeta corregida en Garmin dejaba en el índice el diferencial viejo (#545).
// Ahora diferencial, `adjusted_gross` y `metadata.ajuste_whs` salen de la MISMA
// fila que se escribe, con la función canónica del tope (WHS 3.1), y la tarjeta
// se resuelve IGUAL que en la primera importación (`resolverTarjetaImportada`):
// misma cancha, tee por defecto del usuario, CR/slope sólo del catálogo.

import type { SupabaseClient } from '@supabase/supabase-js'
import { metadataConAjusteWHS } from './ajuste-whs-fila'
import { resolverTarjetaImportada, type PerfilDelImport } from './import-tarjeta'

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
  formato_juego?: string | null
  metadata: Record<string, unknown> & { tee_box?: string; hoyos?: number[] }
}

/**
 * Columnas a escribir en el UPDATE de la tarjeta Garmin ya importada. Cancha, tee,
 * CR/slope, tope y diferencial salen de `resolverTarjetaImportada`, la misma
 * función de `importRound`: re-importar un archivo deja la fila como la dejó la
 * primera importación. Sin cancha o tee en el catálogo, CR/slope y diferencial
 * quedan null (los ratings del archivo NO se usan: no son los del tee real).
 */
export async function actualizacionGarmin(
  supabase: SupabaseClient,
  userId: string,
  t: TarjetaGarminReimportada,
  perfil: PerfilDelImport | null,
): Promise<Record<string, unknown>> {
  const holes = t.holes_played || t.scores.length
  const r = await resolverTarjetaImportada(supabase, {
    userId,
    courseName: t.course_name,
    courseId: t.course_id,
    teeColor: t.tee_color ?? t.metadata.tee_box ?? null,
    parPerHole: t.par_per_hole,
    scores: t.scores,
    totalGross: t.total_gross,
    holesPlayed: holes,
    metadata: t.metadata,
    formatoJuego: t.formato_juego ?? 'stroke_play',
    source: t.import_source,
  }, perfil)

  return {
    course_name: t.course_name,
    course_id: r.courseId,
    tee_color: r.tee,
    played_at: t.played_at,
    scores: t.scores,
    total_gross: t.total_gross,
    holes_played: holes,
    import_confidence: t.import_confidence,
    import_source: t.import_source,
    metadata: metadataConAjusteWHS(t.metadata, r.ajuste),
    course_rating: r.ratings?.cr ?? null,
    slope_rating: r.ratings?.slope ?? null,
    diferencial: r.diferencial,
    adjusted_gross: r.ajuste?.grossAjustado ?? null,
    par_per_hole: r.parPerHole,
  }
}
