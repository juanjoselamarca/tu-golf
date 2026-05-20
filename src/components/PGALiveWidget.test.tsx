/**
 * Tests del comportamiento de refresh del widget PGA Live.
 * Bug CX inbox 13b7c749 (19-may-2026): el widget solo refrescaba en mount
 * inicial — al re-entrar a la home o volver al tab, el usuario veía datos
 * stale sin saberlo. Estos tests garantizan que el fix no se regrese.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import PGALiveWidget from './PGALiveWidget'

// usePathname devuelve el pathname actual — necesitamos controlar el valor
// para simular re-navegación a "/".
let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

function mockFetchEmpty() {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ active: false }),
    } as Response)
  )
}

describe('PGALiveWidget — refresh behavior (bug CX 13b7c749)', () => {
  beforeEach(() => {
    mockPathname = '/'
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('hace fetch al montar (caso baseline)', async () => {
    const fetchMock = mockFetchEmpty()
    vi.stubGlobal('fetch', fetchMock)

    await act(async () => {
      render(<PGALiveWidget />)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/pga-live')
  })

  it('re-fetchea cuando el documento vuelve a visible (visibilitychange)', async () => {
    const fetchMock = mockFetchEmpty()
    vi.stubGlobal('fetch', fetchMock)

    await act(async () => {
      render(<PGALiveWidget />)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Simular que el tab se oculta y vuelve.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('NO re-fetchea cuando el documento se oculta (visibilitychange a hidden)', async () => {
    const fetchMock = mockFetchEmpty()
    vi.stubGlobal('fetch', fetchMock)

    await act(async () => {
      render(<PGALiveWidget />)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // El listener filtra hidden — no debe disparar fetch extra.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-fetchea cuando cambia pathname (re-navegación a la home)', async () => {
    const fetchMock = mockFetchEmpty()
    vi.stubGlobal('fetch', fetchMock)

    mockPathname = '/'
    const { rerender } = render(<PGALiveWidget />)
    await act(async () => { await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Simular re-navegación: pathname cambia y el componente se rerenderiza
    // (sobrevive en el cache de App Router).
    mockPathname = '/coach'
    await act(async () => { rerender(<PGALiveWidget />) })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    mockPathname = '/'
    await act(async () => { rerender(<PGALiveWidget />) })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('mantiene el polling cada 30s mientras está montado', async () => {
    const fetchMock = mockFetchEmpty()
    vi.stubGlobal('fetch', fetchMock)

    await act(async () => {
      render(<PGALiveWidget />)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Avanza 30s — debería disparar el polling.
    await act(async () => {
      vi.advanceTimersByTime(30000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      vi.advanceTimersByTime(30000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
