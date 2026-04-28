/**
 * Seed de canchas verificadas — Golfers+
 *
 * IMPORTANTE: Usa UUIDs REALES de la BD existente (no inventados).
 * Hace upsert por nombre para no crear duplicados.
 *
 * Requiere: migración 002 ejecutada en Supabase SQL Editor ANTES.
 * Si course_tees no existe, skipea los tees sin fallar.
 *
 * Ejecutar: npx tsx src/scripts/seed-courses.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('❌ Faltan vars de entorno'); process.exit(1) }

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

let ok = 0, warn = 0, err = 0

// ── Pre-flight: check if migration ran ────────────────────────
async function checkMigration(): Promise<{ hasTees: boolean; hasNewCols: boolean }> {
  const { error: teesErr } = await sb.from('course_tees').select('id').limit(0)
  const hasTees = !teesErr

  // Check for new columns by trying to select them
  const { error: colErr } = await sb.from('courses').select('tipo_recorrido').limit(0)
  const hasNewCols = !colErr

  return { hasTees, hasNewCols }
}

// ── Find course by name, return existing ID ────────────────────
async function findCourseByName(nombre: string): Promise<string | null> {
  const { data } = await sb.from('courses').select('id').eq('nombre', nombre).single()
  return data?.id ?? null
}

// ── Upsert course (update if exists, insert if not) ──────────
async function upsertCourse(data: {
  nombre: string
  ciudad: string
  pais?: string
  par_total: number
  slope_rating?: number | null
  course_rating?: number | null
  tipo_recorrido?: string
  parent_id?: string | null
  loop_nombre?: string | null
  datos_verificados?: boolean
}): Promise<string> {
  // Find existing by name + loop_nombre (use maybeSingle to handle 0 or 1 results)
  let query = sb.from('courses').select('id').eq('nombre', data.nombre)
  if (data.loop_nombre) {
    query = query.eq('loop_nombre', data.loop_nombre)
  }
  const { data: rows } = await query.limit(1)
  const existing = rows && rows.length > 0 ? rows[0] : null

  const baseData: Record<string, unknown> = {
    nombre: data.nombre,
    ciudad: data.ciudad,
    pais: data.pais ?? 'Chile',
    par_total: data.par_total,
    slope_rating: data.slope_rating ?? null,
    course_rating: data.course_rating ?? null,
    activa: true,
    fuente: 'manual',
  }

  // Only include new columns if migration has run
  if (data.tipo_recorrido !== undefined) baseData.tipo_recorrido = data.tipo_recorrido
  if (data.parent_id !== undefined) baseData.parent_id = data.parent_id
  if (data.loop_nombre !== undefined) baseData.loop_nombre = data.loop_nombre
  if (data.datos_verificados !== undefined) baseData.datos_verificados = data.datos_verificados

  if (existing) {
    // Update existing
    const { error } = await sb.from('courses').update(baseData).eq('id', existing.id)
    if (error) throw new Error(`update ${data.nombre}: ${error.message}`)
    return existing.id
  } else {
    // Insert new
    const { data: inserted, error } = await sb.from('courses').insert(baseData).select('id').single()
    if (error) throw new Error(`insert ${data.nombre}: ${error.message}`)
    return inserted!.id
  }
}

// ── Upsert tees (only if table exists) ────────────────────────
async function upsertTees(courseId: string, tees: Array<{
  nombre: string
  yardaje_total: number
  par_total: number
  rating: number | null
  slope: number | null
  genero?: string
}>, hasTees: boolean) {
  if (!hasTees) return // Migration not run yet
  for (const tee of tees) {
    const { error } = await sb.from('course_tees').upsert(
      { course_id: courseId, genero: 'M', ...tee },
      { onConflict: 'course_id,nombre' }
    )
    if (error) console.warn(`  ⚠️ tee ${tee.nombre}: ${error.message}`)
  }
}

// ── Upsert holes ──────────────────────────────────────────────
async function upsertHoles(courseId: string, holes: Array<{
  numero: number
  par: number
  stroke_index: number
  yardaje_negras?: number | null
  yardaje_azul?: number | null
  yardaje_blanco?: number | null
  yardaje_rojo?: number | null
}>) {
  for (const hole of holes) {
    // Try upsert first (requires unique constraint from migration)
    const { error: upsertErr } = await sb.from('course_holes').upsert(
      { course_id: courseId, ...hole },
      { onConflict: 'course_id,numero' }
    )

    if (upsertErr) {
      // Fallback: delete + insert if constraint doesn't exist yet
      await sb.from('course_holes').delete().eq('course_id', courseId).eq('numero', hole.numero)
      const { error: insertErr } = await sb.from('course_holes').insert({ course_id: courseId, ...hole })
      if (insertErr) throw new Error(`hole ${hole.numero}: ${insertErr.message}`)
    }
  }
}

// ══════════════════════════════════════════════════════════════
// DATOS DE CANCHAS (verificados)
// ══════════════════════════════════════════════════════════════

async function seedAll() {
  console.log('🏌️  Golfers+ — Seed de canchas verificadas\n')

  const { hasTees, hasNewCols } = await checkMigration()
  console.log(`Pre-flight: course_tees=${hasTees ? '✅' : '❌ (skipea tees)'} | columnas nuevas=${hasNewCols ? '✅' : '❌ (skipea tipo_recorrido)'}`)
  console.log('')

  // ── 1. LOMAS DE LA DEHESA ─────────────────────────────────
  try {
    const id = await upsertCourse({
      nombre: 'Club de Golf Lomas de La Dehesa',
      ciudad: 'Lo Barnechea', par_total: 72,
      slope_rating: 145, course_rating: 72.6,
      ...(hasNewCols ? { tipo_recorrido: '18h', datos_verificados: true } : {}),
    })
    await upsertTees(id, [
      { nombre: 'Blue', yardaje_total: 6398, par_total: 72, rating: 72.6, slope: 145 },
      { nombre: 'White', yardaje_total: 5988, par_total: 72, rating: 70.6, slope: 138 },
      { nombre: 'Red', yardaje_total: 5429, par_total: 72, rating: 72.6, slope: 132, genero: 'F' },
    ], hasTees)
    await upsertHoles(id, [
      { numero: 1, par: 4, stroke_index: 15, yardaje_azul: 348, yardaje_blanco: 329, yardaje_rojo: 308 },
      { numero: 2, par: 4, stroke_index: 3, yardaje_azul: 384, yardaje_blanco: 363, yardaje_rojo: 350 },
      { numero: 3, par: 3, stroke_index: 17, yardaje_azul: 150, yardaje_blanco: 110, yardaje_rojo: 106 },
      { numero: 4, par: 4, stroke_index: 5, yardaje_azul: 373, yardaje_blanco: 364, yardaje_rojo: 285 },
      { numero: 5, par: 4, stroke_index: 11, yardaje_azul: 332, yardaje_blanco: 306, yardaje_rojo: 289 },
      { numero: 6, par: 3, stroke_index: 13, yardaje_azul: 163, yardaje_blanco: 146, yardaje_rojo: 136 },
      { numero: 7, par: 4, stroke_index: 7, yardaje_azul: 367, yardaje_blanco: 360, yardaje_rojo: 306 },
      { numero: 8, par: 5, stroke_index: 1, yardaje_azul: 516, yardaje_blanco: 494, yardaje_rojo: 469 },
      { numero: 9, par: 5, stroke_index: 9, yardaje_azul: 536, yardaje_blanco: 505, yardaje_rojo: 466 },
      { numero: 10, par: 4, stroke_index: 10, yardaje_azul: 352, yardaje_blanco: 334, yardaje_rojo: 306 },
      { numero: 11, par: 5, stroke_index: 6, yardaje_azul: 506, yardaje_blanco: 477, yardaje_rojo: 424 },
      { numero: 12, par: 4, stroke_index: 14, yardaje_azul: 378, yardaje_blanco: 340, yardaje_rojo: 323 },
      { numero: 13, par: 5, stroke_index: 4, yardaje_azul: 542, yardaje_blanco: 517, yardaje_rojo: 482 },
      { numero: 14, par: 4, stroke_index: 16, yardaje_azul: 327, yardaje_blanco: 314, yardaje_rojo: 288 },
      { numero: 15, par: 3, stroke_index: 8, yardaje_azul: 204, yardaje_blanco: 178, yardaje_rojo: 151 },
      { numero: 16, par: 4, stroke_index: 2, yardaje_azul: 402, yardaje_blanco: 391, yardaje_rojo: 334 },
      { numero: 17, par: 3, stroke_index: 18, yardaje_azul: 181, yardaje_blanco: 148, yardaje_rojo: 135 },
      { numero: 18, par: 4, stroke_index: 12, yardaje_azul: 337, yardaje_blanco: 312, yardaje_rojo: 271 },
    ])
    console.log('✅ Club de Golf Lomas de La Dehesa (18 hoyos)'); ok++
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); console.error('❌ Lomas:', msg); err++ }

  // ── 2. LOS LEONES ─────────────────────────────────────────
  try {
    const id = await upsertCourse({
      nombre: 'Club de Golf Los Leones',
      ciudad: 'Santiago', par_total: 72,
      slope_rating: 142, course_rating: 75.1,
      ...(hasNewCols ? { tipo_recorrido: '18h', datos_verificados: true } : {}),
    })
    await upsertTees(id, [
      { nombre: 'Black', yardaje_total: 7132, par_total: 72, rating: 75.1, slope: 142 },
      { nombre: 'Blue', yardaje_total: 6815, par_total: 72, rating: 73.3, slope: 136 },
      { nombre: 'White', yardaje_total: 6395, par_total: 72, rating: 71.6, slope: 129 },
    ], hasTees)
    await upsertHoles(id, [
      { numero: 1, par: 4, stroke_index: 11, yardaje_negras: 369, yardaje_azul: 369, yardaje_blanco: 349 },
      { numero: 2, par: 4, stroke_index: 7, yardaje_negras: 447, yardaje_azul: 409, yardaje_blanco: 365 },
      { numero: 3, par: 3, stroke_index: 15, yardaje_negras: 189, yardaje_azul: 189, yardaje_blanco: 178 },
      { numero: 4, par: 5, stroke_index: 1, yardaje_negras: 575, yardaje_azul: 508, yardaje_blanco: 492 },
      { numero: 5, par: 4, stroke_index: 13, yardaje_negras: 465, yardaje_azul: 408, yardaje_blanco: 364 },
      { numero: 6, par: 3, stroke_index: 17, yardaje_negras: 181, yardaje_azul: 181, yardaje_blanco: 165 },
      { numero: 7, par: 4, stroke_index: 3, yardaje_negras: 425, yardaje_azul: 403, yardaje_blanco: 382 },
      { numero: 8, par: 4, stroke_index: 9, yardaje_negras: 407, yardaje_azul: 407, yardaje_blanco: 392 },
      { numero: 9, par: 5, stroke_index: 5, yardaje_negras: 565, yardaje_azul: 545, yardaje_blanco: 524 },
      { numero: 10, par: 4, stroke_index: 14, yardaje_negras: 363, yardaje_azul: 337, yardaje_blanco: 325 },
      { numero: 11, par: 3, stroke_index: 18, yardaje_negras: 190, yardaje_azul: 190, yardaje_blanco: 178 },
      { numero: 12, par: 4, stroke_index: 6, yardaje_negras: 378, yardaje_azul: 378, yardaje_blanco: 350 },
      { numero: 13, par: 4, stroke_index: 2, yardaje_negras: 470, yardaje_azul: 438, yardaje_blanco: 393 },
      { numero: 14, par: 3, stroke_index: 16, yardaje_negras: 165, yardaje_azul: 165, yardaje_blanco: 151 },
      { numero: 15, par: 4, stroke_index: 4, yardaje_negras: 415, yardaje_azul: 415, yardaje_blanco: 380 },
      { numero: 16, par: 4, stroke_index: 8, yardaje_negras: 445, yardaje_azul: 433, yardaje_blanco: 411 },
      { numero: 17, par: 5, stroke_index: 10, yardaje_negras: 541, yardaje_azul: 529, yardaje_blanco: 509 },
      { numero: 18, par: 5, stroke_index: 12, yardaje_negras: 542, yardaje_azul: 511, yardaje_blanco: 487 },
    ])
    console.log('✅ Club de Golf Los Leones (18 hoyos)'); ok++
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); console.error('❌ Los Leones:', msg); err++ }

  // ── 3. POLO SAN CRISTÓBAL ─────────────────────────────────
  try {
    const id = await upsertCourse({
      nombre: 'Polo San Cristóbal',
      ciudad: 'Santiago', par_total: 72,
      slope_rating: 142, course_rating: 75.2,
      ...(hasNewCols ? { tipo_recorrido: '18h', datos_verificados: true } : {}),
    })
    await upsertTees(id, [
      { nombre: 'Black', yardaje_total: 7180, par_total: 72, rating: 75.2, slope: 142 },
      { nombre: 'Blue', yardaje_total: 6787, par_total: 72, rating: 72.8, slope: 130 },
      { nombre: 'White', yardaje_total: 6470, par_total: 72, rating: 71.0, slope: 124 },
    ], hasTees)
    await upsertHoles(id, [
      { numero: 1, par: 4, stroke_index: 11, yardaje_negras: 392, yardaje_azul: 380, yardaje_blanco: 368 },
      { numero: 2, par: 5, stroke_index: 7, yardaje_negras: 580, yardaje_azul: 553, yardaje_blanco: 532 },
      { numero: 3, par: 3, stroke_index: 15, yardaje_negras: 170, yardaje_azul: 160, yardaje_blanco: 150 },
      { numero: 4, par: 4, stroke_index: 13, yardaje_negras: 413, yardaje_azul: 399, yardaje_blanco: 385 },
      { numero: 5, par: 4, stroke_index: 5, yardaje_negras: 384, yardaje_azul: 353, yardaje_blanco: 323 },
      { numero: 6, par: 3, stroke_index: 17, yardaje_negras: 214, yardaje_azul: 208, yardaje_blanco: 199 },
      { numero: 7, par: 5, stroke_index: 1, yardaje_negras: 525, yardaje_azul: 500, yardaje_blanco: 481 },
      { numero: 8, par: 4, stroke_index: 9, yardaje_negras: 414, yardaje_azul: 384, yardaje_blanco: 361 },
      { numero: 9, par: 4, stroke_index: 3, yardaje_negras: 380, yardaje_azul: 361, yardaje_blanco: 346 },
      { numero: 10, par: 4, stroke_index: 4, yardaje_negras: 398, yardaje_azul: 385, yardaje_blanco: 372 },
      { numero: 11, par: 4, stroke_index: 10, yardaje_negras: 329, yardaje_azul: 320, yardaje_blanco: 312 },
      { numero: 12, par: 5, stroke_index: 12, yardaje_negras: 560, yardaje_azul: 540, yardaje_blanco: 515 },
      { numero: 13, par: 3, stroke_index: 18, yardaje_negras: 204, yardaje_azul: 187, yardaje_blanco: 170 },
      { numero: 14, par: 4, stroke_index: 8, yardaje_negras: 437, yardaje_azul: 408, yardaje_blanco: 387 },
      { numero: 15, par: 4, stroke_index: 6, yardaje_negras: 447, yardaje_azul: 426, yardaje_blanco: 402 },
      { numero: 16, par: 3, stroke_index: 16, yardaje_negras: 232, yardaje_azul: 192, yardaje_blanco: 176 },
      { numero: 17, par: 5, stroke_index: 2, yardaje_negras: 630, yardaje_azul: 571, yardaje_blanco: 553 },
      { numero: 18, par: 4, stroke_index: 14, yardaje_negras: 471, yardaje_azul: 460, yardaje_blanco: 438 },
    ])
    console.log('✅ Polo San Cristóbal (18 hoyos)'); ok++
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); console.error('❌ San Cristóbal:', msg); err++ }

  // ── 4. PRINCE OF WALES ────────────────────────────────────
  try {
    const id = await upsertCourse({
      nombre: 'Club de Golf Prince of Wales',
      ciudad: 'Santiago', par_total: 72,
      slope_rating: 136, course_rating: 76.0,
      ...(hasNewCols ? { tipo_recorrido: '18h', datos_verificados: true } : {}),
    })
    await upsertTees(id, [
      { nombre: 'Black', yardaje_total: 7171, par_total: 72, rating: 76.0, slope: 136 },
      { nombre: 'Blue', yardaje_total: 6690, par_total: 72, rating: 73.9, slope: 131 },
      { nombre: 'White', yardaje_total: 6234, par_total: 72, rating: 71.7, slope: 131 },
    ], hasTees)
    await upsertHoles(id, [
      { numero: 1, par: 4, stroke_index: 11, yardaje_negras: 361, yardaje_azul: 361, yardaje_blanco: 347 },
      { numero: 2, par: 4, stroke_index: 9, yardaje_negras: 433, yardaje_azul: 376, yardaje_blanco: 350 },
      { numero: 3, par: 5, stroke_index: 3, yardaje_negras: 551, yardaje_azul: 551, yardaje_blanco: 502 },
      { numero: 4, par: 3, stroke_index: 17, yardaje_negras: 173, yardaje_azul: 173, yardaje_blanco: 154 },
      { numero: 5, par: 4, stroke_index: 7, yardaje_negras: 420, yardaje_azul: 420, yardaje_blanco: 401 },
      { numero: 6, par: 4, stroke_index: 5, yardaje_negras: 444, yardaje_azul: 444, yardaje_blanco: 406 },
      { numero: 7, par: 3, stroke_index: 15, yardaje_negras: 214, yardaje_azul: 214, yardaje_blanco: 168 },
      { numero: 8, par: 4, stroke_index: 13, yardaje_negras: 375, yardaje_azul: 375, yardaje_blanco: 344 },
      { numero: 9, par: 5, stroke_index: 1, yardaje_negras: 605, yardaje_azul: 561, yardaje_blanco: 524 },
      { numero: 10, par: 4, stroke_index: 16, yardaje_negras: 380, yardaje_azul: 380, yardaje_blanco: 374 },
      { numero: 11, par: 3, stroke_index: 18, yardaje_negras: 169, yardaje_azul: 149, yardaje_blanco: 141 },
      { numero: 12, par: 4, stroke_index: 4, yardaje_negras: 439, yardaje_azul: 439, yardaje_blanco: 406 },
      { numero: 13, par: 4, stroke_index: 12, yardaje_negras: 488, yardaje_azul: 410, yardaje_blanco: 386 },
      { numero: 14, par: 5, stroke_index: 14, yardaje_negras: 522, yardaje_azul: 283, yardaje_blanco: 265 },
      { numero: 15, par: 3, stroke_index: 6, yardaje_negras: 221, yardaje_azul: 221, yardaje_blanco: 201 },
      { numero: 16, par: 4, stroke_index: 2, yardaje_negras: 398, yardaje_azul: 398, yardaje_blanco: 388 },
      { numero: 17, par: 4, stroke_index: 8, yardaje_negras: 398, yardaje_azul: 398, yardaje_blanco: 373 },
      { numero: 18, par: 5, stroke_index: 10, yardaje_negras: 580, yardaje_azul: 537, yardaje_blanco: 504 },
    ])
    console.log('✅ Club de Golf Prince of Wales (18 hoyos)'); ok++
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); console.error('❌ Prince of Wales:', msg); err++ }

  // ── 5. SPORT FRANCÉS ──────────────────────────────────────
  try {
    const id = await upsertCourse({
      nombre: 'Club de Golf Sport Francés',
      ciudad: 'Santiago', par_total: 72,
      slope_rating: 132, course_rating: 72.9,
      ...(hasNewCols ? { tipo_recorrido: '18h', datos_verificados: true } : {}),
    })
    await upsertTees(id, [
      { nombre: 'Blue', yardaje_total: 6900, par_total: 72, rating: 72.9, slope: 132 },
      { nombre: 'White', yardaje_total: 6395, par_total: 72, rating: 71.1, slope: 130 },
      { nombre: 'Red', yardaje_total: 5805, par_total: 72, rating: 69.0, slope: 116, genero: 'F' },
    ], hasTees)
    await upsertHoles(id, [
      { numero: 1, par: 4, stroke_index: 13, yardaje_azul: 392, yardaje_blanco: 365, yardaje_rojo: 351 },
      { numero: 2, par: 4, stroke_index: 3, yardaje_azul: 371, yardaje_blanco: 350, yardaje_rojo: 330 },
      { numero: 3, par: 4, stroke_index: 7, yardaje_azul: 410, yardaje_blanco: 377, yardaje_rojo: 364 },
      { numero: 4, par: 3, stroke_index: 15, yardaje_azul: 187, yardaje_blanco: 163, yardaje_rojo: 153 },
      { numero: 5, par: 4, stroke_index: 11, yardaje_azul: 387, yardaje_blanco: 356, yardaje_rojo: 332 },
      { numero: 6, par: 4, stroke_index: 1, yardaje_azul: 419, yardaje_blanco: 401, yardaje_rojo: 355 },
      { numero: 7, par: 3, stroke_index: 17, yardaje_azul: 164, yardaje_blanco: 151, yardaje_rojo: 146 },
      { numero: 8, par: 5, stroke_index: 9, yardaje_azul: 550, yardaje_blanco: 505, yardaje_rojo: 440 },
      { numero: 9, par: 5, stroke_index: 5, yardaje_azul: 524, yardaje_blanco: 501, yardaje_rojo: 439 },
      { numero: 10, par: 4, stroke_index: 12, yardaje_azul: 391, yardaje_blanco: 367, yardaje_rojo: 334 },
      { numero: 11, par: 3, stroke_index: 18, yardaje_azul: 177, yardaje_blanco: 164, yardaje_rojo: 154 },
      { numero: 12, par: 4, stroke_index: 4, yardaje_azul: 369, yardaje_blanco: 344, yardaje_rojo: 276 },
      { numero: 13, par: 5, stroke_index: 8, yardaje_azul: 602, yardaje_blanco: 570, yardaje_rojo: 482 },
      { numero: 14, par: 4, stroke_index: 14, yardaje_azul: 344, yardaje_blanco: 314, yardaje_rojo: 291 },
      { numero: 15, par: 4, stroke_index: 2, yardaje_azul: 425, yardaje_blanco: 382, yardaje_rojo: 352 },
      { numero: 16, par: 3, stroke_index: 16, yardaje_azul: 196, yardaje_blanco: 173, yardaje_rojo: 161 },
      { numero: 17, par: 4, stroke_index: 10, yardaje_azul: 420, yardaje_blanco: 381, yardaje_rojo: 338 },
      { numero: 18, par: 5, stroke_index: 6, yardaje_azul: 572, yardaje_blanco: 531, yardaje_rojo: 507 },
    ])
    console.log('✅ Club de Golf Sport Francés (18 hoyos)'); ok++
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); console.error('❌ Sport Francés:', msg); err++ }

  // ── 6. MAPOCHO ────────────────────────────────────────────
  try {
    const id = await upsertCourse({
      nombre: 'Club de Golf Mapocho',
      ciudad: 'Santiago', par_total: 72,
      slope_rating: 137, course_rating: 75.5,
      ...(hasNewCols ? { tipo_recorrido: '18h', datos_verificados: true } : {}),
    })
    await upsertTees(id, [
      { nombre: 'Black', yardaje_total: 7503, par_total: 72, rating: 75.5, slope: 137 },
      { nombre: 'Blue', yardaje_total: 6932, par_total: 72, rating: 72.3, slope: 123 },
      { nombre: 'White', yardaje_total: 6254, par_total: 72, rating: 69.7, slope: 121 },
    ], hasTees)
    await upsertHoles(id, [
      { numero: 1, par: 5, stroke_index: 3, yardaje_negras: 594, yardaje_azul: 574, yardaje_blanco: 536 },
      { numero: 2, par: 5, stroke_index: 5, yardaje_negras: 615, yardaje_azul: 572, yardaje_blanco: 553 },
      { numero: 3, par: 3, stroke_index: 7, yardaje_negras: 216, yardaje_azul: 187, yardaje_blanco: 152 },
      { numero: 4, par: 4, stroke_index: 13, yardaje_negras: 419, yardaje_azul: 401, yardaje_blanco: 351 },
      { numero: 5, par: 4, stroke_index: 15, yardaje_negras: 354, yardaje_azul: 336, yardaje_blanco: 304 },
      { numero: 6, par: 3, stroke_index: 9, yardaje_negras: 236, yardaje_azul: 196, yardaje_blanco: 163 },
      { numero: 7, par: 5, stroke_index: 11, yardaje_negras: 558, yardaje_azul: 541, yardaje_blanco: 492 },
      { numero: 8, par: 3, stroke_index: 17, yardaje_negras: 208, yardaje_azul: 171, yardaje_blanco: 152 },
      { numero: 9, par: 4, stroke_index: 1, yardaje_negras: 490, yardaje_azul: 465, yardaje_blanco: 425 },
      { numero: 10, par: 4, stroke_index: 16, yardaje_negras: 426, yardaje_azul: 398, yardaje_blanco: 350 },
      { numero: 11, par: 4, stroke_index: 2, yardaje_negras: 493, yardaje_azul: 417, yardaje_blanco: 372 },
      { numero: 12, par: 5, stroke_index: 6, yardaje_negras: 655, yardaje_azul: 604, yardaje_blanco: 520 },
      { numero: 13, par: 3, stroke_index: 18, yardaje_negras: 171, yardaje_azul: 160, yardaje_blanco: 140 },
      { numero: 14, par: 4, stroke_index: 4, yardaje_negras: 444, yardaje_azul: 419, yardaje_blanco: 384 },
      { numero: 15, par: 4, stroke_index: 10, yardaje_negras: 430, yardaje_azul: 368, yardaje_blanco: 332 },
      { numero: 16, par: 4, stroke_index: 14, yardaje_negras: 420, yardaje_azul: 400, yardaje_blanco: 361 },
      { numero: 17, par: 3, stroke_index: 8, yardaje_negras: 223, yardaje_azul: 197, yardaje_blanco: 170 },
      { numero: 18, par: 5, stroke_index: 12, yardaje_negras: 551, yardaje_azul: 526, yardaje_blanco: 497 },
    ])
    console.log('✅ Club de Golf Mapocho (18 hoyos)'); ok++
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); console.error('❌ Mapocho:', msg); err++ }

  // ── 7. Conectar historical_rounds ─────────────────────────
  console.log('\n🔗 Conectando historical_rounds...')
  const { error: hrColErr } = await sb.from('historical_rounds').select('course_id').limit(0)
  if (hrColErr) {
    console.log('  ⚠️ historical_rounds.course_id no existe aún (migración pendiente)')
  } else {
    const nameMap: Record<string, string[]> = {}
    // Build map from course names
    const { data: allCourses } = await sb.from('courses').select('id, nombre')
    for (const c of allCourses ?? []) {
      const key = (c.nombre as string).toLowerCase()
      if (!nameMap[key]) nameMap[key] = []
      nameMap[key].push(c.id as string)
    }

    const { data: unlinked } = await sb.from('historical_rounds')
      .select('id, course_name')
      .is('course_id', null)
      .not('course_name', 'is', null)

    let linked = 0
    for (const hr of unlinked ?? []) {
      const name = (hr.course_name as string).toLowerCase()
      // Try exact match, then partial
      const match = nameMap[name]
        || Object.entries(nameMap).find(([k]) => name.includes(k) || k.includes(name))?.[1]
      if (match) {
        await sb.from('historical_rounds').update({ course_id: match[0] }).eq('id', hr.id)
        linked++
      }
    }
    console.log(`  ✅ ${linked} rondas históricas vinculadas`)
  }

  // ── REPORTE ─────────────────────────────────────────────────
  const { count: courses } = await sb.from('courses').select('*', { count: 'exact', head: true })
  const { count: holes } = await sb.from('course_holes').select('*', { count: 'exact', head: true })

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`📊 RESULTADO: ${ok} ✅ | ${warn} ⚠️ | ${err} ❌`)
  console.log(`\nBD: ${courses} canchas | ${holes} hoyos`)

  if (err > 0) process.exit(1)
}

seedAll().catch(e => { console.error('❌ Fatal:', e); process.exit(1) })
