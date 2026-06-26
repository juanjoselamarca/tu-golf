import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { runShareCascade, useShare } from './useShare'
import type { SharePayload } from '@/golf/share/types'

/**
 * Tests de la cascada ÚNICA de compartir (spec compartir-unificado):
 *   1. imagen + canShare({files}) → share({files})
 *   2. share existe          → share({text, url})
 *   3. wa.me
 *   4. clipboard + (el caller muestra toast)
 * AbortError (usuario canceló) = no-op silencioso, sin fallback ni error.
 */

const basePayload: SharePayload = {
  title: 'Mi ronda — Golfers+',
  text: 'Jugué 82 (+10) en Los Leones',
  url: 'https://golfersplus.vercel.app/tarjeta/abc',
}

function makeImage(): SharePayload {
  return { ...basePayload, image: { blob: new Blob(['x'], { type: 'image/png' }), filename: 'tarjeta.png' } }
}

// Snapshot de los globals que tocamos, para restaurar después.
let origNavigator: PropertyDescriptor | undefined
let origOpen: typeof window.open

beforeEach(() => {
  origNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  origOpen = window.open
})

afterEach(() => {
  if (origNavigator) Object.defineProperty(globalThis, 'navigator', origNavigator)
  window.open = origOpen
  vi.restoreAllMocks()
})

function setNavigator(nav: Partial<Navigator>) {
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })
}

describe('runShareCascade', () => {
  it('1. con imagen y canShare({files}) → comparte archivos', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    setNavigator({ share, canShare } as unknown as Navigator)

    const res = await runShareCascade(makeImage())

    expect(canShare).toHaveBeenCalledWith(expect.objectContaining({ files: expect.any(Array) }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: expect.any(Array), text: basePayload.text }))
    expect(res).toEqual({ ok: true, method: 'files' })
  })

  it('2. con imagen pero canShare({files})=false → cae a share({text,url})', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(false)
    setNavigator({ share, canShare } as unknown as Navigator)

    const res = await runShareCascade(makeImage())

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: basePayload.text, url: basePayload.url }))
    expect(share).not.toHaveBeenCalledWith(expect.objectContaining({ files: expect.anything() }))
    expect(res).toEqual({ ok: true, method: 'webshare' })
  })

  it('3. sin imagen y con navigator.share → share({text,url})', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)

    const res = await runShareCascade(basePayload)

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: basePayload.title, text: basePayload.text, url: basePayload.url }))
    expect(res).toEqual({ ok: true, method: 'webshare' })
  })

  it('4. AbortError (usuario canceló) → no-op silencioso, sin fallback', async () => {
    const abort = Object.assign(new Error('cancelado'), { name: 'AbortError' })
    const share = vi.fn().mockRejectedValue(abort)
    setNavigator({ share } as unknown as Navigator)
    const open = vi.fn()
    window.open = open as unknown as typeof window.open

    const res = await runShareCascade(basePayload)

    expect(res).toEqual({ ok: false, method: 'aborted' })
    expect(open).not.toHaveBeenCalled() // NO cae a wa.me tras cancelar
  })

  it('5. sin navigator.share → abre wa.me con texto+url', async () => {
    setNavigator({} as unknown as Navigator)
    const open = vi.fn().mockReturnValue({} as Window)
    window.open = open as unknown as typeof window.open

    const res = await runShareCascade(basePayload)

    expect(open).toHaveBeenCalledTimes(1)
    const calledUrl = open.mock.calls[0][0] as string
    expect(calledUrl).toContain('https://wa.me/?text=')
    expect(decodeURIComponent(calledUrl)).toContain(basePayload.text)
    expect(decodeURIComponent(calledUrl)).toContain(basePayload.url)
    expect(res).toEqual({ ok: true, method: 'whatsapp' })
  })

  it('6. sin share y wa.me bloqueado (open=null) → copia al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } } as unknown as Navigator)
    const open = vi.fn().mockReturnValue(null) // popup blocker
    window.open = open as unknown as typeof window.open

    const res = await runShareCascade(basePayload)

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain(basePayload.text)
    expect(copied).toContain(basePayload.url)
    expect(res).toEqual({ ok: true, method: 'clipboard' })
  })

  it('share() falla con error NO-Abort → cae a wa.me (degradación honesta)', async () => {
    const share = vi.fn().mockRejectedValue(new Error('network'))
    setNavigator({ share } as unknown as Navigator)
    const open = vi.fn().mockReturnValue({} as Window)
    window.open = open as unknown as typeof window.open

    const res = await runShareCascade(basePayload)

    expect(open).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ ok: true, method: 'whatsapp' })
  })
})

describe('useShare (hook)', () => {
  it('transiciona idle → done en un share exitoso', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)

    const { result } = renderHook(() => useShare())
    expect(result.current.status).toBe('idle')

    await act(async () => {
      await result.current.share(basePayload)
    })
    expect(result.current.status).toBe('done')
    expect(result.current.isSharing).toBe(false)
  })

  it('cancelar (AbortError) vuelve a idle, NO a error', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    setNavigator({ share: vi.fn().mockRejectedValue(abort) } as unknown as Navigator)

    const { result } = renderHook(() => useShare())
    await act(async () => {
      const res = await result.current.share(basePayload)
      expect(res.method).toBe('aborted')
    })
    expect(result.current.status).toBe('idle')
  })

  it('reset vuelve a idle', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)

    const { result } = renderHook(() => useShare())
    await act(async () => { await result.current.share(basePayload) })
    expect(result.current.status).toBe('done')
    act(() => { result.current.reset() })
    expect(result.current.status).toBe('idle')
  })
})
