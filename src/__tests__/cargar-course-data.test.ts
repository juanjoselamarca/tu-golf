/**
 * Tests para cargarCourseData() en src/golf/core/course-handicap.ts.
 *
 * Esta función carga CourseData (slope + CR + par) desde Supabase para
 * una cancha/tee/holes/recorridos. Tiene varios paths:
 *  1. courseId null → null
 *  2. Multi-recorrido (canchas 27h/36h) → combina children
 *  3. Tee-specific rating con front_* en 9 hoyos
 *  4. Tee-specific rating en 18 hoyos
 *  5. Fallback a tabla courses
 *  6. Sin data en ninguna tabla → null
 *
 * Antes de estos tests: cobertura de course-handicap.ts = 9.52%.
 * Ver docs/audits/2026-04-23-coverage-baseline.md (item P1-débil).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Queue de respuestas mock para cada llamada Supabase en orden.
// cargarCourseData hace entre 1 y 4 queries según el path.
const mockResults: Array<{ data: unknown }> = []

function makeChain(finalResult: { data: unknown }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'ilike', 'in', 'limit', 'order']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.single = vi.fn(() => Promise.resolve(finalResult))
  // maybeSingle: como single pero sin error si no hay rows. Usado en
  // cargarCourseData para no emitir HTTP 406 cuando la cancha no tiene
  // tee 'blanco' (caso real C1 audit 2026-05-04).
  chain.maybeSingle = vi.fn(() => Promise.resolve(finalResult))
  // Supabase builder es thenable cuando NO se llama .single()/.maybeSingle()
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => {
      const next = mockResults.shift() ?? { data: null }
      return makeChain(next)
    }),
  })),
}))

// Import DESPUÉS del mock
import { cargarCourseData } from '@/golf/core/course-handicap'

describe('cargarCourseData', () => {
  beforeEach(() => {
    mockResults.length = 0
  })

  it('courseId null → retorna null sin tocar Supabase', async () => {
    const result = await cargarCourseData(null, 'azul', 18)
    expect(result).toBeNull()
  })

  it('tee-specific rating encontrado (18 hoyos) → usa slope/CR del tee', async () => {
    mockResults.push({
      data: { rating: 71.2, slope: 128, front_course_rating: 35.5, front_slope_rating: 120 },
    })
    const result = await cargarCourseData('course-abc', 'azul', 18, 72)
    expect(result).toEqual({
      slope: 128,
      courseRating: 71.2,
      par: 72,
    })
  })

  it('tee-specific rating en 9 hoyos → usa front_course_rating y front_slope_rating', async () => {
    mockResults.push({
      data: { rating: 71.2, slope: 128, front_course_rating: 35.5, front_slope_rating: 120 },
    })
    const result = await cargarCourseData('course-abc', 'azul', 9, 36)
    expect(result).toEqual({
      slope: 120,
      courseRating: 35.5,
      par: 36,
      is9Hole: true,
    })
  })

  it('tee-specific sin front_* en 9 hoyos → aproxima CR/2 y marca is9Hole (P0 16-jul)', async () => {
    mockResults.push({
      data: { rating: 71.2, slope: 128, front_course_rating: null, front_slope_rating: null },
    })
    // Segunda query (course_holes) para el par de 9h: sin data → cae a 36.
    const result = await cargarCourseData('course-abc', 'azul', 9)
    // Sin ratings de front-9, aprox WHS: slope9≈slope18, CR9=CR18/2, is9Hole=true.
    // Antes devolvía {slope:128, CR:71.2, par:72} SIN is9Hole → resolverCourseHandicap
    // no dividía el índice y el jugador recibía ~2× los golpes (P0-5/#6 Máquina de Verdad).
    expect(result).toEqual({
      slope: 128,
      courseRating: 35.6, // 71.2 / 2
      par: 36,
      is9Hole: true,
    })
  })

  it('tee no encontrado → fallback a tabla courses', async () => {
    // Primera query (course_tees): sin data
    mockResults.push({ data: null })
    // Segunda query (courses): con data
    mockResults.push({
      data: { slope_rating: 130, course_rating: 72.5, par_total: 72 },
    })
    const result = await cargarCourseData('course-abc', 'roja', 18)
    expect(result).toEqual({
      slope: 130,
      courseRating: 72.5,
      par: 72,
    })
  })

  it('tee no encontrado + courses sin data → null', async () => {
    mockResults.push({ data: null })
    mockResults.push({ data: null })
    const result = await cargarCourseData('course-abc', 'azul', 18)
    expect(result).toBeNull()
  })

  it('parTotal override respeta el parámetro en fallback a courses', async () => {
    mockResults.push({ data: null })
    mockResults.push({
      data: { slope_rating: 130, course_rating: 72.5, par_total: 72 },
    })
    const result = await cargarCourseData('course-abc', 'azul', 18, 71) // override par
    expect(result?.par).toBe(71)
  })

  it('courses con slope_rating pero sin course_rating → null', async () => {
    mockResults.push({ data: null })
    mockResults.push({
      data: { slope_rating: 130, course_rating: null, par_total: 72 },
    })
    const result = await cargarCourseData('course-abc', 'azul', 18)
    expect(result).toBeNull()
  })

  it('multi-recorrido con children completos → combina CR sumado + slope promedio', async () => {
    // Query children: 2 loops con datos completos
    mockResults.push({
      data: [
        { id: 'c1', loop_nombre: 'LOOP_A', course_rating: 36.0, slope_rating: 120, par_total: 36 },
        { id: 'c2', loop_nombre: 'LOOP_B', course_rating: 35.5, slope_rating: 124, par_total: 36 },
      ],
    })
    const result = await cargarCourseData('parent-xyz', 'azul', 18, 72, ['LOOP_A', 'LOOP_B'])
    expect(result).toEqual({
      slope: 122, // (120+124)/2 = 122
      courseRating: 71.5, // 36.0 + 35.5
      par: 72,
      is9Hole: false, // 2 loops → 18h
    })
  })

  it('multi-recorrido con 1 loop → is9Hole=true', async () => {
    mockResults.push({
      data: [
        { id: 'c1', loop_nombre: 'LOOP_A', course_rating: 36.0, slope_rating: 120, par_total: 36 },
      ],
    })
    const result = await cargarCourseData('parent-xyz', 'azul', 9, 36, ['LOOP_A'])
    expect(result?.is9Hole).toBe(true)
  })

  it('multi-recorrido con children que no matchean por length → cae a single-course', async () => {
    // Pide 2 loops pero solo devuelve 1 child → no match, cae a single-course
    mockResults.push({ data: [{ id: 'c1', loop_nombre: 'LOOP_A', course_rating: 36, slope_rating: 120, par_total: 36 }] })
    // Luego fallback a tee-specific
    mockResults.push({ data: { rating: 71.2, slope: 128 } })
    const result = await cargarCourseData('parent-xyz', 'azul', 18, 72, ['LOOP_A', 'LOOP_B'])
    expect(result).toEqual({
      slope: 128,
      courseRating: 71.2,
      par: 72,
    })
  })

  it('multi-recorrido con children incompletos → fallback tee-lookup sobre children', async () => {
    // children sin ratings completos
    mockResults.push({
      data: [
        { id: 'c1', loop_nombre: 'LOOP_A', course_rating: null, slope_rating: 120, par_total: 36 },
        { id: 'c2', loop_nombre: 'LOOP_B', course_rating: 35.5, slope_rating: null, par_total: 36 },
      ],
    })
    // tee lookup sobre children IDs
    mockResults.push({
      data: [
        { course_id: 'c1', rating: 36.0, slope: 120, front_course_rating: 36.0, front_slope_rating: 120 },
        { course_id: 'c2', rating: 35.5, slope: 124, front_course_rating: 35.5, front_slope_rating: 124 },
      ],
    })
    const result = await cargarCourseData('parent-xyz', 'azul', 18, 72, ['LOOP_A', 'LOOP_B'])
    expect(result).toEqual({
      slope: 122, // avg de front_slope_rating
      courseRating: 71.5, // suma de front_course_rating
      par: 72,
      is9Hole: false,
    })
  })
})
