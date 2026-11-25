import { describe, expect, it } from 'vitest'
import {
  capaDeTarjeta, combinarCapasDeTarjeta, hoyosConX, hoyosFueraDesdeLaBase, soloGolpes, tarjetaDelSkins,
} from './fuera-del-hoyo'
import { hoyosQueNoSeRellenan, tarjetaAlDiaEnHoyo } from '@/golf/ronda-libre/hoyos-sin-rellenar'
import { fueraDesdeLaRonda } from '@/lib/data/ronda-libre-scorer'

const N9 = [1, 2, 3, 4, 5, 6, 7, 8, 9]

describe('hoyosFueraDesdeLaBase', () => {
  it('solo los hoyos de la ronda y solo `true`', () => {
    expect(hoyosFueraDesdeLaBase({ '3': true, '12': true, '4': false, '5': 'true' }, N9)).toEqual({ 3: true })
  })
  it('null, array o texto: sin X', () => {
    for (const v of [null, undefined, [], 'x', 3]) expect(hoyosFueraDesdeLaBase(v, N9)).toEqual({})
  })
})

describe('fueraDesdeLaRonda', () => {
  const base = { holes: 9, hoyo_inicio: 1, jugadores_fuera: [{ id: 'p1', fuera_del_hoyo: { '7': true } }] }
  it('skins: lee la X de cada jugador', () => {
    expect(fueraDesdeLaRonda({ ...base, formato_juego: 'skins' } as never)).toEqual({ p1: { 7: true } })
  })
  it('cualquier otro formato: sin X aunque la base trajera algo', () => {
    for (const f of ['stroke_play', 'scramble', 'personalizado', null]) {
      expect(fueraDesdeLaRonda({ ...base, formato_juego: f } as never)).toEqual({})
    }
  })
})

describe('combinarCapasDeTarjeta (rehidratación del scorer)', () => {
  it('X guardada → recarga → sigue X (base) y no aparece como golpes', () => {
    const r = combinarCapasDeTarjeta([capaDeTarjeta({ 1: 4 }, { 2: true }), capaDeTarjeta({ 1: 4 }, { 2: true })])
    expect(r).toEqual({ golpes: { 1: 4 }, fuera: { 2: true } })
  })
  it('X pendiente sin subir le gana a los golpes de la base, y un número pendiente a la X de la base', () => {
    expect(combinarCapasDeTarjeta([capaDeTarjeta({ 3: 5 }, {}), { 3: 'X' }])).toEqual({ golpes: {}, fuera: { 3: true } })
    expect(combinarCapasDeTarjeta([capaDeTarjeta({}, { 3: true }), { 3: 6 }])).toEqual({ golpes: { 3: 6 }, fuera: {} })
  })
  it('fuera del skins es idéntico al `{ ...a, ...b }` de siempre (el -1 de conceder pasa; null no pisa)', () => {
    const a = { 1: 4, 2: -1 }, b = { 1: 5, 3: null }
    expect(combinarCapasDeTarjeta([a, b as never])).toEqual({ golpes: { 1: 5, 2: -1 }, fuera: {} })
  })
  it('soloGolpes descarta la X (tarjeta de equipo)', () => {
    expect(soloGolpes({ 1: 4, 2: 'X' })).toEqual({ 1: 4 })
  })
})

describe('tarjetaDelSkins (base → motor)', () => {
  it('golpes y X de la ronda; -1 y hoyos de fuera de la ronda son «sin anotar»', () => {
    expect(tarjetaDelSkins({ 1: 4, '2': 5, 3: -1, 12: 4 }, { 4: true, 13: true }, N9)).toEqual({ 1: 4, 2: 5, 4: 'X' })
  })
})

describe('X en Siguiente, tablero y Finalizar', () => {
  it('un hoyo con X está al día: Siguiente no lo rellena con par', () => {
    expect(tarjetaAlDiaEnHoyo({}, 'p1', 3, undefined, N9, { 3: true })).toBe(true)
    expect(tarjetaAlDiaEnHoyo({}, 'p1', 3, undefined, N9)).toBe(false)
  })
  it('Finalizar no rellena con par los hoyos con X', () => {
    const r = hoyosQueNoSeRellenan({ matchResult: null, jugadores: [{ id: 'p1' }], jugadorId: 'p1', ordenHoyos: N9, fuera: { p1: { 5: true, 8: true } } })
    expect(r).toEqual([5, 8])
  })
  it('sin X, Finalizar se comporta como siempre (nada que excluir)', () => {
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores: [{ id: 'p1' }], jugadorId: 'p1', ordenHoyos: N9 })).toEqual([])
  })
  it('hoyosConX cuenta solo los de la ronda', () => {
    expect(hoyosConX({ 2: true, 15: true }, N9)).toEqual([2])
  })
})
