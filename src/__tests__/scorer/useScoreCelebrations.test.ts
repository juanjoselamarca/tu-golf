import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useScoreCelebrations, RACHA_MINIMA } from '@/app/ronda-libre/[codigo]/score/hooks/useScoreCelebrations'
import { useMiniRanking } from '@/app/ronda-libre/[codigo]/score/hooks/useMiniRanking'

const haptic = vi.fn()
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: (...a: unknown[]) => haptic(...a) }))
const shouldNotify = vi.fn(() => ({ notify: true, hapticPattern: [1, 2] }))
vi.mock('@/golf/notifications', () => ({ shouldNotify: (...a: unknown[]) => shouldNotify(...(a as [])) }))

beforeEach(() => { vi.useFakeTimers(); haptic.mockClear(); shouldNotify.mockClear() })
afterEach(() => vi.useRealTimers())

const base = { hole: 7, playerName: 'Ana', courseName: 'Los Leones' }

describe('useScoreCelebrations', () => {
  it('hole in one, eagle y birdie según el score vs par; par no celebra', () => {
    const { result } = renderHook(() => useScoreCelebrations())
    act(() => { result.current.celebrarHoyo({ ...base, savedScore: 1, holePar: 3 }) })
    expect(result.current.holeInOneData).toEqual({ playerName: 'Ana', hole: 7 })
    expect(shouldNotify).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'hole_in_one' }))
    act(() => { result.current.celebrarHoyo({ ...base, savedScore: 3, holePar: 5 }) })
    expect(result.current.eagleData).toEqual({ playerName: 'Ana', hole: 7 })
    act(() => { result.current.celebrarHoyo({ ...base, savedScore: 3, holePar: 4 }) })
    expect(result.current.birdieData).toEqual({ playerName: 'Ana', hole: 7 })
    expect(haptic).toHaveBeenCalledTimes(3)
    haptic.mockClear()
    act(() => { result.current.celebrarHoyo({ ...base, savedScore: 4, holePar: 4 }) })
    expect(haptic).not.toHaveBeenCalled()
    act(() => { result.current.cerrarBirdie(); result.current.cerrarEagle(); result.current.cerrarHoleInOne() })
    expect(result.current.birdieData).toBeNull()
    expect(result.current.eagleData).toBeNull()
    expect(result.current.holeInOneData).toBeNull()
  })

  it('shouldNotify decide: si dice no, no hay modal ni vibración', () => {
    shouldNotify.mockReturnValueOnce({ notify: false, hapticPattern: undefined as never })
    const { result } = renderHook(() => useScoreCelebrations())
    act(() => { result.current.celebrarHoyo({ ...base, savedScore: 3, holePar: 4 }) })
    expect(result.current.birdieData).toBeNull()
    expect(haptic).not.toHaveBeenCalled()
  })

  it('racha: desde 3 hoyos, mensaje escalonado, desaparece a los 2.5s', () => {
    const { result } = renderHook(() => useScoreCelebrations())
    act(() => { result.current.mostrarRacha(RACHA_MINIMA - 1) })
    expect(result.current.streakMsg).toBeNull()
    act(() => { result.current.mostrarRacha(3) })
    expect(result.current.streakMsg).toBe('3 hoyos en par o mejor')
    act(() => { result.current.mostrarRacha(9) })
    expect(result.current.streakMsg).toBe('9 seguidos — en la zona')
    act(() => { vi.advanceTimersByTime(2500) })
    expect(result.current.streakMsg).toBeNull()
  })
})

describe('useMiniRanking', () => {
  const PAR = { 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
  const ronda = {
    holes: 9, hoyo_inicio: 10,
    ronda_libre_jugadores: [
      { id: 'a', nombre: 'Ana', user_id: null, scores: {} },
      { id: 'b', nombre: 'Beto', user_id: null, scores: {} },
      { id: 'c', nombre: 'Caro', user_id: null, scores: {} },
    ],
  } as never
  it('ordena por score a par sobre los hoyos de la ronda y deja fuera a quien no anotó', () => {
    const scores = { a: { 10: 5, 11: 4 }, b: { 10: 3, 11: 3, 1: 99 }, c: {} }
    const { result } = renderHook(() => useMiniRanking(ronda, scores, PAR))
    expect(result.current).toEqual([
      { id: 'b', nombre: 'Beto', vsPar: -1, holesPlayed: 2, gross: 6 },
      { id: 'a', nombre: 'Ana', vsPar: 2, holesPlayed: 2, gross: 9 },
    ])
  })
  it('sin ronda: []', () => {
    const { result } = renderHook(() => useMiniRanking(null, {}, PAR))
    expect(result.current).toEqual([])
  })
})
