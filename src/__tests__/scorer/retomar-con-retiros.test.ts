// QA Timba 17-nov (ronda 8722R3): Tomás se retiró en el 9 y el resto jugó hasta el 18. Al reabrir el scorer (recarga,
// teléfono bloqueado) volvía al hoyo 9, sin ✓ del 9 al 17, y "Finalizar" desde ahí dejaba sin par el 18 de los que no
// tocaron +/− (perdían el hoyo). Los hoyos de un retirado no esperan golpes.
import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { tarjetaAlDiaEnHoyo } from '@/golf/ronda-libre/hoyos-sin-rellenar'
import { useGrupoScoreboard } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreboard'
import { hoyoInicial } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useRondaGrupoData'
import { useRetomarConLosRetiros } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useRetomarConLosRetiros'
import { FORMATO_PERSONALIZADO } from '@/golf/formats/personalizado/config'
import type { HoleData, Jugador } from '@/types/ronda'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

const orden = Array.from({ length: 18 }, (_, i) => i + 1)
const hasta = (n: number) => Object.fromEntries(orden.slice(0, n).map(h => [h, 4]))
// Ana, Beto y Dani anotaron hasta el 17; Carla se retiró en el 9 (anotó hasta el 8).
const scores = { p1: hasta(17), p2: hasta(17), p3: hasta(8), p4: hasta(17) }
const retiros = { p3: 9 }
const ronda = {
  hoyo_inicio: 1, holes: 18, modo_juego: 'gross', formato_juego: FORMATO_PERSONALIZADO,
  ronda_libre_jugadores: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
} as never

describe('tarjetaAlDiaEnHoyo', () => {
  it('anotado, o retirado desde ese hoyo o antes', () => {
    expect(tarjetaAlDiaEnHoyo({ 3: 4 }, 'p3', 3, retiros, orden)).toBe(true)
    expect(tarjetaAlDiaEnHoyo({}, 'p3', 9, retiros, orden)).toBe(true)
    expect(tarjetaAlDiaEnHoyo({}, 'p3', 12, retiros, orden)).toBe(true)
    expect(tarjetaAlDiaEnHoyo({}, 'p3', 8, retiros, orden)).toBe(false)
    expect(tarjetaAlDiaEnHoyo({}, 'p1', 12, retiros, orden)).toBe(false)
    expect(tarjetaAlDiaEnHoyo({ '5': 4 }, 'p1', 5, undefined, orden)).toBe(true)
  })
})

describe('hoyoInicial con retiros', () => {
  it('sin retiros abre en el hoyo del retirado (lo que pasaba); con ellos, en el 18', () => {
    expect(hoyoInicial(ronda, scores)).toBe(9)
    expect(hoyoInicial(ronda, scores, [], retiros)).toBe(18)
  })
})

describe('useGrupoScoreboard: ✓ con un retirado', () => {
  it('los hoyos del 9 al 17 quedan completos aunque el retirado no tenga golpes', () => {
    const holeDataMap: Record<number, HoleData> = Object.fromEntries(orden.map(h => [h, { numero: h, par: 4, stroke_index: h, yardaje: null }]))
    const jugadores = ['p1', 'p2', 'p3', 'p4'].map(id => ({ id, nombre: id, user_id: null, scores: {} })) as unknown as Jugador[]
    const b = renderHook(() => useGrupoScoreboard({
      ronda, jugadores, scores, parMap: Object.fromEntries(orden.map(h => [h, 4])), holeDataMap, playerHcp: {}, equipos: [],
      ordenHoyos: orden, currentHole: 18, isLastHole: true, matchResult: null, retiros,
    })).result.current
    expect(orden.filter(h => b.hoyoCompleto(h))).toEqual(orden.slice(0, 17))
  })
})

describe('useRetomarConLosRetiros', () => {
  type P = { retirosListos: boolean; currentHole: number; listo?: boolean }
  const montar = (props: P) => {
    const setCurrentHole = vi.fn()
    const r = renderHook((p: P) => useRetomarConLosRetiros({
      ronda, listo: p.listo ?? true, scores, equipos: [], retiros: p.retirosListos ? retiros : null, currentHole: p.currentHole, setCurrentHole,
    }), { initialProps: props })
    return { ...r, setCurrentHole }
  }
  it('cuando llegan los retiros y el anotador no tocó nada desde la carga, lo lleva al hoyo que falta', () => {
    const { rerender, setCurrentHole } = montar({ retirosListos: false, currentHole: 9 })
    expect(setCurrentHole).not.toHaveBeenCalled()
    rerender({ retirosListos: true, currentHole: 9 })
    expect(setCurrentHole).toHaveBeenCalledWith(18)
  })
  it('el hoyo de la carga es el de cuando termina de cargar (no el 1 inicial del estado)', () => {
    const { rerender, setCurrentHole } = montar({ retirosListos: false, currentHole: 1, listo: false })
    rerender({ retirosListos: false, currentHole: 9, listo: true })
    rerender({ retirosListos: true, currentHole: 9, listo: true })
    expect(setCurrentHole).toHaveBeenCalledWith(18)
  })
  it('si el anotador fue a otro hoyo y volvió al de la carga, no lo mueve', () => {
    const { rerender, setCurrentHole } = montar({ retirosListos: false, currentHole: 9 })
    rerender({ retirosListos: false, currentHole: 14 })
    rerender({ retirosListos: false, currentHole: 9 })
    rerender({ retirosListos: true, currentHole: 9 })
    expect(setCurrentHole).not.toHaveBeenCalled()
  })
  it('si el anotador anotó o marcó en el hoyo de la carga antes de que llegaran los retiros, no lo mueve', () => {
    const { result, rerender, setCurrentHole } = montar({ retirosListos: false, currentHole: 9 })
    act(() => result.current.marcarInteraccion())
    rerender({ retirosListos: true, currentHole: 9 })
    expect(setCurrentHole).not.toHaveBeenCalled()
  })
  it('si avanzó con "Siguiente" antes de que llegaran los retiros, no lo mueve', () => {
    const { rerender, setCurrentHole } = montar({ retirosListos: false, currentHole: 9 })
    rerender({ retirosListos: false, currentHole: 10 })
    rerender({ retirosListos: true, currentHole: 10 })
    expect(setCurrentHole).not.toHaveBeenCalled()
  })
  it('lo hace una sola vez (un retiro nuevo en la ronda no salta de hoyo)', () => {
    const { rerender, setCurrentHole } = montar({ retirosListos: true, currentHole: 9 })
    expect(setCurrentHole).toHaveBeenCalledTimes(1)
    rerender({ retirosListos: true, currentHole: 9 })
    expect(setCurrentHole).toHaveBeenCalledTimes(1)
  })
})
