// ============================================================
// COURSE MATCHING — Algoritmo de matching por puntaje
// ============================================================
// Busca la mejor coincidencia entre un nombre de cancha externo
// (Garmin, foto, CSV) y nuestra BD. Usa puntaje por palabras
// significativas en comun. Resuelve ambiguedades cuando hay
// multiples canchas con nombres similares (ej: Rocas de Santo
// Domingo vs Brisas de Santo Domingo, o dos clubes en la misma ciudad).
//
// REGLA: la cancha con MAS palabras significativas en comun gana.
// ============================================================

import { significantTokens, normalizeCourseName, canonicalOrdered } from './course-name'

// Tokens significativos de un nombre de cancha. Delega en la fuente \u00fanica
// `course-name.ts` (misma normalizaci\u00f3n que espeja el RPC). Antes cortaba
// en `~`, tirando el loop (Norte-Este) \u2192 colapsaba variantes distintas.
function getSignificantWords(name: string): string[] {
  return significantTokens(name)
}

/**
 * Calculate match score between an external name and a DB course name.
 * Higher = better match.
 *
 * Scoring:
 * - Each significant word that appears in BOTH names: +2 points
 * - Exact substring match (full DB name in external name or vice versa): +5 bonus
 * - Partial word match (e.g., "brisas" matches "brisa"): +1 point
 */
function matchScore(externalName: string, dbName: string): number {
  const extWords = getSignificantWords(externalName)
  const dbWords = getSignificantWords(dbName)

  if (extWords.length === 0 || dbWords.length === 0) return 0

  let score = 0

  // Exact word matches
  for (const ew of extWords) {
    for (const dw of dbWords) {
      if (ew === dw) {
        score += 2
      } else if (ew.length > 3 && dw.length > 3 && (ew.includes(dw) || dw.includes(ew))) {
        // Partial match: "cachagua" contains "cachagu" etc.
        score += 1
      }
    }
  }

  // Bonus si las formas can\u00f3nicas (tokens significativos ordenados) coinciden
  // o una contiene a la otra.
  const extClean = normalizeCourseName(externalName)
  const dbClean = normalizeCourseName(dbName)
  if (extClean.length > 0 && (extClean.includes(dbClean) || dbClean.includes(extClean))) {
    score += 5
  }

  return score
}

/** Levenshtein (distancia de edición) iterativa. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }
  return prev[b.length]
}

/**
 * Similitud token-set (0..1): Levenshtein normalizado sobre las palabras
 * significativas ordenadas. Tolera typos y orden distinto ("Marbela" ~ "Marbella").
 */
function tokenSetRatio(a: string, b: string): number {
  const ta = getSignificantWords(a).sort().join(' ')
  const tb = getSignificantWords(b).sort().join(' ')
  if (!ta || !tb) return 0
  const dist = levenshtein(ta, tb)
  return 1 - dist / Math.max(ta.length, tb.length)
}

export interface CourseMatch {
  id: string
  nombre: string
  score: number
}

/** Candidato de cancha. `fuente`/`canonical_course_id`/`activa` son opcionales:
 *  si la query no los trae (columnas aún no migradas), el matcher degrada limpio. */
export interface CourseCandidate {
  id: string
  nombre: string
  fuente?: string | null
  canonical_course_id?: string | null
  activa?: boolean | null
}

/** Umbral de similitud fuzzy para aceptar un match que el overlap de palabras no agarró. */
const FUZZY_FALLBACK_RATIO = 0.85
/** Sensibilidad por defecto: al menos 1 palabra significativa en común. */
const DEFAULT_MIN_SCORE = 2

/**
 * Find the best matching course in a list of candidates.
 *
 * Estrategia (conservadora, no recalibra el score por palabras existente):
 * 1. Score primario = `matchScore` (overlap de palabras significativas).
 * 2. Empates: gana `fuente='fedegolf'` (catálogo canónico); luego mayor token-set ratio.
 * 3. Si nada llega a `minScore` por palabras → fallback fuzzy (ratio ≥ 0.85).
 * 4. Si la fila ganadora tiene `canonical_course_id` apuntando a otro candidato,
 *    se devuelve la canónica (nunca una ficha duplicada/desactivada).
 *
 * @param externalName - Name from Garmin, photo, CSV, etc.
 * @param candidates - Array de {id, nombre, fuente?, canonical_course_id?, activa?}
 * @param minScore - Minimum score to consider a match (default 2 = al menos 1 palabra)
 */
