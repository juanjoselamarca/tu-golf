/**
 * SYNC UNIFICADO DE CANCHAS — FedeGolf (prioridad) + golfcourseapi.com (fallback)
 *
 * Regla de merge (no negociable):
 *   - FedeGolf es fuente primaria. Si un campo YA tiene valor, NO se toca.
 *   - API golfcourseapi.com solo rellena campos NULL.
 *   - Nunca sobrescribir datos existentes de FedeGolf.
 *
 * Uso:
 *   npx tsx src/scripts/sync-courses-unified.ts              # dry-run por default
 *   npx tsx src/scripts/sync-courses-unified.ts --execute    # aplica cambios
 *   npx tsx src/scripts/sync-courses-unified.ts --limit 5    # prueba con 5 canchas
 *   npx tsx src/scripts/sync-courses-unified.ts --course "Prince of Wales"  # una cancha
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const DRY_RUN = !process.argv.includes('--execute')
const LIMIT_IDX = process.argv.indexOf('--limit')
const LIMIT = LIMIT_IDX > -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : Infinity
const COURSE_IDX = process.argv.indexOf('--course')
const COURSE_FILTER = COURSE_IDX > -1 ? process.argv[COURSE_IDX + 1] : null

const API_KEY = process.env.GOLF_COURSE_API_KEY!
const API_BASE = 'https://api.golfcourseapi.com/v1'

if (!API_KEY) { console.error('ERROR: GOLF_COURSE_API_KEY falta'); process.exit(1) }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

// ─── Types de la API ────────────────────────────────────────────────────
interface ApiHole { par: number; yardage: number }
interface ApiTee {
  tee_name: string
  course_rating: number
  slope_rating: number
  bogey_rating: number
  total_yards: number
  total_meters: number
  number_of_holes: number
  par_total: number
  front_course_rating: number
  front_slope_rating: number
  front_bogey_rating: number
  back_course_rating: number
  back_slope_rating: number
  back_bogey_rating: number
  holes: ApiHole[]
}
interface ApiCourse {
  id: number
  club_name: string
  course_name: string
  tees: { female: ApiTee[]; male: ApiTee[] }
}

// ─── Normalize nombres para matching ────────────────────────────────────
// Remover tildes/acentos para matching (usar rango unicode explícito)
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalize(name: string): string {
  const cleaned = stripAccents(name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // remove (VARONES), (DAMAS), etc
    .replace(/[^a-z ]/g, ' ')
    .replace(/\b(c\s*g|c\s*c|s\s*c|s\s*a|cc|cg|club de golf|club de|golf club|country club|club|golf|c\s*g\s*p|damas|varones|caballeros|masculino|femenino|de|la|el|los|las|y|cancha|antigua|nueva|oficial|verde)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = cleaned.split(' ').filter(t => t.length > 0)
  return Array.from(new Set(tokens)).join(' ')
}

/**
 * Extrae el "nombre del club" — la parte principal antes de cualquier guión
 * o paréntesis. Ej: "C.G. Cachagua - Cachagua (VARONES)" → "Cachagua"
 */
function extractClubName(name: string): string {
  // Separar por " - " y tomar primera parte significativa
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim()
  const parts = withoutParens.split(/\s*-\s*/)
  // Primera parte significativa (no solo "C.G." o "Club de Golf")
  for (const p of parts) {
    const norm = normalize(p)
    if (norm.length > 2) return p.trim()
  }
  return parts[0] || name
}

/**
 * Genera queries alternativas en cascada para una cancha.
 * De más específico a más genérico.
 */
function generateQueries(courseName: string): string[] {
  const queries = new Set<string>()

  // Strategy 1: nombre normalizado completo
  const full = normalize(courseName)
  if (full) queries.add(full)

  // Strategy 2: primeras 3 palabras
  const words = full.split(' ').filter(Boolean)
  if (words.length > 3) queries.add(words.slice(0, 3).join(' '))
  if (words.length > 2) queries.add(words.slice(0, 2).join(' '))

  // Strategy 3: solo nombre de club (antes de "-")
  const clubName = normalize(extractClubName(courseName))
  if (clubName && clubName !== full) queries.add(clubName)

  // Strategy 4: primera palabra (nombre distintivo)
  if (words.length > 0 && words[0].length >= 4) queries.add(words[0])

  // Strategy 5: segunda palabra si la primera es genérica
  const genericFirst = ['hacienda', 'marina', 'country', 'nuevo', 'nueva']
  if (words.length > 1 && genericFirst.includes(words[0])) {
    queries.add(words.slice(0, 2).join(' '))
    queries.add(words[1])
  }

  return Array.from(queries).filter(q => q.length >= 3)
}

