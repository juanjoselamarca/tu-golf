import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { resolveCourse } from '@/lib/resolve-course'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const itIfDb = supabaseUrl && supabaseKey ? it : it.skip

/** Prefijo de las canchas que crea este test en PROD. Nunca coincide con una cancha real. */
const PREFIJO_FIXTURE = 'Test Cancha Integ '
/** Más viejo que esto = huérfano de un run cancelado (el afterAll no alcanzó a correr). */
const EDAD_HUERFANA_MS = 15 * 60_000

/**
 * Borra canchas fixture de este test. Si el run de CI se cancela (concurrencia
 * push + PR, timeout) el afterAll no corre y la cancha quedaba ACTIVA en prod:
 * visible en el buscador de canchas y rompiendo el canario de catálogo (8
 * huérfanas al 30-sep-2026). Cada run barre las de runs anteriores al empezar.
 * course_holes / course_tees caen por ON DELETE CASCADE.
 */
async function borrarFixtures(supabase: SupabaseClient, filtro: { nombre?: string; anterioresA?: Date }) {
  let q = supabase.from('courses').select('id, nombre').like('nombre', `${PREFIJO_FIXTURE}%`)
  if (filtro.nombre) q = q.eq('nombre', filtro.nombre)
  if (filtro.anterioresA) q = q.lt('created_at', filtro.anterioresA.toISOString())
  const { data, error } = await q
  if (error) throw new Error(`buscar fixtures: ${error.message}`)
  // Sólo nombres exactos del patrón "Test Cancha Integ <timestamp>".
  const ids = (data ?? []).filter(c => /^Test Cancha Integ \d+$/.test(c.nombre)).map(c => c.id)
  if (ids.length === 0) return
  const { error: delErr } = await supabase.from('courses').delete().in('id', ids)
  if (delErr) throw new Error(`borrar fixtures ${ids.join(',')}: ${delErr.message}`)
}

describe('resolveCourse RPC integration', () => {
  if (!supabaseUrl || !supabaseKey) {
    it.skip('skipped: no SUPABASE creds', () => {})
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const TEST_COURSE_NAME = `${PREFIJO_FIXTURE}${Date.now()}`

  beforeAll(async () => {
    await borrarFixtures(supabase, { anterioresA: new Date(Date.now() - EDAD_HUERFANA_MS) })
  }, 60_000)

  afterAll(async () => {
    // Si falla, que el test falle: un fixture que no se pudo borrar es basura en prod.
    await borrarFixtures(supabase, { nombre: TEST_COURSE_NAME })
  }, 60_000)

  itIfDb('matchea Los Leones por nombre similar', async () => {
    const result = await resolveCourse({
      supabase,
      courseName: 'Club De Golf Los Leones',
    })
    expect(result.courseId).not.toBeNull()
    expect(result.matchScore).toBeGreaterThan(0.5)
    expect(result.courseCreated).toBe(false)
  })

  itIfDb('crea curso nuevo cuando no hay match y hay parPerHole', async () => {
    const parPerHole: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) parPerHole[String(i)] = 4

    const result = await resolveCourse({
      supabase,
      courseName: TEST_COURSE_NAME,
      parPerHole,
    })

    expect(result.courseCreated).toBe(true)
    expect(result.courseId).not.toBeNull()
    expect(result.holesPopulated).toBe(true)

    const { data: holes } = await supabase
      .from('course_holes')
      .select('numero, par')
      .eq('course_id', result.courseId)
    expect(holes).toHaveLength(18)
  })

  itIfDb('idempotente: segunda llamada al mismo nombre matchea el creado', async () => {
    const parPerHole: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) parPerHole[String(i)] = 4

    const result = await resolveCourse({
      supabase,
      courseName: TEST_COURSE_NAME,
      parPerHole,
    })

    expect(result.courseCreated).toBe(false)
    expect(result.courseId).not.toBeNull()
  })
})
