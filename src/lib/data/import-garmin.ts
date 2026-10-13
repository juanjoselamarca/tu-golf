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
// La cancha y el tee de la FILA existente mandan sobre los del archivo: el usuario
// pudo corregir el tee o re-vincular la cancha en la app, y re-importar no debe
// deshacerlo (ni dejar null sobre un vínculo, ni crear una cancha nueva, ni
// volver al nombre de cancha del archivo).

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

/** Cancha y tee que la fila ya tiene en el historial (pueden venir corregidos en la app). */
export interface FilaGarminExistente {
  course_id: string | null
  tee_color: string | null
  /** `metadata.ajuste_whs` de la fila: el índice del DÍA de la ronda (WHS 3.1), no el de hoy. */
  ajuste_whs?: unknown
}

/**
 * Cancha, tee y ajuste WHS actuales de las tarjetas Garmin del usuario que se van a re-escribir,
 * por `garmin_scorecard_id`. Lanza si la lectura falla: sin saber qué tiene la fila,
 * el UPDATE podría pisar un tee o una cancha corregidos por el usuario.
 */
export async function fetchFilasGarminExistentes(
  supabase: SupabaseClient,
  userId: string,
  garminIds: string[],
): Promise<Map<string, FilaGarminExistente>> {
  const filas = new Map<string, FilaGarminExistente>()
  if (garminIds.length === 0) return filas
  const { data, error } = await supabase
    .from('historical_rounds')
    .select('garmin_scorecard_id, course_id, tee_color, metadata')
    .eq('user_id', userId)
    .in('garmin_scorecard_id', garminIds)
  if (error) throw new Error(`No se pudo leer las tarjetas Garmin existentes: ${error.message}`)
  type Leida = { garmin_scorecard_id: string | null; course_id: string | null; tee_color: string | null; metadata: Record<string, unknown> | null }
  for (const f of (data ?? []) as Leida[]) {
    if (!f.garmin_scorecard_id) continue
    const ajuste = f.metadata?.ajuste_whs
    filas.set(String(f.garmin_scorecard_id), { course_id: f.course_id, tee_color: f.tee_color, ...(ajuste != null ? { ajuste_whs: ajuste } : {}) })
  }
  return filas
}

/**
 * Columnas a escribir en el UPDATE de la tarjeta Garmin ya importada. Cancha, tee,
 * CR/slope, tope y diferencial salen de `resolverTarjetaImportada`, la misma
 * función de `importRound`. Prioridad de cancha y tee: la FILA existente → el
 * archivo → el tee por defecto del usuario. Con la cancha de la fila no se
 * resuelve por nombre (no se crean canchas), y `course_id`/`tee_color` se escriben
 * sólo si resolvieron: nunca null sobre un vínculo. Sin cancha o tee en el
 * catálogo, CR/slope y diferencial quedan null (los ratings del archivo NO se
 * usan: no son los del tee real).
 */
export async function actualizacionGarmin(
  supabase: SupabaseClient,
  userId: string,
  t: TarjetaGarminReimportada,
  perfil: PerfilDelImport | null,
  existente: FilaGarminExistente | null,
): Promise<Record<string, unknown>> {
  const holes = t.holes_played || t.scores.length
  // El índice del tope es el del día de la ronda: el `ajuste_whs` guardado en la FILA
  // (nunca el del archivo/cliente, que `metadataDelImport` ya descartó). Sin él, el perfil.
  const metadata = existente?.ajuste_whs != null ? { ...t.metadata, ajuste_whs: existente.ajuste_whs } : t.metadata
  const r = await resolverTarjetaImportada(supabase, {
    userId,
    courseName: t.course_name,
    courseId: existente?.course_id ?? t.course_id,
    teeColor: existente?.tee_color ?? t.tee_color ?? t.metadata.tee_box ?? null,
    parPerHole: t.par_per_hole,
    scores: t.scores,
    totalGross: t.total_gross,
    holesPlayed: holes,
    metadata,
    formatoJuego: t.formato_juego ?? 'stroke_play',
    source: t.import_source,
  }, perfil)

  return {
    // Con la cancha de la fila (re-vinculada en la app), su nombre se mantiene.
    ...(existente?.course_id ? {} : { course_name: t.course_name }),
    ...(r.courseId != null ? { course_id: r.courseId } : {}),
    ...(r.tee != null ? { tee_color: r.tee } : {}),
    played_at: t.played_at,
    scores: t.scores,
    total_gross: t.total_gross,
    holes_played: holes,
    import_confidence: t.import_confidence,
    import_source: t.import_source,
    metadata: metadataConAjusteWHS(metadata, r.ajuste),
    course_rating: r.ratings?.cr ?? null,
    slope_rating: r.ratings?.slope ?? null,
    diferencial: r.diferencial,
    adjusted_gross: r.ajuste?.grossAjustado ?? null,
    par_per_hole: r.parPerHole,
  }
}
