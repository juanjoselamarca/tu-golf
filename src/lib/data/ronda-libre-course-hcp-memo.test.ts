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
    const a = await courseHandicapsDeRonda(supabase, ronda(), 72, { cacheCourseData: memo })
    const b = await courseHandicapsDeRonda(supabase, ronda(), 72, { cacheCourseData: memo })
    expect(resolverCourseData).toHaveBeenCalledTimes(1)
    expect(b.courseHcpMap).toEqual(a.courseHcpMap)
  })

  it('con memo: cualquier dato distinto que entra a los ratings es otra clave', async () => {
    const memo = new Map<string, Promise<CourseData | null>>()
    await courseHandicapsDeRonda(supabase, ronda(), 72, { cacheCourseData: memo })
    await courseHandicapsDeRonda(supabase, ronda({ holes: 9 }), 72, { cacheCourseData: memo })
    await courseHandicapsDeRonda(supabase, ronda({ recorridos: ['norte'] }), 72, { cacheCourseData: memo })
    await courseHandicapsDeRonda(supabase, ronda(), 70, { cacheCourseData: memo })
    await courseHandicapsDeRonda(supabase, ronda({ ronda_libre_jugadores: [{ id: 'j1', user_id: null, handicap: 10, tees: 'rojo' }] }), 72, { cacheCourseData: memo })
    expect(resolverCourseData).toHaveBeenCalledTimes(5)
  })
})

describe('courseHandicapsDeRonda — índices ya resueltos por el servidor', () => {
  it('con `indicesDePerfil` no consulta profiles con el cliente recibido y usa el índice del perfil', async () => {
    const tablas: string[] = []
    const cliente = { from: (t: string) => { tablas.push(t); throw new Error(`no debía leer ${t}`) } } as unknown as SupabaseClient
    const r = ronda({ course_id: null, ronda_libre_jugadores: [{ id: 'j1', user_id: 'u1', handicap: null, tees: 'azul' }] })
    const out = await courseHandicapsDeRonda(cliente, r, 72, { indicesDePerfil: new Map([['u1', 18]]) })
    expect(tablas).toEqual([])
    expect(out.indexByJugador.j1).toBe(18)
    expect(out.courseHcpMap.j1).toBe(18)
    expect(out.sinIndice.has('j1')).toBe(false)
  })

  it('la tarjeta manda sobre el perfil; sin índice en ninguno → sinIndice', async () => {
    const r = ronda({ course_id: null, ronda_libre_jugadores: [
      { id: 'j1', user_id: 'u1', handicap: 10, tees: 'azul' },
      { id: 'j2', user_id: 'u2', handicap: null, tees: 'azul' },
    ] })
    const out = await courseHandicapsDeRonda(supabase, r, 72, { indicesDePerfil: new Map([['u1', 18]]) })
    expect(out.indexByJugador.j1).toBe(10)
    expect(out.sinIndice.has('j2')).toBe(true)
  })
})
