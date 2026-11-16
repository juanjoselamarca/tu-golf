import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VistaDelJuego } from '@/golf/ronda-libre/juego-de-la-ronda'
import { useTimbaDelScorer } from './useTimbaDelScorer'

const h = vi.hoisted(() => ({
  vista: null as unknown,
  marcas: { marcas: [] as unknown[], enCola: [] as unknown[], rechazadas: [] as unknown[], retirosConfirmados: {} as Record<string, number | null> },
}))
vi.mock('../../hooks/useJuegoDeLaTimba', () => ({
  useJuegoDeLaTimba: () => ({ juego: h.vista ? { estado: 'ok', vista: h.vista, desactualizado: false } : { estado: 'cargando' }, vista: h.vista, recargar: vi.fn() }),
}))
vi.mock('./useMarcasDeLaTimba', () => ({ useMarcasDeLaTimba: () => h.marcas }))

const config = {
  puntitos: [
    { id: 'b', tipo: 'birdie', valor: 1, activo: true },
    { id: 's', tipo: 'sandy', valor: 1, activo: true },
    { id: 'g', tipo: 'greenie', valor: 1, activo: true },
    { id: 'c', tipo: 'chipingo', valor: 1, activo: false },
  ],
}
const vistaBase = {
  config, jugadorIds: ['a', 'b'], retiros: { b: 4 }, marcas: [],
  resultado: { hoyos: [{ numero: 3, especiales: [{ jugadorId: 'a', puntitoId: 's', cuenta: false, razon: 'Hizo más de par' }] }] },
} as unknown as VistaDelJuego

const jugadores = [{ id: 'a', nombre: 'Juan' }, { id: 'b', nombre: 'Diego' }]
const orden = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const montar = (currentHole: number, par: number | undefined, scores: Record<string, Record<number, number>> = { a: { 1: 4, 2: 4, 3: 5 }, b: { 1: 4, 2: 4, 3: 5 } }) =>
  renderHook(() => useTimbaDelScorer({ codigo: 'X', activo: true, conexion: 'ok', jugadores, scores, firma: '', currentHole, ordenHoyos: orden, par })).result.current

beforeEach(() => {
  h.vista = vistaBase
  h.marcas = { marcas: [{ jugadorId: 'a', hoyo: 3, puntitoId: 's' }], enCola: [], rechazadas: [], retirosConfirmados: {} }
})

describe('useTimbaDelScorer', () => {
  it('ofrece los puntos manuales y activos del hoyo, con "no cuenta" del motor', () => {
    const t = montar(3, 4)
    expect(t.puntosDelHoyo.map(g => g.puntito.id)).toEqual(['s'])
    expect(t.puntosDelHoyo[0].jugadores[0]).toMatchObject({ jugadorId: 'a', marcado: true, noCuenta: 'Hizo más de par' })
    expect(t.birdieAutomatico).toBe(true)
  })

  it('el greenie solo aparece en par 3', () => {
    expect(montar(3, 3).puntosDelHoyo.map(g => g.puntito.id)).toEqual(['s', 'g'])
  })

  it('sin par conocido no se ofrece el greenie (no se finge un par 3)', () => {
    expect(montar(3, undefined).puntosDelHoyo.map(g => g.puntito.id)).toEqual(['s'])
  })

  it('retiros: quién está retirado en el hoyo y desde dónde se iría cada uno', () => {
    const t = montar(5, 4)
    expect(t.retiradoEn('b', 4)).toBe(true)
    expect(t.retiradoEn('b', 3)).toBe(false)
    expect([...t.retiradosDelHoyo]).toEqual(['b'])
    expect(t.jugadoresParaRetiro).toEqual([
      { id: 'a', nombre: 'Juan', retiradoDesde: null, desdeSiSeVa: 5, hoyosParaElegir: [1, 2, 3, 4, 5] },
      { id: 'b', nombre: 'Diego', retiradoDesde: 4, desdeSiSeVa: 5, hoyosParaElegir: [1, 2, 3, 4, 5] },
    ])
  })

  it('las rechazadas se nombran con el punto, el jugador y el hoyo', () => {
    h.marcas = { marcas: [], enCola: [], retirosConfirmados: {}, rechazadas: [{ jugadorId: 'b', puntitoId: 's', hoyo: 4, marcar: true }, { jugadorId: 'a', puntitoId: 'g', hoyo: 2, marcar: false }] }
    expect(montar(5, 4).lineasRechazadas).toEqual(['Sandy de Diego en el hoyo 4', 'Quitar: Greenie de Juan en el hoyo 2'])
  })

  it('sin vista (GET /juego falló): el retiro confirmado en el teléfono igual vale', () => {
    h.vista = null
    h.marcas = { ...h.marcas, retirosConfirmados: { a: 2 } }
    const t = montar(3, 4)
    expect(t.retiros).toEqual({ a: 2 })
    expect(t.retiradoEn('a', 3)).toBe(true)
  })

  it('un retiro deshecho en el teléfono pesa sobre la vista vieja', () => {
    h.marcas = { ...h.marcas, retirosConfirmados: { b: null } }
    expect(montar(5, 4).retiradoEn('b', 5)).toBe(false)
  })

  it('sin vista todavía: nada que marcar ni retiros', () => {
    h.vista = null
    const t = montar(3, 3)
    expect(t.puntosDelHoyo).toEqual([])
    expect(t.retiros).toEqual({})
    expect(t.lineasRechazadas).toEqual([])
  })
})
