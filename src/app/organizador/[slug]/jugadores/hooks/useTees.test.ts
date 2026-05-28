// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const fetchMock = vi.fn()
;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({
              data: [
                { id: 't-azul', nombre: 'Azul', rating: 70.3, slope: 129, yardaje_total: 6573 },
                { id: 't-rojo', nombre: 'Rojo', rating: 69.8, slope: 115, yardaje_total: 5240 },
              ],
              error: null,
            }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { useTees } from './useTees'

beforeEach(() => { fetchMock.mockReset() })

describe('useTees', () => {
  it('carga course_tees al montar', async () => {
    const { result } = renderHook(() => useTees({ slug: 'abc', courseId: 'c1' }))
    await waitFor(() => expect(result.current.courseTees.length).toBe(2))
  })

  it('no carga si courseId es null', async () => {
    const { result } = renderHook(() => useTees({ slug: 'abc', courseId: null }))
    expect(result.current.courseTees.length).toBe(0)
  })

  it('assignTee llama PATCH y actualiza estado loading', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    const { result } = renderHook(() => useTees({ slug: 'abc', courseId: 'c1' }))
    await act(async () => {
      await result.current.assignTee('p1', 't-azul')
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/torneos/abc/players/p1',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('assignTee con fallo setea error 3s + lanza', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'rls' }) })
    const { result } = renderHook(() => useTees({ slug: 'abc', courseId: 'c1' }))
    let thrown: unknown
    await act(async () => {
      try {
        await result.current.assignTee('p1', 't-azul')
      } catch (e) {
        thrown = e
      }
    })
    expect(thrown).toBeDefined()
    expect(result.current.errors.has('p1')).toBe(true)
  })
})
