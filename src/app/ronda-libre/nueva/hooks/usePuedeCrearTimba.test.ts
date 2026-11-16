import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePuedeCrearTimba } from './usePuedeCrearTimba'

const responder = (impl: () => Promise<unknown>) => vi.stubGlobal('fetch', vi.fn(impl))

describe('usePuedeCrearTimba', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('admin: true cuando la ruta lo confirma (antes, false)', async () => {
    responder(async () => ({ ok: true, json: async () => ({ puedeCrear: true }) }))
    const { result } = renderHook(() => usePuedeCrearTimba())
    expect(result.current).toBe(false)
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('no admin, error HTTP o sin señal: false', async () => {
    for (const impl of [
      async () => ({ ok: true, json: async () => ({ puedeCrear: false }) }),
      async () => ({ ok: false, json: async () => ({ puedeCrear: true }) }),
      async () => { throw new Error('sin señal') },
    ]) {
      responder(impl)
      const { result } = renderHook(() => usePuedeCrearTimba())
      await new Promise(r => setTimeout(r, 0))
      expect(result.current).toBe(false)
    }
  })
})
