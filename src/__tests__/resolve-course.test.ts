import { describe, it, expect, vi } from 'vitest'
import { resolveCourse } from '@/lib/resolve-course'
import type { SupabaseClient } from '@supabase/supabase-js'

function mockSupabase(rpcReturn: unknown) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rpcReturn, error: null }),
  } as unknown as SupabaseClient
}

describe('resolveCourse', () => {
  it('retorna result null cuando courseName es vacio', async () => {
    const supabase = mockSupabase({ course_id: null, course_created: false, holes_populated: false, match_score: null })
    const result = await resolveCourse({ supabase, courseName: '' })
    expect(result.courseId).toBeNull()
    expect(result.courseCreated).toBe(false)
  })

  it('retorna courseId cuando RPC encuentra match', async () => {
    const supabase = mockSupabase({
      course_id: 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26',
      course_created: false,
      holes_populated: false,
      match_score: 0.95,
    })
    const result = await resolveCourse({
      supabase,
      courseName: 'Club De Golf Los Leones',
    })
    expect(result.courseId).toBe('b1b6ba60-18f0-48a8-97c2-ef10e25fbe26')
    expect(result.courseCreated).toBe(false)
    expect(result.matchScore).toBe(0.95)
  })

  it('marca courseCreated=true y emite warning cuando RPC crea curso nuevo', async () => {
    const supabase = mockSupabase({
      course_id: 'new-uuid-here',
      course_created: true,
      holes_populated: true,
      match_score: null,
    })
    const result = await resolveCourse({
      supabase,
      courseName: 'Club Privado Test',
      parPerHole: { '1': 4 },
    })
    expect(result.courseCreated).toBe(true)
    expect(result.holesPopulated).toBe(true)
    expect(result.warnings.some(w => w.includes('Cancha creada'))).toBe(true)
  })

  it('retorna result vacio cuando RPC devuelve error', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection lost' } }),
    } as unknown as SupabaseClient
    const result = await resolveCourse({ supabase, courseName: 'X' })
    expect(result.courseId).toBeNull()
    expect(result.warnings[0]).toContain('connection lost')
  })

  it('pasa similarityThreshold al RPC', async () => {
    const rpcSpy = vi.fn().mockResolvedValue({ data: { course_id: null, course_created: false, holes_populated: false, match_score: null }, error: null })
    const supabase = { rpc: rpcSpy } as unknown as SupabaseClient
    await resolveCourse({ supabase, courseName: 'X', similarityThreshold: 0.9 })
    expect(rpcSpy).toHaveBeenCalledWith('resolve_and_link_course', expect.objectContaining({ p_similarity_threshold: 0.9 }))
  })
})
