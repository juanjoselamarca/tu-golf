// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const getTeeNamesForCourses = vi.fn()
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/data/course-tees', () => ({
  getTeeNamesForCourses: (...args: unknown[]) => getTeeNamesForCourses(...args),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { useCourseTeeNames, courseSetKey } from './useCourseTeeNames'

const polo = { courseId: 'polo', courseName: 'Polo', tees: [{ nombre: 'azul', genero: 'M' }] }

beforeEach(() => getTeeNamesForCourses.mockReset())

describe('courseSetKey', () => {
  it('deduplica, ignora vacíos y conserva el orden', () => {
    expect(courseSetKey(['a', null, 'b', 'a', undefined])).toBe('a,b')
    expect(courseSetKey([null])).toBe('')
  })
})

describe('useCourseTeeNames', () => {
  it('sin cancha no consulta y devuelve no-course', () => {
    const { result } = renderHook(() => useCourseTeeNames([null]))
    expect(result.current).toEqual({ status: 'no-course' })
    expect(getTeeNamesForCourses).not.toHaveBeenCalled()
  })

  it('carga y deja ready con las canchas', async () => {
    getTeeNamesForCourses.mockResolvedValue([polo])
    const { result } = renderHook(() => useCourseTeeNames(['polo', 'polo']))
    expect(result.current).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', courses: [polo] }))
    expect(getTeeNamesForCourses).toHaveBeenCalledWith({}, ['polo'])
  })

  it('si falla queda en error y reintentar vuelve a cargar', async () => {
    getTeeNamesForCourses
      .mockImplementationOnce(async () => {
        throw new Error('red')
      })
      .mockResolvedValueOnce([polo])
    const { result } = renderHook(() => useCourseTeeNames(['polo']))
    await waitFor(() => expect(result.current.status).toBe('error'))
    act(() => {
      if (result.current.status === 'error') result.current.retry()
    })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', courses: [polo] }))
    expect(getTeeNamesForCourses).toHaveBeenCalledTimes(2)
  })

  it('al cambiar de cancha no muestra tees de la anterior mientras carga', async () => {
    getTeeNamesForCourses.mockResolvedValueOnce([polo]).mockReturnValueOnce(new Promise(() => {}))
    const { result, rerender } = renderHook(({ ids }) => useCourseTeeNames(ids), {
      initialProps: { ids: ['polo'] as Array<string | null> },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ ids: ['leones'] })
    expect(result.current).toEqual({ status: 'loading' })
  })
})