// ─── Similarity score simple (Jaccard sobre tokens) ─────────────────────
function similarity(a: string, b: string): number {
  const tokA = new Set(normalize(a).split(' ').filter(t => t.length > 2))
  const tokB = new Set(normalize(b).split(' ').filter(t => t.length > 2))
  if (tokA.size === 0 || tokB.size === 0) return 0
  let inter = 0
  tokA.forEach(t => { if (tokB.has(t)) inter++ })
  return inter / Math.max(tokA.size, tokB.size)
}

// ─── Tee name mapping: API → BD column ──────────────────────────────────
// La BD solo tiene: yardaje_negras, yardaje_azul, yardaje_blanco, yardaje_rojo
function mapTeeToBdColumn(apiTeeName: string): 'yardaje_negras' | 'yardaje_azul' | 'yardaje_blanco' | 'yardaje_rojo' | null {
  const n = apiTeeName.toLowerCase()
  if (n.includes('champ') || n.includes('tiger') || n.includes('black') || n.includes('negr') || n.includes('campe')) return 'yardaje_negras'
  if (n.includes('blue') || n.includes('azul')) return 'yardaje_azul'
  if (n.includes('white') || n.includes('blanco') || n.includes('yellow') || n.includes('amarillo') || n.includes('gold') || n.includes('dorado')) return 'yardaje_blanco'
  if (n.includes('red') || n.includes('rojo') || n.includes('ladies')) return 'yardaje_rojo'
  return null
}

// ─── Match tee BD by nombre against API tee_name ────────────────────────
function normTeeName(s: string): string {
  return s.toLowerCase().trim().replace(/s$/, '') // singular
}
function matchTees(bdTees: { id: string; nombre: string }[], apiTee: ApiTee): string | null {
  const apiN = normTeeName(apiTee.tee_name)
  for (const bt of bdTees) {
    const bdN = normTeeName(bt.nombre)
    if (apiN === bdN || apiN.includes(bdN) || bdN.includes(apiN)) return bt.id
  }
  // Fallback: color match
  const apiColor = mapTeeToBdColumn(apiTee.tee_name)
  for (const bt of bdTees) {
    if (apiColor === mapTeeToBdColumn(bt.nombre)) return bt.id
  }
  return null
}

// ─── API calls ─────────────────────────────────────────────────────────
let rateLimitedUntil = 0

async function apiSearch(query: string): Promise<{ id: number; name: string }[]> {
  // Respeto de rate limit
  if (Date.now() < rateLimitedUntil) {
    const wait = rateLimitedUntil - Date.now()
    console.log(`  ⏳ rate limit activo, esperando ${Math.round(wait/1000)}s...`)
    await new Promise(r => setTimeout(r, wait))
  }

  const res = await fetch(`${API_BASE}/search?search_query=${encodeURIComponent(query)}`, {
    headers: { 'Authorization': `Key ${API_KEY}` },
  })

  const text = await res.text()
  if (text.includes('rate limit')) {
    // Backoff: esperar 60s y reintentar
    rateLimitedUntil = Date.now() + 60000
    console.log(`  ⚠ rate limit detectado, backoff 60s`)
    await new Promise(r => setTimeout(r, 60000))
    return apiSearch(query) // retry
  }

  if (!res.ok) return []
  try {
    const data = JSON.parse(text)
    return (data.courses || []).map((c: { id: number; club_name?: string; course_name?: string }) => ({
      id: c.id,
      name: c.course_name || c.club_name || '',
    }))
  } catch { return [] }
}

async function apiFetchCourse(id: number): Promise<ApiCourse | null> {
  const res = await fetch(`${API_BASE}/courses/${id}`, {
    headers: { 'Authorization': `Key ${API_KEY}` },
  })
  if (!res.ok) return null
  const data = await res.json() as { course?: ApiCourse } | ApiCourse
  // La API envuelve en { course: {...} } para detail
  if ('course' in data && data.course) return data.course
  return data as ApiCourse
}

