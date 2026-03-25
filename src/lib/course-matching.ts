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

// Words that don't help distinguish between courses
const COMMON_WORDS = new Set([
  'club', 'de', 'golf', 'las', 'los', 'la', 'el', 'del', 'y',
  'country', 'campo', 'and', 'the', 'links', 'course',
  '18', '9', 'hole', 'holes', 'hoyos',
])

/**
 * Normalize a course name for matching:
 * - Lowercase
 * - Remove accents
 * - Remove ~ and everything after (Garmin combo names)
 * - Split into words
 * - Remove common/stop words
 */
function getSignificantWords(name: string): string[] {
  const clean = name
    .split('~')[0] // Remove Garmin combo suffix
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, ' ') // Remove special chars
    .trim()

  return clean
    .split(/\s+/)
    .filter(w => w.length > 1 && !COMMON_WORDS.has(w))
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

  // Bonus for normalized substring match
  const extClean = externalName.split('~')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const dbClean = dbName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (extClean.includes(dbClean) || dbClean.includes(extClean)) {
    score += 5
  }

  return score
}

export interface CourseMatch {
  id: string
  nombre: string
  score: number
}

/**
 * Find the best matching course in a list of candidates.
 * Returns the candidate with the highest score, or null if no match (score 0).
 *
 * @param externalName - Name from Garmin, photo, CSV, etc.
 * @param candidates - Array of {id, nombre} from our DB
 * @param minScore - Minimum score to consider a match (default 2 = at least 1 significant word)
 */
export function findBestCourseMatch(
  externalName: string,
  candidates: Array<{ id: string; nombre: string }>,
  minScore = 2,
): CourseMatch | null {
  if (!externalName || candidates.length === 0) return null

  let bestMatch: CourseMatch | null = null

  for (const c of candidates) {
    const score = matchScore(externalName, c.nombre)
    if (score >= minScore && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: c.id, nombre: c.nombre, score }
    }
  }

  return bestMatch
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
    .select('id, nombre')
    .ilike('nombre', `%${searchWord}%`)

  if (!candidates || candidates.length === 0) {
    // Fallback: try second word
    if (words.length > 1) {
      const { data: fallback } = await (supabase as ReturnType<typeof import('@supabase/supabase-js').createClient>)
        .from('courses')
        .select('id, nombre')
        .ilike('nombre', `%${words[1]}%`)

      if (fallback && fallback.length > 0) {
        return findBestCourseMatch(externalName, fallback)
      }
    }
    return null
  }

  return findBestCourseMatch(externalName, candidates)
}
