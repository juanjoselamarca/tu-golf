import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { resolveCourse } from '@/lib/resolve-course'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const itIfDb = supabaseUrl && supabaseKey ? it : it.skip

describe('resolveCourse RPC integration', () => {
  if (!supabaseUrl || !supabaseKey) {
    it.skip('skipped: no SUPABASE creds', () => {})
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const TEST_COURSE_NAME = `Test Cancha Integ ${Date.now()}`

  afterAll(async () => {
    const { data: courses } = await supabase
      .from('courses')
      .select('id')
      .eq('nombre', TEST_COURSE_NAME)
    if (courses && courses.length > 0) {
      const ids = courses.map(c => c.id)
      await supabase.from('course_holes').delete().in('course_id', ids)
      await supabase.from('courses').delete().in('id', ids)
    }
  })

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