export function findBestCourseMatch(
  externalName: string,
  candidates: CourseCandidate[],
  minScore = 2,
): CourseMatch | null {
  if (!externalName || candidates.length === 0) return null

  const isFede = (c: CourseCandidate) => (c.fuente ?? '').toLowerCase() === 'fedegolf'
  // Forma canónica ordenada del nombre externo: un candidato cuya forma ordenada
  // coincide EXACTO es el match más fuerte (respeta el orden del loop: Norte-Este
  // ≠ Este-Norte, cuyos pares hoyo-a-hoyo difieren).
  const extOrd = canonicalOrdered(externalName)

  let best: { c: CourseCandidate; score: number; ratio: number; ord: boolean } | null = null

  for (const c of candidates) {
    const score = matchScore(externalName, c.nombre)
    if (score < minScore) continue
    const ratio = tokenSetRatio(externalName, c.nombre)
    const ord = extOrd !== '' && canonicalOrdered(c.nombre) === extOrd
    const cand = { c, score, ratio, ord }
    if (!best) { best = cand; continue }
    if (score > best.score) { best = cand; continue }
    if (score === best.score) {
      // Desempate por prioridad: match ordenado exacto → fedegolf → mayor ratio.
      const bk = (best.ord ? 4 : 0) + (isFede(best.c) ? 2 : 0)
      const ck = (ord ? 4 : 0) + (isFede(c) ? 2 : 0)
      if (ck > bk || (ck === bk && ratio > best.ratio)) best = cand
    }
  }

  // Fallback fuzzy: nada matcheó por palabras pero hay un nombre casi idéntico.
  // Solo a sensibilidad por defecto — si el caller subió minScore, quiere
  // estrictez y no se debe recuperar por fuzzy.
  if (!best && minScore <= DEFAULT_MIN_SCORE) {
    for (const c of candidates) {
      const ratio = tokenSetRatio(externalName, c.nombre)
      if (ratio >= FUZZY_FALLBACK_RATIO && (!best || ratio > best.ratio)) {
        best = { c, score: minScore, ratio, ord: extOrd !== '' && canonicalOrdered(c.nombre) === extOrd }
      }
    }
  }

  if (!best) return null

  // Resolver identidad canónica: si la ganadora es alias de otra ficha, devolver la canónica.
  const canonicalId = best.c.canonical_course_id
  if (canonicalId) {
    const canon = candidates.find(x => x.id === canonicalId)
    if (canon) return { id: canon.id, nombre: canon.nombre, score: best.score }
    // C3: la canónica no quedó en el candidate-set (el `ilike` por palabra no la
    // trajo, p.ej. la fedegolf matchea pero la manual canónica no). Conocemos su
    // id por `canonical_course_id` → devolverla igual, nunca la ficha duplicada.
    return { id: canonicalId, nombre: best.c.nombre, score: best.score }
  }

  return { id: best.c.id, nombre: best.c.nombre, score: best.score }
}

/**
 * Convenience: search for a course by external name.
 * Fetches candidates from Supabase and returns the best match.
 *
 * @param externalName - Name from Garmin, photo, CSV, etc.
 * @param supabase - Supabase client (anon or admin)
 */
export async function matchCourseInDB(
  externalName: string,
  supabase: { from: (table: string) => unknown },
): Promise<CourseMatch | null> {
  // Get significant words for the search
  const words = getSignificantWords(externalName)
  if (words.length === 0) return null

  // Search with the most distinctive word (longest, least common)
  const searchWord = words.sort((a, b) => b.length - a.length)[0]

  // Fetch candidates that contain at least one significant word
  const { data: candidates } = await (supabase as ReturnType<typeof import('@supabase/supabase-js').createClient>)
    .from('courses')
    .select('id, nombre, fuente, canonical_course_id')
    .ilike('nombre', `%${searchWord}%`)

  if (!candidates || candidates.length === 0) {
    // Fallback: try second word
    if (words.length > 1) {
      const { data: fallback } = await (supabase as ReturnType<typeof import('@supabase/supabase-js').createClient>)
        .from('courses')
        .select('id, nombre, fuente, canonical_course_id')
        .ilike('nombre', `%${words[1]}%`)

      if (fallback && fallback.length > 0) {
        return findBestCourseMatch(externalName, fallback)
      }
    }
    return null
  }

  return findBestCourseMatch(externalName, candidates)
}
