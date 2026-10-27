// Handicap de equipo de una ronda libre nueva: % oficial sobre el course
// handicap SIN redondear de cada jugador (con su tee), un solo redondeo WHS.
// Los números se verifican a mano con la fórmula WHS 6.1:
//   CH = índice × slope / 113 + (CR − par)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CourseData } from '@/golf/core/course-handicap'

const resolverCourseData = vi.fn()
const fetchHoyosDeLaRonda = vi.fn()

vi.mock('@/golf/core/course-handicap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/golf/core/course-handicap')>()),
  resolverCourseData: (...args: unknown[]) => resolverCourseData(...args),
}))
vi.mock('./course-holes', () => ({
  fetchHoyosDeLaRonda: (...args: unknown[]) => fetchHoyosDeLaRonda(...args),
}))

import { handicapsDeEquipoDeRondaNueva } from './ronda-libre-equipos'

const supabase = {} as SupabaseClient
/** 18 hoyos par 4 → par 72 (9 hoyos → 36). */
const catalogo18 = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1, recorrido: null }))

beforeEach(() => {
  resolverCourseData.mockReset()
  fetchHoyosDeLaRonda.mockReset()
  fetchHoyosDeLaRonda.mockResolvedValue(catalogo18)
})

describe('handicapsDeEquipoDeRondaNueva', () => {
  it('scramble 18 hoyos con tees distintos: cada jugador con su tee (35 % × 9,5132 + 15 % × 11,3938 → 5)', async () => {
    // azul: slope 125, CR 72 → índice 8,6 → 8,6 × 125/113 = 9,5132
    // rojo: slope 113, CR 73 → índice 10,3938 → 10,3938 + 1 = 11,3938
    resolverCourseData.mockImplementation(async (_s: unknown, _c: string, tee: string): Promise<CourseData> =>
      tee === 'azul' ? { slope: 125, courseRating: 72, par: 72 } : { slope: 113, courseRating: 73, par: 72 })
    const [h] = await handicapsDeEquipoDeRondaNueva(
      supabase,
      { formato: 'scramble', courseId: 'c1', holes: 18, recorridos: null },
      [[{ indice: 8.6, tee: 'azul' }, { indice: 10.3938, tee: 'rojo' }]],
    )
    // 0,35 × 9,5132 + 0,15 × 11,3938 = 3,3296 + 1,7091 = 5,0387 → 5
    expect(h).toEqual({ completo: 5, juego: 5 })
    // Un tee, una lectura (cache por tee y escala), con el par de la ronda.
    expect(resolverCourseData).toHaveBeenCalledTimes(2)
    expect(resolverCourseData).toHaveBeenCalledWith(supabase, 'c1', 'azul', 18, 72, null)
  })

  it('foursome: 50 % de la suma sin redondear (9,5132 + 11,3938 = 20,907 → 10,45 → 10)', async () => {
    resolverCourseData.mockImplementation(async (_s: unknown, _c: string, tee: string): Promise<CourseData> =>
      tee === 'azul' ? { slope: 125, courseRating: 72, par: 72 } : { slope: 113, courseRating: 73, par: 72 })
    const [h] = await handicapsDeEquipoDeRondaNueva(
      supabase,
      { formato: 'foursome', courseId: 'c1', holes: 18, recorridos: null },
      [[{ indice: 8.6, tee: 'azul' }, { indice: 10.3938, tee: 'rojo' }]],
    )
    expect(h).toEqual({ completo: 10, juego: 10 })
  })

  it('9 hoyos: el de juego usa los ratings de 9 y el completo los de 18', async () => {
    // 18 hoyos: slope 113, CR 72 → CH = índice. 9 hoyos: slope 113, CR 36 → CH = índice / 2.
    resolverCourseData.mockImplementation(async (_s: unknown, _c: string, _t: string, hoyos: number): Promise<CourseData> =>
      hoyos === 9 ? { slope: 113, courseRating: 36, par: 36, is9Hole: true } : { slope: 113, courseRating: 72, par: 72 })
    const [h] = await handicapsDeEquipoDeRondaNueva(
      supabase,
      { formato: 'scramble', courseId: 'c1', holes: 9, recorridos: null },
      [[{ indice: 10, tee: 'azul' }, { indice: 20, tee: 'azul' }]],
    )
    // completo: 0,35 × 10 + 0,15 × 20 = 6,5 → 7 · juego: 0,35 × 5 + 0,15 × 10 = 3,25 → 3
    expect(h).toEqual({ completo: 7, juego: 3 })
    // Mismo par que le pasa el scorer (`parYSiDeLaRonda`: el catálogo entero, 72);
    // `resolverCourseData` lo lleva a la escala de la vuelta.
    expect(resolverCourseData).toHaveBeenCalledWith(supabase, 'c1', 'azul', 9, 72, null)
    expect(resolverCourseData).toHaveBeenCalledWith(supabase, 'c1', 'azul', 18, 72, null)
  })

  it('sin cancha: el course handicap es el índice (la mitad en 9 hoyos), sin consultas', async () => {
    const [h] = await handicapsDeEquipoDeRondaNueva(
      supabase,
      { formato: 'scramble', courseId: null, holes: 9, recorridos: null },
      [[{ indice: 10, tee: 'azul' }, { indice: 20, tee: 'azul' }]],
    )
    expect(h).toEqual({ completo: 7, juego: 3 })
    expect(fetchHoyosDeLaRonda).not.toHaveBeenCalled()
    expect(resolverCourseData).not.toHaveBeenCalled()
  })

  it('jugador sin índice declarado: juega con índice 0 (misma regla que el scorer)', async () => {
    resolverCourseData.mockResolvedValue({ slope: 113, courseRating: 72, par: 72 })
    const [h] = await handicapsDeEquipoDeRondaNueva(
      supabase,
      { formato: 'scramble', courseId: 'c1', holes: 18, recorridos: null },
      [[{ indice: null, tee: 'azul' }, { indice: 20, tee: 'azul' }]],
    )
    // 0,35 × 0 + 0,15 × 20 = 3
    expect(h).toEqual({ completo: 3, juego: 3 })
  })

  it('varios equipos: uno por fila, en orden', async () => {
    resolverCourseData.mockResolvedValue({ slope: 113, courseRating: 72, par: 72 })
    const res = await handicapsDeEquipoDeRondaNueva(
      supabase,
      { formato: 'scramble', courseId: 'c1', holes: 18, recorridos: ['Norte'] },
      [
        [{ indice: 5, tee: 'azul' }, { indice: 12, tee: 'azul' }, { indice: 20, tee: 'azul' }],
        [{ indice: 0, tee: 'azul' }, { indice: 10, tee: 'azul' }, { indice: 20, tee: 'azul' }, { indice: 30, tee: 'azul' }],
      ],
    )
    // 30/20/10: 1,5 + 2,4 + 2 = 5,9 → 6 · 25/20/15/10: 0 + 2 + 3 + 3 = 8
    expect(res).toEqual([{ completo: 6, juego: 6 }, { completo: 8, juego: 8 }])
    expect(fetchHoyosDeLaRonda).toHaveBeenCalledWith(supabase, 'c1', ['Norte'], 'numero, par, stroke_index, recorrido')
  })

  it('best ball: ambos null y no consulta nada', async () => {
    const res = await handicapsDeEquipoDeRondaNueva(
      supabase,
      { formato: 'best_ball', courseId: 'c1', holes: 18, recorridos: null },
      [[{ indice: 10, tee: 'azul' }, { indice: 20, tee: 'azul' }]],
    )
    expect(res).toEqual([{ completo: null, juego: null }])
    expect(fetchHoyosDeLaRonda).not.toHaveBeenCalled()
  })
})