// ─── Stats globales ────────────────────────────────────────────────────
const stats = {
  total: 0,
  skip100: 0,
  noMatch: 0,
  matchLow: 0,
  matchOk: 0,
  errors: 0,
  fieldsUpdated: {
    course_rating: 0, slope_rating: 0, par_total_course: 0,
    tee_rating: 0, tee_slope: 0, tee_yardaje_total: 0, tee_par_total: 0, tee_genero: 0, tee_bogey: 0,
    hole_par: 0, hole_si: 0, hole_yardaje: 0, holes_inserted: 0,
  },
}

// ─── Merge helper: solo actualiza campos NULL ──────────────────────────
function mergeNullOnly<T extends Record<string, unknown>>(existing: T, incoming: Partial<T>): { patch: Partial<T>; changed: string[] } {
  const patch: Partial<T> = {}
  const changed: string[] = []
  for (const key of Object.keys(incoming) as (keyof T)[]) {
    const incVal = incoming[key]
    if (incVal == null) continue
    if (existing[key] == null) {
      patch[key] = incVal
      changed.push(String(key))
    }
  }
  return { patch, changed }
}

// ─── Procesar una cancha ────────────────────────────────────────────────
interface BdCourse {
  id: string; nombre: string; course_rating: number | null; slope_rating: number | null;
  par_total: number | null; pais: string | null; fuente: string | null;
  fedegolf_club_id: number | null; parent_id: string | null;
}

