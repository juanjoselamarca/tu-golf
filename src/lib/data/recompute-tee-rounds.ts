/**
 * Aplica el color de tee por defecto del usuario a sus rondas SIN tee y recomputa
 * CR/slope/diferencial desde el catálogo. Para el Punto 3: cuando el usuario fija
 * su tee habitual, sus tarjetas viejas sin tee (que entraron sin diferencial)
 * recuperan su rating y vuelven a alimentar el índice.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTeesForCourse } from './course-tees'
import { resolveRatings, type TeeRow } from '@/golf/courses/tee-resolver'
import { calcularDiferencial } from '@/lib/indice-golfers'

/**
 * Recomputa las rondas del usuario que NO tienen tee_color pero SÍ tienen
 * course_id, usando `color` como tee. Resuelve CR/slope del catálogo y recalcula
 * el diferencial canónico. NO toca rondas que ya tienen un tee explícito.
 * Devuelve cuántas rondas se actualizaron.
 */
export async function applyDefaultTeeToRounds(
  supabase: SupabaseClient,
  userId: string,
  color: string,
  genero?: string | null,
): Promise<number> {
  const { data: rounds } = await supabase
    .from('historical_rounds')
    .select('id, course_id, total_gross, holes_played')
    .eq('user_id', userId)
    .is('tee_color', null)
    .not('course_id', 'is', null)
  if (!rounds || rounds.length === 0) return 0

  // Cache de tees por cancha: muchas rondas comparten course_id → 1 query por
  // cancha, no por ronda (escala para usuarios con cientos de tarjetas).
  const teeCache = new Map<string, TeeRow[]>()
  async function teesFor(courseId: string): Promise<TeeRow[]> {
    if (!teeCache.has(courseId)) teeCache.set(courseId, await getTeesForCourse(supabase, courseId))
    return teeCache.get(courseId)!
  }

  let updated = 0
  for (const r of rounds) {
    const tees = await teesFor(r.course_id)
    const resolved = resolveRatings(tees, color, r.holes_played, genero ?? null)
    if (!resolved) continue
    const diferencial =
      r.total_gross != null
        ? calcularDiferencial(r.total_gross, resolved.cr, resolved.slope, r.holes_played, resolved.nineHoleRatings)
        : null
    const { error } = await supabase
      .from('historical_rounds')
      .update({
        tee_color: color,
        course_rating: resolved.cr,
        slope_rating: resolved.slope,
        diferencial,
      })
      .eq('id', r.id)
    if (!error) updated++
  }
  return updated
}

/** Una ronda evaluada por `recomputeRoundsFromCatalog`: su estado antes y después. */
export interface RecomputedRound {
  id: string
  course_id: string
  tee_color: string
  holes_played: number | null
  total_gross: number | null
  before: { course_rating: number | null; slope_rating: number | null; diferencial: number | null }
  after: { course_rating: number; slope_rating: number; diferencial: number | null }
  /** true si algún campo persistido (CR, slope o diferencial) cambia. */
  changed: boolean
}

export interface RecomputeFromCatalogResult {
  /** Rondas con tee_color + course_id consideradas. */
  scanned: number
  /** Rondas para las que el catálogo resolvió un rating confiable. */
  resolved: number
  /** Rondas con tee pero sin match confiable en el catálogo (no se tocan). */
  unresolved: { id: string; tee_color: string }[]
  /**
   * Rondas con score físicamente imposible para sus hoyos (< 3 golpes/hoyo →
   * 54 en 18h sería 18 bajo par). Data corrupta: NO se recomputan (un diferencial
   * negativo absurdo hundiría el índice al ser "el mejor"). Se reportan para
   * que un humano corrija/excluya la ronda.
   */
  implausible: { id: string; tee_color: string; total_gross: number | null; holes_played: number | null }[]
  /** Detalle antes/después de las rondas resueltas. */
  rounds: RecomputedRound[]
  /** Cuántas rondas resueltas cambian al menos un campo. */
  changedCount: number
  /**
   * Rondas implausibles que se EXCLUYERON del handicap en este apply (0 en
   * dryRun). Su diferencial congelado no se puede recomputar y, de seguir activo,
   * el RPC lo tomaría como "el mejor" y hundiría el índice: excluirlas es la única
   * forma de sanear el índice. El recompute por sí solo no las toca.
   */
  excludedImplausible: number
  /** Updates a la BD que fallaron (diferencial o exclusión). Debería ser 0. */
  failedUpdates: number
  /** false en dryRun (no se escribió nada). */
  applied: boolean
}

function toNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Re-deriva CR/slope/diferencial de las rondas que YA tienen tee_color, tomando
 * el rating del catálogo oficial (`course_tees`) en vez del valor congelado al
 * importar. Esta es la respuesta arquitectónica al "diferencial congelado": es
 * **re-ejecutable** — correrla de nuevo recalcula contra el catálogo actual.
 *
 * Complementa a `applyDefaultTeeToRounds`, que cubre las rondas SIN tee.
 *
 * En `dryRun` (default true salvo que se pida lo contrario) NO escribe: devuelve
 * el antes/después para que un humano apruebe antes de aplicar.
 */
export async function recomputeRoundsFromCatalog(
  supabase: SupabaseClient,
  userId: string,
  opts?: { dryRun?: boolean; genero?: string | null },
): Promise<RecomputeFromCatalogResult> {
  const dryRun = opts?.dryRun ?? true
  const genero = opts?.genero ?? null

  const { data: rounds } = await supabase
    .from('historical_rounds')
    .select('id, course_id, tee_color, holes_played, total_gross, course_rating, slope_rating, diferencial')
    .eq('user_id', userId)
    .not('tee_color', 'is', null)
    .not('course_id', 'is', null)
    // No tocar rondas ya excluidas a mano (scramble, equipos, etc.): su
    // exclusión es una decisión deliberada, no un dato a recomputar.
    .eq('excluded_from_handicap', false)

  const result: RecomputeFromCatalogResult = {
    scanned: rounds?.length ?? 0,
    resolved: 0,
    unresolved: [],
    implausible: [],
    rounds: [],
    changedCount: 0,
    excludedImplausible: 0,
    failedUpdates: 0,
    applied: !dryRun,
  }
  if (!rounds || rounds.length === 0) return result

  const teeCache = new Map<string, TeeRow[]>()
  async function teesFor(courseId: string): Promise<TeeRow[]> {
    if (!teeCache.has(courseId)) teeCache.set(courseId, await getTeesForCourse(supabase, courseId))
    return teeCache.get(courseId)!
  }

  for (const r of rounds) {
    // Guard de plausibilidad: un score por debajo de 3 golpes/hoyo es
    // físicamente imposible (data corrupta). No se recomputa para no inyectar
    // un diferencial absurdo (típicamente negativo) que hundiría el índice.
    if (r.total_gross != null && r.holes_played != null && r.total_gross < 3 * r.holes_played) {
      result.implausible.push({
        id: r.id,
        tee_color: r.tee_color,
        total_gross: r.total_gross,
        holes_played: r.holes_played,
      })
      continue
    }

    const tees = await teesFor(r.course_id)
    const resolved = resolveRatings(tees, r.tee_color, r.holes_played, genero)
    if (!resolved) {
      result.unresolved.push({ id: r.id, tee_color: r.tee_color })
      continue
    }
    result.resolved++

    const diferencial =
      r.total_gross != null
        ? calcularDiferencial(r.total_gross, resolved.cr, resolved.slope, r.holes_played, resolved.nineHoleRatings)
        : null

    const before = {
      course_rating: toNum(r.course_rating),
      slope_rating: toNum(r.slope_rating),
      diferencial: toNum(r.diferencial),
    }
    const after = { course_rating: resolved.cr, slope_rating: resolved.slope, diferencial }
    const changed =
      before.course_rating !== after.course_rating ||
      before.slope_rating !== after.slope_rating ||
      before.diferencial !== after.diferencial

    result.rounds.push({
      id: r.id,
      course_id: r.course_id,
      tee_color: r.tee_color,
      holes_played: r.holes_played,
      total_gross: r.total_gross,
      before,
      after,
      changed,
    })
    if (changed) result.changedCount++

    if (!dryRun && changed) {
      const { error } = await supabase
        .from('historical_rounds')
        .update({ course_rating: after.course_rating, slope_rating: after.slope_rating, diferencial })
        .eq('id', r.id)
      if (error) result.failedUpdates++
    }
  }

  // En apply, las rondas con score físicamente imposible se excluyen del
  // handicap. El recompute NO las toca (su diferencial congelado es absurdo y no
  // re-derivable), así que la ÚNICA forma de que el índice quede sano es sacarlas
  // del cómputo antes de correr el RPC. Mismo paso que hacía el script one-shot;
  // ahora vive en el motor para que el endpoint repare el índice por sí solo.
  if (!dryRun) {
    for (const im of result.implausible) {
      const { error } = await supabase
        .from('historical_rounds')
        .update({ excluded_from_handicap: true })
        .eq('id', im.id)
      if (error) result.failedUpdates++
      else result.excludedImplausible++
    }
  }

  return result
}
