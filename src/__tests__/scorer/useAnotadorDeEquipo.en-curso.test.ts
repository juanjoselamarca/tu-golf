/**
 * Reclamar y liberar un equipo (revisión Fable PR4, 3ª vuelta): si la relectura lanza, `enCurso` vuelve a null. Si no,
 * la tarjeta quedaba congelada (`tarjetaCongelada`) y el scorer dejaba de aceptar golpes hasta recargar la página.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAnotadorDeEquipo } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useAnotadorDeEquipo'
import { PLAZO_CARGA_SCORER_MS } from '@/lib/data/ronda-libre-scorer'
import { MENSAJE_EQUIPOS_TARDAN } from '@/lib/data/ronda-libre-anotador'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/ronda/helpers', () => ({ haptic: vi.fn() }))
const addToast = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/useToast', () => ({ addToast }))
const liberar = vi.hoisted(() => vi.fn())
const reclamar = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/ronda-libre-anotador', async (orig) => ({
  ...(await orig<typeof import('@/lib/data/ronda-libre-anotador')>()),
  liberarEquipoDeRonda: liberar,
  reclamarEquipoDeRonda: reclamar,
}))

const recargar = vi.fn(async () => { throw new Error('sin señal') })
const montar = () => renderHook(() => useAnotadorDeEquipo({ codigo: 'ABC', recargar, recargarTrasDejarEquipo: vi.fn(async () => {}) }))

beforeEach(() => { vi.clearAllMocks() })

describe('useAnotadorDeEquipo: enCurso vuelve a null aunque la relectura lance', () => {
  it('reclamar', async () => {
    reclamar.mockResolvedValue({ estado: 'ok' })
    const { result } = montar()
    await act(async () => { await expect(result.current.reclamar('e2')).rejects.toThrow('sin señal') })
    expect(recargar).toHaveBeenCalledTimes(1)
    expect(result.current.enCurso).toBeNull()
  })

  it('liberar', async () => {
    liberar.mockResolvedValue({ estado: 'ok' })
    const { result } = montar()
    await act(async () => { await expect(result.current.liberar('e2', 'Los Pumas')).rejects.toThrow('sin señal') })
    expect(recargar).toHaveBeenCalledTimes(1)
    expect(result.current.enCurso).toBeNull()
  })

  it('una relectura que falla (no que tarda) no avisa que la lista tarda', async () => {
    reclamar.mockResolvedValue({ estado: 'ok' })
    const { result } = montar()
    await act(async () => { await expect(result.current.reclamar('e2')).rejects.toThrow('sin señal') })
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: MENSAJE_EQUIPOS_TARDAN }))
  })

  it.each([
    ['liberar con error', () => liberar.mockResolvedValue({ estado: 'error', mensaje: 'No se pudo liberar.' }),
      (h: ReturnType<typeof useAnotadorDeEquipo>) => h.liberar('e2', 'Los Pumas')],
    ['reclamar tomado', () => reclamar.mockResolvedValue({ estado: 'tomado', mensaje: 'Lo anota Pedro.' }),
      (h: ReturnType<typeof useAnotadorDeEquipo>) => h.reclamar('e2')],
  ])('%s y la relectura tarda: solo el mensaje del error, sin el aviso de demora encima', async (_n, preparar, accion) => {
    vi.useFakeTimers()
    try {
      preparar()
      const colgada = () => new Promise<void>(() => {})
      const { result } = renderHook(() => useAnotadorDeEquipo({ codigo: 'ABC', recargar: colgada, recargarTrasDejarEquipo: colgada }))
      let fin: Promise<void> | undefined
      act(() => { fin = accion(result.current) })
      await act(async () => { await vi.advanceTimersByTimeAsync(PLAZO_CARGA_SCORER_MS); await fin })
      expect(result.current.enCurso).toBeNull()
      expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: MENSAJE_EQUIPOS_TARDAN }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('reclamar con la RPC que lanza: también se suelta', async () => {
    reclamar.mockRejectedValue(new Error('red'))
    const { result } = montar()
    await act(async () => { await expect(result.current.reclamar('e2')).rejects.toThrow('red') })
    expect(recargar).not.toHaveBeenCalled()
    expect(result.current.enCurso).toBeNull()
  })
})

describe('useAnotadorDeEquipo: relectura a tiempo, sin aviso de demora', () => {
  it.each([
    ['reclamar', (h: ReturnType<typeof useAnotadorDeEquipo>) => h.reclamar('e2')],
    ['liberar', (h: ReturnType<typeof useAnotadorDeEquipo>) => h.liberar('e2', 'Los Pumas')],
    ['dejar', (h: ReturnType<typeof useAnotadorDeEquipo>) => h.dejar('e2', 'Los Pumas', async () => true)],
  ])('%s', async (_n, accion) => {
    reclamar.mockResolvedValue({ estado: 'ok' })
    liberar.mockResolvedValue({ estado: 'ok' })
    const ok = vi.fn(async () => {})
    const { result } = renderHook(() => useAnotadorDeEquipo({ codigo: 'ABC', recargar: ok, recargarTrasDejarEquipo: ok }))
    await act(async () => { await accion(result.current) })
    expect(ok).toHaveBeenCalledTimes(1)
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: MENSAJE_EQUIPOS_TARDAN }))
  })
})

describe('useAnotadorDeEquipo: una relectura colgada no congela la tarjeta ni Finalizar', () => {
  const colgada = () => new Promise<void>(() => {})
  const montarColgada = () => renderHook(() => useAnotadorDeEquipo({ codigo: 'ABC', recargar: colgada, recargarTrasDejarEquipo: colgada }))

  it.each([
    ['reclamar', (h: ReturnType<typeof useAnotadorDeEquipo>) => h.reclamar('e2')],
    ['liberar', (h: ReturnType<typeof useAnotadorDeEquipo>) => h.liberar('e2', 'Los Pumas')],
    ['dejar', (h: ReturnType<typeof useAnotadorDeEquipo>) => h.dejar('e2', 'Los Pumas', async () => true)],
  ])('%s: al vencer el plazo, enCurso vuelve a null y avisa que la lista tarda', async (_n, accion) => {
    vi.useFakeTimers()
    try {
      reclamar.mockResolvedValue({ estado: 'ok' })
      liberar.mockResolvedValue({ estado: 'ok' })
      const { result } = montarColgada()
      let fin: Promise<void> | undefined
      act(() => { fin = accion(result.current) })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(result.current.enCurso).toBe('e2')
      expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: MENSAJE_EQUIPOS_TARDAN }))
      await act(async () => { await vi.advanceTimersByTimeAsync(PLAZO_CARGA_SCORER_MS); await fin })
      expect(result.current.enCurso).toBeNull()
      // La lectura sigue en segundo plano: se avisa, una vez, que la lista se pone al día sola.
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info', title: MENSAJE_EQUIPOS_TARDAN }))
      expect(addToast.mock.calls.filter(([t]) => t.title === MENSAJE_EQUIPOS_TARDAN)).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
