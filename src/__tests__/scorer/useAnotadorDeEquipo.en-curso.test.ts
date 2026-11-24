/**
 * Reclamar y liberar un equipo (revisión Fable PR4, 3ª vuelta): si la relectura lanza, `enCurso` vuelve a null. Si no,
 * la tarjeta quedaba congelada (`tarjetaCongelada`) y el scorer dejaba de aceptar golpes hasta recargar la página.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAnotadorDeEquipo } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useAnotadorDeEquipo'

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
