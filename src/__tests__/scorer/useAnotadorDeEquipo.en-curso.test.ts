/**
 * Reclamar y liberar un equipo (revisión Fable PR4, 3ª vuelta): si la relectura lanza, `enCurso` vuelve a null. Si no,
 * la tarjeta quedaba congelada (`tarjetaCongelada`) y el scorer dejaba de aceptar golpes hasta recargar la página.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAnotadorDeEquipo } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useAnotadorDeEquipo'
import { PLAZO_CARGA_SCORER_MS } from '@/lib/data/ronda-libre-scorer'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/ronda/helpers', () => ({ haptic: vi.fn() }))
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))
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

  it('reclamar con la RPC que lanza: también se suelta', async () => {
    reclamar.mockRejectedValue(new Error('red'))
    const { result } = montar()
    await act(async () => { await expect(result.current.reclamar('e2')).rejects.toThrow('red') })
    expect(recargar).not.toHaveBeenCalled()
    expect(result.current.enCurso).toBeNull()
  })
})

describe('useAnotadorDeEquipo: una relectura colgada no congela la tarjeta ni Finalizar', () => {
  const colgada = () => new Promise<void>(() => {})
  const montarColgada = () => renderHook(() => useAnotadorDeEquipo({ codigo: 'ABC', recargar: colgada, recargarTrasDejarEquipo: colgada }))

  it.each([
    ['reclamar', (h: ReturnType<typeof useAnotadorDeEquipo>) => h.reclamar('e2')],
    ['liberar', (h: ReturnType<typeof useAnotadorDeEquipo>) => h.liberar('e2', 'Los Pumas')],
    ['dejar', (h: ReturnType<typeof useAnotadorDeEquipo>) => h.dejar('e2', 'Los Pumas', async () => true)],
  ])('%s: al vencer el plazo, enCurso vuelve a null', async (_n, accion) => {
    vi.useFakeTimers()
    try {
      reclamar.mockResolvedValue({ estado: 'ok' })
      liberar.mockResolvedValue({ estado: 'ok' })
      const { result } = montarColgada()
      let fin: Promise<void> | undefined
      act(() => { fin = accion(result.current) })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(result.current.enCurso).toBe('e2')
      await act(async () => { await vi.advanceTimersByTimeAsync(PLAZO_CARGA_SCORER_MS); await fin })
      expect(result.current.enCurso).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
