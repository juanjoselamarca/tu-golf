import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VistaDelJuego } from '@/golf/ronda-libre/juego-de-la-ronda'
import { INTERVALO_JUEGO_SCORER_S, useTimbaDelScorer } from './useTimbaDelScorer'

const h = vi.hoisted(() => ({
  vista: null as unknown,
  marcas: { marcas: [] as unknown[], enCola: [] as unknown[], rechazadas: [] as unknown[], retirosConfirmados: {} as Record<string, number | null> },
  opcionesJuego: null as unknown,
}))
vi.mock('../../hooks/useJuegoDeLaTimba', () => ({
  useJuegoDeLaTimba: (_codigo: string, opciones: unknown) => (h.opcionesJuego = opciones, { juego: h.vista ? { estado: 'ok', vista: h.vista, desactualizado: false } : { estado: 'cargando' }, vista: h.vista, recargar: vi.fn() }),
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
  it('ofrece los puntos manuales y activos del hoyo; un sobre par anotado se avisa en el teléfono', () => {
    const t = montar(3, 4)
    expect(t.puntosDelHoyo.map(g => g.puntito.id)).toEqual(['s'])
    expect(t.puntosDelHoyo[0].jugadores[0]).toMatchObject({ jugadorId: 'a', marcado: true, noCuenta: 'El sandy cuenta solo con par o mejor' })
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
      { id: 'a', nombre: 'Juan', retiradoDesde: null, desdeSiSeVa: 5, hoyosParaElegir: [1, 2, 3, 4, 5], conGolpesDesde: [1, 2, 3] },
      { id: 'b', nombre: 'Diego', retiradoDesde: 4, desdeSiSeVa: 5, hoyosParaElegir: [1, 2, 3, 4, 5], conGolpesDesde: [1, 2, 3] },
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

  it('pide el juego con el poll lento del scorer (un solo celular) y con la firma que le pasan, sin agregarle nada', () => {
    renderHook(() => useTimbaDelScorer({ codigo: 'X', activo: true, conexion: 'ok', jugadores, scores: {}, firma: '3', currentHole: 1, ordenHoyos: orden, par: 4 }))
    expect(h.opcionesJuego).toEqual({ activo: true, firma: '3', intervaloS: INTERVALO_JUEGO_SCORER_S })
    expect(INTERVALO_JUEGO_SCORER_S).toBeGreaterThanOrEqual(60)
  })

  describe('skins: los mismos botones con la vista del skins', () => {
    const vistaSkins = {
      formato: 'skins',
      config: { puntitos: [{ id: 'sandy', tipo: 'sandy', valor: 1 }, { id: 'greenie', tipo: 'greenie', valor: 1 }, { id: 'p', tipo: 'propio', nombre: 'Árbol', valor: 1 }] },
      jugadorIds: ['a', 'b'], marcas: [], retiros: {}, rondaCerrada: false,
    }

    it('sin `activo` en la config, todos los puntos están en juego; greenie solo en par 3; sin birdie automático', () => {
      h.vista = vistaSkins
      h.marcas = { marcas: [], enCola: [], rechazadas: [], retirosConfirmados: {} }
      expect(montar(3, 4).puntosDelHoyo.map(g => g.puntito.id)).toEqual(['sandy', 'p'])
      const par3 = montar(3, 3)
      expect(par3.puntosDelHoyo.map(g => g.puntito.id)).toEqual(['sandy', 'greenie', 'p'])
      expect(par3.puntosDelHoyo[2].nombre).toBe('Árbol')
      expect(par3.birdieAutomatico).toBe(false)
    })

    it('el «no cuenta» lo juzga el teléfono con la misma regla (sin resultado del motor)', () => {
      h.vista = vistaSkins
      h.marcas = { marcas: [{ jugadorId: 'a', hoyo: 3, puntitoId: 'sandy' }], enCola: [], rechazadas: [], retirosConfirmados: {} }
      const t = montar(3, 4)
      expect(t.puntosDelHoyo[0].jugadores[0]).toMatchObject({ marcado: true, noCuenta: 'El sandy cuenta solo con par o mejor' })
      expect(t.puntosDelHoyo[0].puntito.valor).toBe(1)
    })

    it('el panel «Juego» de la Timba no recibe la vista del skins', () => {
      h.vista = vistaSkins
      expect(montar(3, 4).juego.estado).toBe('error')
    })

    it('una marca rechazada se nombra con el punto del skins', () => {
      h.vista = vistaSkins
      h.marcas = { marcas: [], enCola: [], rechazadas: [{ jugadorId: 'b', puntitoId: 'p', hoyo: 2, marcar: true }], retirosConfirmados: {} }
      expect(montar(3, 4).lineasRechazadas).toEqual(['Árbol de Diego en el hoyo 2'])
    })
  })
})
