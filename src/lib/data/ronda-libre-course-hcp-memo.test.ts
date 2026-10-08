/**
 * `courseHandicapsDeRonda` con memo de ratings compartido (lo usa `/api/en-vivo`,
 * que resuelve muchas rondas de la misma cancha en un request). Sin memo, la
 * conducta es la de siempre: una lectura por tee y por ronda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const resolverCourseData = vi.fn(async (..._a: unknown[]) => ({ slope: 113, courseRating: 72, par: 72 }))
vi.mock('@/golf/core/course-handicap', async (orig) => {
  const real = await orig<typeof import('@/golf/core/course-handicap')>()
  return { ...real, resolverCourseData: (...a: unknown[]) => resolverCourseData(...a) }
})
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

import { courseHandicapsDeRonda } from './ronda-libre'
import type { CourseData } from '@/golf/core/course-handicap'

const supabase = { from: () => ({}) } as unknown as SupabaseClient
const ronda = (over: Record<string, unknown> = {}) => ({
  course_id: 'c1', tees: 'azul', holes: 18, recorridos: null,
  ronda_libre_jugadores: [{ id: 'j1', user_id: null, handicap: 10, tees: 'azul' }],
  ...over,
}) as Parameters<typeof courseHandicapsDeRonda>[1]

beforeEach(() => resolverCourseData.mockClear())

describe('courseHandicapsDeRonda — memo de ratings opcional', () => {
  it('sin memo: cada ronda lee sus ratings (conducta previa)', async () => {
    await courseHandicapsDeRonda(supabase, ronda(), 72)
    await courseHandicapsDeRonda(supabase, ronda(), 72)
    expect(resolverCourseData).toHaveBeenCalledTimes(2)
  })

  it('con memo: misma cancha, tee, hoyos, par y recorridos → una sola lectura y el mismo CH', async () => {
    const memo = new Map<string, Promise<CourseData | null>>()
    const a = await courseHandicapsDeRonda(supabase, ronda(), 72, memo)
    const b = await courseHandicapsDeRonda(supabase, ronda(), 72, memo)
    expect(resolverCourseData).toHaveBeenCalledTimes(1)
    expect(b.courseHcpMap).toEqual(a.courseHcpMap)
  })

  it('con memo: cualquier dato distinto que entra a los ratings es otra clave', async () => {
    const memo = new Map<string, Promise<CourseData | null>>()
    await courseHandicapsDeRonda(supabase, ronda(), 72, memo)
    await courseHandicapsDeRonda(supabase, ronda({ holes: 9 }), 72, memo)
    await courseHandicapsDeRonda(supabase, ronda({ recorridos: ['norte'] }), 72, memo)
    await courseHandicapsDeRonda(supabase, ronda(), 70, memo)
    await courseHandicapsDeRonda(supabase, ronda({ ronda_libre_jugadores: [{ id: 'j1', user_id: null, handicap: 10, tees: 'rojo' }] }), 72, memo)
    expect(resolverCourseData).toHaveBeenCalledTimes(5)
  })
})
