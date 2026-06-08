/**
 * Canario END-TO-END del pipeline de importación contra el schema REAL de prod.
 *
 * Razón de existir: el 2026-06-08 se colaron a prod 3 bugs que los unit tests con
 * MOCK no agarraron porque mockeaban el insert sin tocar el schema real:
 *  - #130: importRound escribía la columna inexistente `source` (real: import_source)
 *    → cada insert fallaba con 42703 → success:false silencioso → un usuario nuevo
 *    importó 125 rondas y su cuenta quedó VACÍA.
 *  - #131: el tee de la foto se descartaba → rondas sin CR/slope del catálogo.
 *
 * Este canario prueba el camino real: importRound → BD → leer de vuelta → CR/slope
 * resuelto del catálogo + diferencial canónico. Si la columna cambia, si el tee
 * deja de resolver, o si la ronda no se guarda, ESTE TEST FALLA y bloquea el push.
 *
 * Corre contra prod con un usuario de prueba y limpia lo que inserta. Se saltea
 * si no hay credenciales (CI sin secrets) — ver [[reference_vitest_describe_skipif]].
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { importRound } from '@/lib/import-round'
import { calcularDiferencial } from '@/lib/indice-golfers'
import { getTestUserId } from '../../../e2e/helpers/ronda-fixture'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const e2eEmail = process.env.E2E_TEST_USER_EMAIL
const skipIfNoEnv = !url || !serviceKey || !e2eEmail

// Los Leones (VARONES) — validado contra prod (tiene course_holes + tee azul con
// rating). Mismo curso default que el resto de los fixtures.
const COURSE_ID = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'

describe.skipIf(skipIfNoEnv)('import-pipeline — canario end-to-end (schema real)', () => {
  let admin: SupabaseClient
  let userId: string
  let teeRating: number
  let teeSlope: number
  const insertedIds: string[] = []

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    userId = await getTestUserId()
    const { data: tee } = await admin
      .from('course_tees')
      .select('rating, slope')
      .eq('course_id', COURSE_ID)
      .ilike('nombre', 'azul%')
      .limit(1)
      .maybeSingle()
    if (!tee?.rating || !tee?.slope) {
      throw new Error('El tee azul del curso de prueba no tiene rating en el catálogo')
    }
    teeRating = Number(tee.rating)
    teeSlope = Number(tee.slope)
  })

  afterAll(async () => {
    if (insertedIds.length) await admin.from('historical_rounds').delete().in('id', insertedIds)
  })

  it('camino feliz: la ronda se GUARDA con CR/slope del catálogo y diferencial sano', async () => {
    const scores = Array(18).fill(5) // gross 90
    const res = await importRound(admin, {
      userId,
      courseId: COURSE_ID,
      courseName: 'Los Leones',
      teeColor: 'azul',
      scores,
      playedAt: '2026-01-01',
      source: 'manual',
      totalGross: 90,
      holesPlayed: 18,
    })

    // #130: con la columna mala esto era success:false. Si vuelve a romperse, acá cae.
    expect(res.success).toBe(true)
    expect(res.roundId).toBeTruthy()
    insertedIds.push(res.roundId!)

    // Leer de vuelta de la BD — NO confiar en el return. La ronda DEBE existir.
    const { data: saved } = await admin
      .from('historical_rounds')
      .select('course_id, tee_color, course_rating, slope_rating, diferencial')
      .eq('id', res.roundId!)
      .single()

    expect(saved).toBeTruthy() // #130: 0 filas guardadas pese a success
    expect(saved!.course_id).toBe(COURSE_ID)
    expect(saved!.tee_color).toBe('azul')
    // tee resuelto del catálogo (no del archivo) — #131
    expect(Number(saved!.course_rating)).toBe(teeRating)
    expect(Number(saved!.slope_rating)).toBe(teeSlope)
    // diferencial presente y = al canónico (no null, no basura)
    const expected = calcularDiferencial(90, teeRating, teeSlope, 18)
    expect(saved!.diferencial).not.toBeNull()
    expect(Number(saved!.diferencial)).toBeCloseTo(expected!, 2)
  })

  it('una ronda 9h resuelve y produce un diferencial equivalente-18h razonable', async () => {
    const scores = Array(9).fill(5) // gross 45 en 9 hoyos
    const res = await importRound(admin, {
      userId,
      courseId: COURSE_ID,
      courseName: 'Los Leones',
      teeColor: 'azul',
      scores,
      playedAt: '2026-01-03',
      source: 'manual',
      totalGross: 45,
      holesPlayed: 9,
    })
    expect(res.success).toBe(true)
    insertedIds.push(res.roundId!)

    const { data: saved } = await admin
      .from('historical_rounds')
      .select('holes_played, diferencial')
      .eq('id', res.roundId!)
      .single()
    expect(saved!.holes_played).toBe(9)
    expect(saved!.diferencial).not.toBeNull()
    // equivalente-18h: razonable, no un valor imposible
    expect(Number(saved!.diferencial)).toBeGreaterThan(-10)
    expect(Number(saved!.diferencial)).toBeLessThan(54)
  })

  it('una ronda SIN tee NO inventa CR/slope (entra honesta, sin diferencial)', async () => {
    const res = await importRound(admin, {
      userId,
      courseId: COURSE_ID,
      courseName: 'Los Leones',
      teeColor: null,
      scores: Array(18).fill(5),
      playedAt: '2026-01-02',
      source: 'manual',
      totalGross: 90,
      holesPlayed: 18,
    })
    expect(res.success).toBe(true)
    insertedIds.push(res.roundId!)

    const { data: saved } = await admin
      .from('historical_rounds')
      .select('course_rating, slope_rating, diferencial')
      .eq('id', res.roundId!)
      .single()
    // Sin tee confiable: se omite, NO se computa con 72/113.
    expect(saved!.course_rating).toBeNull()
    expect(saved!.slope_rating).toBeNull()
    expect(saved!.diferencial).toBeNull()
  })
})
