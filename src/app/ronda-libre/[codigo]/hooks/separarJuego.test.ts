import { describe, expect, it } from 'vitest'
import { separarJuego } from './useTimbaDeLaRonda'

const base = { desactualizado: false, pedidaEn: 1, firma: 'f', publica: false } as const
const vistaSkins = { formato: 'skins', jugadorIds: [], marcas: [], retiros: {}, rondaCerrada: false, config: { puntitos: [] }, tabla: null }
const vistaTimba = { jugadorIds: [], marcas: [], retiros: {}, rondaCerrada: false }

describe('separarJuego: cada vista va a su juego según lo que trae, no según lo que la página cree', () => {
  it('un skins recibe la vista del skins; la Timba queda cargando', () => {
    const r = separarJuego({ estado: 'ok', vista: vistaSkins as never, ...base }, true)
    expect(r.skins.estado).toBe('ok')
    expect(r.timba).toEqual({ estado: 'cargando' })
  })

  it('una vista de Timba nunca se pinta como skins (ni al revés)', () => {
    expect(separarJuego({ estado: 'ok', vista: vistaTimba as never, ...base }, true).skins).toEqual({ estado: 'cargando' })
    expect(separarJuego({ estado: 'ok', vista: vistaSkins as never, ...base }, false).timba).toEqual({ estado: 'cargando' })
  })

  it('error y sin_juego van al juego de la ronda', () => {
    expect(separarJuego({ estado: 'error' }, true).skins).toEqual({ estado: 'error' })
    expect(separarJuego({ estado: 'error' }, false).timba).toEqual({ estado: 'error' })
  })
})