async function processCourse(bd: BdCourse): Promise<'skipped' | 'no-match' | 'low-match' | 'ok' | 'error'> {
  stats.total++

  // Obtener tees y holes actuales
  const [{ data: bdTees }, { data: bdHoles }] = await Promise.all([
    supabase.from('course_tees').select('id, nombre, rating, slope, yardaje_total, par_total, genero, bogey_rating, front_course_rating, front_slope_rating, front_bogey_rating, back_course_rating, back_slope_rating, back_bogey_rating, total_yards, total_meters').eq('course_id', bd.id),
    supabase.from('course_holes').select('id, numero, par, stroke_index, yardaje_negras, yardaje_azul, yardaje_blanco, yardaje_rojo').eq('course_id', bd.id).order('numero'),
  ])

  // ¿Ya está 100% completa? skip
  const tees = bdTees || []
  const holes = bdHoles || []
  const teesComplete = tees.length > 0 && tees.every(t => t.rating != null && t.slope != null && t.yardaje_total != null)
  const holesComplete = holes.length === 18 && holes.every(h =>
    h.par != null && h.stroke_index != null &&
    (h.yardaje_negras != null || h.yardaje_azul != null || h.yardaje_blanco != null || h.yardaje_rojo != null)
  )
  const courseComplete = bd.course_rating != null && bd.slope_rating != null && bd.par_total != null
  if (teesComplete && holesComplete && courseComplete) {
    stats.skip100++
    return 'skipped'
  }

  // Buscar en API con estrategia cascada: probar múltiples queries hasta encontrar match
  const queries = generateQueries(bd.nombre)
  let best: { id: number; name: string } | null = null
  let bestScore = 0
  let usedQuery = ''

  // Máximo 2 queries por cancha para no agotar rate limit
  for (const q of queries.slice(0, 2)) {
    const results = await apiSearch(q)
    if (results.length === 0) continue
    for (const r of results) {
      const s = similarity(bd.nombre, r.name)
      if (s > bestScore) { best = r; bestScore = s; usedQuery = q }
    }
    if (bestScore >= 0.6) break
    await new Promise(r => setTimeout(r, 800)) // throttle entre queries
  }

  if (!best) { stats.noMatch++; console.log(`  ✗ sin match tras ${queries.length} queries: ${bd.nombre}`); return 'no-match' }
  if (bestScore < 0.35) { stats.matchLow++; console.log(`  ~ match bajo (${bestScore.toFixed(2)}): "${bd.nombre}" vs API "${best.name}" (query="${usedQuery}")`); return 'low-match' }
  stats.matchOk++

  // Fetch full course
  const api = await apiFetchCourse(best.id)
  if (!api) { stats.errors++; return 'error' }

  // Elegir tees: prefer male (más completo), fallback female
  const apiTees = (api.tees.male && api.tees.male.length > 0) ? api.tees.male : (api.tees.female || [])
  if (apiTees.length === 0) { stats.errors++; return 'error' }

  // ─── MERGE COURSES (nivel cancha) ────────────────────────────────────
  // API no da un course_rating/slope global único — usar el tee más exigente (mayor slope)
  const hardestTee = apiTees.reduce((p, c) => c.slope_rating > p.slope_rating ? c : p, apiTees[0])
  const coursePatch = mergeNullOnly(bd as unknown as Record<string, unknown>, {
    course_rating: hardestTee.course_rating,
    slope_rating: hardestTee.slope_rating,
    par_total: hardestTee.par_total,
  })
  if (coursePatch.changed.length > 0 && !DRY_RUN) {
    await supabase.from('courses').update(coursePatch.patch).eq('id', bd.id)
  }
  for (const f of coursePatch.changed) {
    const fk = f as 'course_rating' | 'slope_rating' | 'par_total'
    if (fk === 'course_rating') stats.fieldsUpdated.course_rating++
    if (fk === 'slope_rating') stats.fieldsUpdated.slope_rating++
    if (fk === 'par_total') stats.fieldsUpdated.par_total_course++
  }

  if (coursePatch.changed.length > 0) {
    console.log(`  ${bd.nombre}:`)
    console.log(`    courses: completa ${coursePatch.changed.join(', ')}`)
  }

  // ─── MERGE TEES ──────────────────────────────────────────────────────
  const usedTeeIds = new Set<string>()
  for (const apiTee of apiTees) {
    const matchedTeeId = matchTees(tees, apiTee)
    if (!matchedTeeId || usedTeeIds.has(matchedTeeId)) continue
    usedTeeIds.add(matchedTeeId)
    const existing = tees.find(t => t.id === matchedTeeId)!
    const incoming = {
      rating: apiTee.course_rating,
      slope: apiTee.slope_rating,
      yardaje_total: apiTee.total_yards,
      par_total: apiTee.par_total,
      bogey_rating: apiTee.bogey_rating,
      front_course_rating: apiTee.front_course_rating,
      front_slope_rating: apiTee.front_slope_rating,
      front_bogey_rating: apiTee.front_bogey_rating,
      back_course_rating: apiTee.back_course_rating,
      back_slope_rating: apiTee.back_slope_rating,
      back_bogey_rating: apiTee.back_bogey_rating,
      total_yards: apiTee.total_yards,
      total_meters: apiTee.total_meters,
    }
    const patch = mergeNullOnly(existing as Record<string, unknown>, incoming)
    if (patch.changed.length > 0) {
      if (!DRY_RUN) await supabase.from('course_tees').update(patch.patch).eq('id', matchedTeeId)
      console.log(`    tee "${existing.nombre}": ${patch.changed.join(', ')}`)
      for (const f of patch.changed) {
        if (f === 'rating') stats.fieldsUpdated.tee_rating++
        if (f === 'slope') stats.fieldsUpdated.tee_slope++
        if (f === 'yardaje_total') stats.fieldsUpdated.tee_yardaje_total++
        if (f === 'par_total') stats.fieldsUpdated.tee_par_total++
        if (f === 'bogey_rating') stats.fieldsUpdated.tee_bogey++
      }
    }
  }

  // ─── MERGE HOLES ─────────────────────────────────────────────────────
  // Usar el primer tee con 18 hoyos como referencia para par
  const referenceTee = apiTees.find(t => t.holes && t.holes.length >= 9) || apiTees[0]
  if (referenceTee && referenceTee.holes) {
    for (let i = 0; i < referenceTee.holes.length; i++) {
      const holeNum = i + 1
      const apiHole = referenceTee.holes[i]
      const existing = holes.find(h => h.numero === holeNum)

      // Construir yardajes por tee para este hoyo
      const yardajes: Record<string, number> = {}
      for (const tee of apiTees) {
        const col = mapTeeToBdColumn(tee.tee_name)
        if (col && tee.holes && tee.holes[i]) {
          yardajes[col] = tee.holes[i].yardage
        }
      }

      if (!existing) {
        // INSERT nuevo hoyo
        if (!DRY_RUN) {
          await supabase.from('course_holes').insert({
            course_id: bd.id,
            numero: holeNum,
            par: apiHole.par,
            stroke_index: null, // SI se estima después o queda null
            ...yardajes,
          })
        }
        stats.fieldsUpdated.holes_inserted++
        console.log(`    hoyo ${holeNum}: INSERT (par+yardajes)`)
      } else {
        // UPDATE solo null
        const incoming: Record<string, unknown> = {
          par: apiHole.par,
          ...yardajes,
        }
        const patch = mergeNullOnly(existing as Record<string, unknown>, incoming)
        if (patch.changed.length > 0) {
          if (!DRY_RUN) await supabase.from('course_holes').update(patch.patch).eq('id', existing.id)
          for (const f of patch.changed) {
            if (f === 'par') stats.fieldsUpdated.hole_par++
            if (f.startsWith('yardaje_')) stats.fieldsUpdated.hole_yardaje++
          }
        }
      }
    }
  }

  return 'ok'
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  SYNC UNIFICADO — ${DRY_RUN ? 'DRY RUN (no aplica cambios)' : '⚠️  EJECUCIÓN REAL ⚠️'}`)
  if (COURSE_FILTER) console.log(`  Filtro: solo canchas que contengan "${COURSE_FILTER}"`)
  if (LIMIT !== Infinity) console.log(`  Limit: ${LIMIT} canchas`)
  console.log('═══════════════════════════════════════════════════════════════\n')

  let query = supabase
    .from('courses')
    .select('id, nombre, course_rating, slope_rating, par_total, pais, fuente, fedegolf_club_id, parent_id')
    .eq('activa', true)
    .order('nombre')

  const { data: courses, error } = await query
  if (error || !courses) { console.error(error); return }

  let toProcess = courses
  if (COURSE_FILTER) toProcess = toProcess.filter(c => c.nombre.toLowerCase().includes(COURSE_FILTER.toLowerCase()))
  toProcess = toProcess.slice(0, LIMIT)

  console.log(`Canchas a procesar: ${toProcess.length} / ${courses.length}\n`)

  for (const c of toProcess) {
    try {
      await processCourse(c as BdCourse)
    } catch (err) {
      console.error(`ERROR en ${c.nombre}:`, (err as Error).message)
      stats.errors++
    }
    // Rate limit gentle
    await new Promise(r => setTimeout(r, 1200))
  }

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  RESUMEN')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`Total procesadas:      ${stats.total}`)
  console.log(`  Skip (ya 100%):      ${stats.skip100}`)
  console.log(`  Match OK:            ${stats.matchOk}`)
  console.log(`  Match bajo (<0.5):   ${stats.matchLow}`)
  console.log(`  Sin match:           ${stats.noMatch}`)
  console.log(`  Errores:             ${stats.errors}`)
  console.log()
  console.log('Campos actualizados:')
  console.log(`  courses.course_rating:  ${stats.fieldsUpdated.course_rating}`)
  console.log(`  courses.slope_rating:   ${stats.fieldsUpdated.slope_rating}`)
  console.log(`  courses.par_total:      ${stats.fieldsUpdated.par_total_course}`)
  console.log(`  tees.rating:            ${stats.fieldsUpdated.tee_rating}`)
  console.log(`  tees.slope:             ${stats.fieldsUpdated.tee_slope}`)
  console.log(`  tees.yardaje_total:     ${stats.fieldsUpdated.tee_yardaje_total}`)
  console.log(`  tees.par_total:         ${stats.fieldsUpdated.tee_par_total}`)
  console.log(`  tees.bogey_rating:      ${stats.fieldsUpdated.tee_bogey}`)
  console.log(`  holes.par:              ${stats.fieldsUpdated.hole_par}`)
  console.log(`  holes.yardaje:          ${stats.fieldsUpdated.hole_yardaje}`)
  console.log(`  holes insertados:       ${stats.fieldsUpdated.holes_inserted}`)
  console.log()
  if (DRY_RUN) console.log('⚠️  Esto fue DRY RUN — ningún cambio aplicado. Usar --execute para aplicar.')
  console.log('═══════════════════════════════════════════════════════════════')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
