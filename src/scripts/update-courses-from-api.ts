/**
 * Script: Actualización masiva de canchas desde golfcourseapi.com
 * Ejecutar: npx tsx src/scripts/update-courses-from-api.ts
 *
 * - Actualiza par, yardaje por hoyo y tee
 * - Actualiza CR/slope por tee y género (incluyendo front/back 9)
 * - Crea multi-recorrido para Marbella y Rocas
 * - Estima stroke index basado en yardaje
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const API_KEY = process.env.GOLF_COURSE_API_KEY
if (!API_KEY) {
  console.error('ERROR: GOLF_COURSE_API_KEY no configurada en .env.local')
  process.exit(1)
}
const API_BASE = 'https://api.golfcourseapi.com/v1'

// ─── Course mapping: our DB name → API search query ─────────────────────
interface CourseMapping {
  dbName: string
  searchQuery: string
  apiIds: number[]          // API IDs to fetch (multiple for multi-recorrido combos)
  multiRecorrido?: {
    loops: string[]          // e.g., ['Sur', 'Norte', 'Este']
    combos: { id: number; loop1: string; loop2: string }[]
  }
}

const COURSE_MAPPINGS: CourseMapping[] = [
  // ── Standard 18-hole courses ──
  { dbName: 'Club de Golf Los Leones', searchQuery: 'Los Leones', apiIds: [15080] },
  { dbName: 'Club de Golf Prince of Wales', searchQuery: 'Prince of Wales', apiIds: [15305] },
  { dbName: 'Club de Golf Sport Francés', searchQuery: 'Sport Frances', apiIds: [15431] },
  { dbName: 'Club de Golf Lomas de La Dehesa', searchQuery: 'Lomas de la Dehesa', apiIds: [15124] },
  { dbName: 'Club de Golf Granadilla', searchQuery: 'Granadilla', apiIds: [15285] },
  { dbName: 'Club de Golf Cachagua', searchQuery: 'Cachagua', apiIds: [15511] },
  { dbName: 'Club de Golf Costa Cachagua', searchQuery: 'Costa Cachagua', apiIds: [15328] },
  { dbName: 'Hacienda Chicureo Golf Club', searchQuery: 'Hacienda de Chicureo', apiIds: [15279] },
  { dbName: 'Club de Golf Angostura', searchQuery: 'Angostura Golf', apiIds: [25988] },
  { dbName: 'Club de Golf La Serena', searchQuery: 'La Serena golf', apiIds: [15362] },
  { dbName: 'Club de Golf Las Araucarias', searchQuery: 'Las Araucarias', apiIds: [15346] },
  { dbName: 'Club de Golf Los Lirios', searchQuery: 'Los Lirios', apiIds: [15478] },
  { dbName: 'Club de Golf Papudo', searchQuery: 'Papudo', apiIds: [14972] },
  { dbName: 'Club de Golf Santa Augusta de Quintay', searchQuery: 'Santa Augusta', apiIds: [15228] },
  { dbName: 'Patagonia Virgin Frutillar', searchQuery: 'Patagonia Virgin', apiIds: [26062] },
  { dbName: 'Country Club de Bogotá', searchQuery: 'Country Club Bogota', apiIds: [11998] },
  { dbName: 'Nordelta Golf Club', searchQuery: 'Nordelta', apiIds: [25400] },
  { dbName: 'Olivos Golf Club', searchQuery: 'Olivos Golf', apiIds: [25465] },
  { dbName: 'Hurlingham Club', searchQuery: 'Hurlingham', apiIds: [26269] },

  // ── Multi-recorrido: Las Brisas de Chicureo (2 combos) ──
  { dbName: 'Club de Golf Las Brisas de Chicureo', searchQuery: 'Las Brisas de Chicureo', apiIds: [15374, 15588],
    multiRecorrido: {
      loops: ['Montana', 'Valle'],
      combos: [
        { id: 15374, loop1: 'Montana', loop2: 'Valle' },  // Assumption: only 2 loops
      ]
    }
  },

  // ── Multi-recorrido: Brisas de Santo Domingo (27h) ──
  { dbName: 'Club de Golf Brisas de Santo Domingo', searchQuery: 'Brisas Santo Domingo', apiIds: [15140, 15257, 15275],
    multiRecorrido: {
      loops: ['Sur', 'Norte', 'Este'],
      combos: [
        { id: 15140, loop1: 'Sur', loop2: 'Norte' },
        { id: 15257, loop1: 'Sur', loop2: 'Este' },
        { id: 15275, loop1: 'Norte', loop2: 'Este' },
      ]
    }
  },

  // ── Multi-recorrido: Marbella (27h) ──
  { dbName: 'Club de Golf Marbella', searchQuery: 'Marbella Country Club', apiIds: [15283, 15317, 15339],
    multiRecorrido: {
      loops: ['Andes Pro', 'Pacifico Norte', 'Pacifico Sur'],
      combos: [
        { id: 15283, loop1: 'Andes Pro', loop2: 'Pacifico Norte' },
        { id: 15317, loop1: 'Pacifico Norte', loop2: 'Pacifico Sur' },
        { id: 15339, loop1: 'Andes Pro', loop2: 'Pacifico Sur' },
      ]
    }
  },

  // ── Multi-recorrido: Rocas de Santo Domingo (27h) ──
  { dbName: 'Club de Golf Rocas de Santo Domingo', searchQuery: 'Rocas de Santo Domingo', apiIds: [15155, 15266, 15274],
    multiRecorrido: {
      loops: ['Roja', 'Azul', 'Blanca'],
      combos: [
        { id: 15155, loop1: 'Roja', loop2: 'Azul' },
        { id: 15266, loop1: 'Roja', loop2: 'Blanca' },
        { id: 15274, loop1: 'Azul', loop2: 'Blanca' },
      ]
    }
  },
]

// ─── API fetch helper ───────────────────────────────────────────────────
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
  location: { state: string; country: string }
  tees: { male?: ApiTee[]; female?: ApiTee[] }
}

async function fetchCourseById(id: number): Promise<ApiCourse | null> {
  const res = await fetch(`${API_BASE}/courses/${id}`, {
    headers: { 'Authorization': `Key ${API_KEY}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.course || null
}

// ─── SI estimation algorithm ────────────────────────────────────────────
function estimateStrokeIndex(holes: { par: number; yardage: number }[]): number[] {
  // Average yardage by par for reference
  const avgByPar: Record<number, number> = { 3: 170, 4: 380, 5: 520 }

  // Calculate relative difficulty for each hole
  const difficulties = holes.map((h, i) => ({
    index: i,
    difficulty: h.yardage / (avgByPar[h.par] || 380),
    isFront: i < 9,
  }))

  // Separate front and back, sort by difficulty descending
  const front = difficulties.filter(d => d.isFront).sort((a, b) => b.difficulty - a.difficulty)
  const back = difficulties.filter(d => !d.isFront).sort((a, b) => b.difficulty - a.difficulty)

  // Assign SI: odd numbers to front 9, even to back 9 (WHS convention)
  const si = new Array(holes.length).fill(0)
  front.forEach((d, rank) => { si[d.index] = rank * 2 + 1 })  // 1,3,5,7,9,11,13,15,17
  back.forEach((d, rank) => { si[d.index] = rank * 2 + 2 })   // 2,4,6,8,10,12,14,16,18

  return si
}

// ─── TEE NAME MAPPING ───────────────────────────────────────────────────
function mapTeeName(apiName: string): string {
  const lower = apiName.toLowerCase()
  if (lower === 'negro' || lower === 'negra' || lower === 'black' || lower === 'championship') return 'campeonato'
  if (lower === 'azul' || lower === 'blue') return 'azul'
  if (lower === 'blanco' || lower === 'blanca' || lower === 'white') return 'blanco'
  if (lower === 'rojo' || lower === 'roja' || lower === 'red') return 'rojo'
  if (lower === 'dorado' || lower === 'dorada' || lower === 'gold') return 'dorado'
  return lower
}

// Map API tee to our yardage column name
function teeToYardageCol(teeName: string): string | null {
  const mapped = mapTeeName(teeName)
  if (mapped === 'campeonato') return 'yardaje_campeonato'
  if (mapped === 'azul') return 'yardaje_azul'
  if (mapped === 'blanco') return 'yardaje_blanco'
  if (mapped === 'rojo') return 'yardaje_rojo'
  return null
}

// ─── MAIN UPDATE LOGIC ──────────────────────────────────────────────────

async function updateStandardCourse(mapping: CourseMapping) {
  const apiCourse = await fetchCourseById(mapping.apiIds[0])
  if (!apiCourse) {
    console.log(`  ❌ API no devolvió datos para ${mapping.dbName}`)
    return
  }

  // Find our course in DB
  const { data: dbCourse } = await supabase
    .from('courses')
    .select('id, nombre')
    .eq('nombre', mapping.dbName)
    .single()

  if (!dbCourse) {
    console.log(`  ❌ Cancha no encontrada en BD: ${mapping.dbName}`)
    return
  }

  const courseId = dbCourse.id
  const allTees = [...(apiCourse.tees.male || []), ...(apiCourse.tees.female || [])]
  const primaryTee = apiCourse.tees.male?.[0]

  if (!primaryTee || !primaryTee.holes || primaryTee.holes.length < 9) {
    console.log(`  ❌ Sin datos de hoyos: ${mapping.dbName}`)
    return
  }

  // Estimate stroke index from primary tee yardage
  const estimatedSI = estimateStrokeIndex(primaryTee.holes)

  // Update course_holes
  for (let i = 0; i < primaryTee.holes.length; i++) {
    const holeNum = i + 1
    const par = primaryTee.holes[i].par
    const si = estimatedSI[i]

    // Build yardage object from all tees
    const yardages: Record<string, number> = {}
    for (const tee of allTees) {
      const col = teeToYardageCol(tee.tee_name)
      if (col && tee.holes[i]) {
        yardages[col] = tee.holes[i].yardage
      }
    }

    const { error } = await supabase
      .from('course_holes')
      .upsert({
        course_id: courseId,
        numero: holeNum,
        par,
        stroke_index: si,
        ...yardages,
      }, { onConflict: 'course_id,numero' })

    if (error) console.log(`  ⚠️ Error hoyo ${holeNum}: ${error.message}`)
  }

  // Update course_tees for each tee
  for (const tee of allTees) {
    const genero = apiCourse.tees.female?.includes(tee) ? 'F' : 'M'
    const nombre = mapTeeName(tee.tee_name)

    const { error } = await supabase
      .from('course_tees')
      .upsert({
        course_id: courseId,
        nombre,
        rating: tee.course_rating,
        slope: tee.slope_rating,
        par_total: tee.par_total,
        yardaje_total: tee.total_yards,
        genero,
        bogey_rating: tee.bogey_rating,
        total_yards: tee.total_yards,
        total_meters: tee.total_meters,
        front_course_rating: tee.front_course_rating,
        front_slope_rating: tee.front_slope_rating,
        front_bogey_rating: tee.front_bogey_rating,
        back_course_rating: tee.back_course_rating,
        back_slope_rating: tee.back_slope_rating,
        back_bogey_rating: tee.back_bogey_rating,
      }, { onConflict: 'course_id,nombre' })

    if (error) console.log(`  ⚠️ Error tee ${nombre}: ${error.message}`)
  }

  // Update course-level data
  await supabase
    .from('courses')
    .update({
      par_total: primaryTee.par_total,
      slope_rating: primaryTee.slope_rating,
      course_rating: primaryTee.course_rating,
      datos_verificados: true,
    })
    .eq('id', courseId)

  console.log(`  ✅ ${mapping.dbName}: ${primaryTee.holes.length} hoyos, ${allTees.length} tees`)
}

async function updateMultiRecorridoCourse(mapping: CourseMapping) {
  if (!mapping.multiRecorrido) return

  // Fetch all combos from API
  const combos: { combo: typeof mapping.multiRecorrido.combos[0]; course: ApiCourse }[] = []
  for (const combo of mapping.multiRecorrido.combos) {
    const apiCourse = await fetchCourseById(combo.id)
    if (apiCourse) {
      combos.push({ combo, course: apiCourse })
    } else {
      console.log(`  ❌ API no devolvió combo ${combo.id} para ${mapping.dbName}`)
    }
  }

  if (combos.length === 0) return

  // Find or create parent course
  let { data: parentCourse } = await supabase
    .from('courses')
    .select('id')
    .eq('nombre', mapping.dbName)
    .is('parent_id', null)
    .single()

  if (!parentCourse) {
    console.log(`  ❌ Parent course no encontrado: ${mapping.dbName}`)
    return
  }

  const parentId = parentCourse.id

  // Update parent as 27h
  await supabase
    .from('courses')
    .update({
      tipo_recorrido: '27h',
      datos_verificados: true,
    })
    .eq('id', parentId)

  // Extract individual loops from combos
  const loops: Record<string, { holes: ApiHole[] }> = {}

  for (const { combo, course } of combos) {
    const tee = course.tees.male?.[0]
    if (!tee || !tee.holes) continue

    const front9 = tee.holes.slice(0, 9)
    const back9 = tee.holes.slice(9, 18)

    if (!loops[combo.loop1]) loops[combo.loop1] = { holes: front9 }
    if (!loops[combo.loop2]) loops[combo.loop2] = { holes: back9 }
  }

  // Create/update child courses for each loop
  for (const loopName of mapping.multiRecorrido.loops) {
    const loopData = loops[loopName]
    if (!loopData) {
      console.log(`  ⚠️ Loop ${loopName} no encontrado`)
      continue
    }

    // Find or create child course
    let { data: childCourse } = await supabase
      .from('courses')
      .select('id')
      .eq('parent_id', parentId)
      .eq('loop_nombre', loopName)
      .single()

    if (!childCourse) {
      const { data: newChild, error } = await supabase
        .from('courses')
        .insert({
          nombre: mapping.dbName,
          ciudad: (await supabase.from('courses').select('ciudad').eq('id', parentId).single()).data?.ciudad,
          parent_id: parentId,
          loop_nombre: loopName,
          tipo_recorrido: '9h',
          par_total: loopData.holes.reduce((s, h) => s + h.par, 0),
          activa: true,
          datos_verificados: true,
        })
        .select('id')
        .single()

      if (error) {
        console.log(`  ❌ Error creando loop ${loopName}: ${error.message}`)
        continue
      }
      childCourse = newChild
    }

    if (!childCourse) continue

    // Estimate SI for 9 holes (1-9 ranking)
    const avgByPar: Record<number, number> = { 3: 170, 4: 380, 5: 520 }
    const difficulties = loopData.holes.map((h, i) => ({
      index: i,
      difficulty: h.yardage / (avgByPar[h.par] || 380),
    }))
    const sorted = [...difficulties].sort((a, b) => b.difficulty - a.difficulty)
    const si9 = new Array(9).fill(0)
    sorted.forEach((d, rank) => { si9[d.index] = rank + 1 })

    // Upsert holes
    for (let i = 0; i < loopData.holes.length; i++) {
      await supabase
        .from('course_holes')
        .upsert({
          course_id: childCourse.id,
          numero: i + 1,
          par: loopData.holes[i].par,
          stroke_index: si9[i],
          recorrido: loopName,
        }, { onConflict: 'course_id,numero' })
    }

    // Update child course par_total
    await supabase
      .from('courses')
      .update({
        par_total: loopData.holes.reduce((s, h) => s + h.par, 0),
        datos_verificados: true,
      })
      .eq('id', childCourse.id)

    console.log(`    Loop ${loopName}: ${loopData.holes.length} hoyos, par ${loopData.holes.reduce((s, h) => s + h.par, 0)}`)
  }

  // Store tee data for each combination
  for (const { combo, course } of combos) {
    const allTees = [...(course.tees.male || []), ...(course.tees.female || [])]
    for (const tee of allTees) {
      const genero = course.tees.female?.includes(tee) ? 'F' : 'M'
      const nombre = `${mapTeeName(tee.tee_name)}_${combo.loop1}_${combo.loop2}`

      await supabase
        .from('course_tees')
        .upsert({
          course_id: parentId,
          nombre,
          rating: tee.course_rating,
          slope: tee.slope_rating,
          par_total: tee.par_total,
          yardaje_total: tee.total_yards,
          genero,
          bogey_rating: tee.bogey_rating,
          total_yards: tee.total_yards,
          total_meters: tee.total_meters,
          front_course_rating: tee.front_course_rating,
          front_slope_rating: tee.front_slope_rating,
          front_bogey_rating: tee.front_bogey_rating,
          back_course_rating: tee.back_course_rating,
          back_slope_rating: tee.back_slope_rating,
          back_bogey_rating: tee.back_bogey_rating,
        }, { onConflict: 'course_id,nombre' })
    }
  }

  console.log(`  ✅ ${mapping.dbName}: ${Object.keys(loops).length} loops, ${combos.length} combos`)
}

// ─── MAIN ───────────────────────────────────────────────────────────────

async function main() {
  console.log('═══ Actualización masiva de canchas desde golfcourseapi.com ═══')
  console.log(`Canchas a actualizar: ${COURSE_MAPPINGS.length}`)
  console.log('')

  let updated = 0
  let failed = 0

  for (const mapping of COURSE_MAPPINGS) {
    console.log(`[${updated + failed + 1}/${COURSE_MAPPINGS.length}] ${mapping.dbName}`)

    try {
      if (mapping.multiRecorrido) {
        await updateMultiRecorridoCourse(mapping)
      } else {
        await updateStandardCourse(mapping)
      }
      updated++
    } catch (err) {
      console.log(`  ❌ Error: ${(err as Error).message}`)
      failed++
    }

    // Rate limit: 1 request per second
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('')
  console.log('═══ RESUMEN ═══')
  console.log(`Actualizadas: ${updated}`)
  console.log(`Fallidas: ${failed}`)
  console.log(`Total: ${COURSE_MAPPINGS.length}`)
}

main().catch(console.error)
