import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SystemStatusBanner } from './SystemStatusBanner'

/**
 * El banner se monta en TODAS las pantallas (layout raíz). En iOS 15 no existe
 * `AbortSignal.timeout`: si el chequeo lo usara, lanzaría dentro del try, cada
 * chequeo contaría como caída y el banner de "problemas técnicos" saldría en falso.
 */
describe('SystemStatusBanner en un navegador sin AbortSignal.timeout (iOS 15)', () => {
  const original = (AbortSignal as unknown as { timeout?: unknown }).timeout
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    delete (AbortSignal as unknown as { timeout?: unknown }).timeout
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })))
  })
  afterEach(() => {
    ;(AbortSignal as unknown as { timeout?: unknown }).timeout = original
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('con /api/health ok no muestra el banner tras varios chequeos', async () => {
    render(<SystemStatusBanner />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000) })
    expect(screen.queryByText(/problemas técnicos/)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
