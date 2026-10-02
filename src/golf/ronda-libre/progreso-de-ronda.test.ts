import { describe, it, expect } from 'vitest'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import {
  MIN_HOYOS_PARA_FINALIZAR,
  puedeFinalizar,
  hoyosAnotados,
  totalesDeTarjeta,
  rachaParOMejor,
} from './progreso-de-ronda'
import { teeDelJugador, TEE_POR_DEFECTO } from './tee-del-jugador'
import { etiquetaDeModalidad } from './etiqueta-modalidad'

const PAR: Record<number, number> = {
  1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5,
  10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5,
}

describe('puedeFinalizar', () => {
  it('desde el hoyo 9 anotado, o parado en el último', () => {
    expect(MIN_HOYOS_PARA_FINALIZAR).toBe(9)
    expect(puedeFinalizar(8, false)).toBe(false)
    expect(puedeFinalizar(9, false)).toBe(true)
    expect(puedeFinalizar(0, true)).toBe(true)
  })
})

describe('hoyosAnotados', () => {
  it('cuenta sólo los hoyos de la ronda, con claves número o string', () => {
    const back = hoyosDeLaRonda(10, 9)
    expect(hoyosAnotados({ 10: 4, '11': 5, 1: 4, 2: 4 }, back)).toBe(2)
    expect(hoyosAnotados(undefined, back)).toBe(0)
    expect(hoyosAnotados({}, back)).toBe(0)
  })
})

describe('totalesDeTarjeta', () => {
  it('18 hoyos: OUT es 1..9, IN es 10..18, vs par sólo de lo jugado', () => {
    const scores: Record<number, number> = {}
    for (let h = 1; h <= 12; h++) scores[h] = PAR[h] + 1 // bogey en 12 hoyos
    const t = totalesDeTarjeta(scores, hoyosDeLaRonda(1, 18), PAR)
    expect(t.holesPlayed).toBe(12)
    expect(t.vsPar).toBe(12)
    expect(t.out).toBe(36 + 9)
    expect(t.inn).toBe(PAR[10] + PAR[11] + PAR[12] + 3)
    expect(t.gross).toBe(t.out + t.inn)
  })

  it('ronda de 9 desde el 10: todo es IN y los hoyos 1..9 no cuentan', () => {
    const back = hoyosDeLaRonda(10, 9)
    const scores = { 10: 4, 11: 3, 12: 4, 1: 99, 2: 99 }
    const t = totalesDeTarjeta(scores, back, PAR)
    expect(t).toMatchObject({ gross: 11, vsPar: 0, out: 0, inn: 11, holesPlayed: 3 })
  })

  it('un hoyo concedido (-1) no suma golpes', () => {
    const t = totalesDeTarjeta({ 1: 4, 2: -1 }, hoyosDeLaRonda(1, 9), PAR)
    expect(t.gross).toBe(4)
    expect(t.holesPlayed).toBe(1)
  })
})

describe('rachaParOMejor', () => {
  const front = hoyosDeLaRonda(1, 9)
  it('cuenta hacia atrás desde el hoyo recién anotado y se corta en un bogey', () => {
    const scores = { 1: 5, 2: 4, 3: 3, 4: 5 } // bogey, par, par, par
    expect(rachaParOMejor(scores, front, 3, PAR)).toBe(3)
    expect(rachaParOMejor(scores, front, 0, PAR)).toBe(0)
  })
  it('un hoyo sin score corta la racha', () => {
    expect(rachaParOMejor({ 1: 4, 3: 3 }, front, 2, PAR)).toBe(1)
  })
  it('back 9: recorre la lista de la ronda, no 1..N', () => {
    const back = hoyosDeLaRonda(10, 9)
    expect(rachaParOMejor({ 10: 4, 11: 3, 12: 4 }, back, 2, PAR)).toBe(3)
  })
})

describe('teeDelJugador', () => {
  it('propio > ronda > azul, siempre en minúsculas', () => {
    expect(teeDelJugador({ tees: 'Blanco' }, { tees: 'azul' })).toBe('blanco')
    expect(teeDelJugador({ tees: null }, { tees: 'Rojo' })).toBe('rojo')
    expect(teeDelJugador({ tees: '' }, { tees: '' })).toBe(TEE_POR_DEFECTO)
    expect(teeDelJugador(null, undefined)).toBe('azul')
  })
})

describe('etiquetaDeModalidad', () => {
  it('las cuatro etiquetas del header', () => {
    expect(etiquetaDeModalidad('gross', 'stroke_play')).toBe('Stroke Play')
    expect(etiquetaDeModalidad('neto', 'stroke_play')).toBe('Stroke Play Neto')
    expect(etiquetaDeModalidad('neto', 'stableford')).toBe('Stableford')
    expect(etiquetaDeModalidad('neto', 'match_play')).toBe('Match Play Neto')
    expect(etiquetaDeModalidad(undefined, undefined)).toBe('Stroke Play')
  })
})
