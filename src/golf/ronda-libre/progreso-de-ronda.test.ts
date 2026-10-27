import { describe, it, expect } from 'vitest'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import {
  MIN_HOYOS_PARA_FINALIZAR,
  puedeFinalizar,
  hoyosAnotados,
  posicionEnLaRonda,
  posicionDeRondaEnCurso,
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

describe('posicionEnLaRonda', () => {
  const cinco = { 1: 4, 2: 3, 3: 6, 4: 4, 5: 3 }
  it('18 hoyos con 5 anotados → va en el 6, 5 de 18', () => {
    expect(posicionEnLaRonda(cinco, hoyosDeLaRonda(1, 18))).toEqual({ siguienteHoyo: 6, jugados: 5, totalHoyos: 18 })
  })
  it('9 hoyos con 5 anotados → 5 de 9 (no "de 18")', () => {
    expect(posicionEnLaRonda(cinco, hoyosDeLaRonda(1, 9))).toEqual({ siguienteHoyo: 6, jugados: 5, totalHoyos: 9 })
  })
  it('9 desde el 10: dice el número de cancha (el 15), no la posición en la ronda', () => {
    const s = { 10: 4, 11: 5, 12: 4, 13: 3, 14: 5, 1: 4 }
    expect(posicionEnLaRonda(s, hoyosDeLaRonda(10, 9))).toEqual({ siguienteHoyo: 15, jugados: 5, totalHoyos: 9 })
  })
  it('shotgun desde el 5 con 14 anotados: sigue en el 1 (vuelta)', () => {
    const hoyos = hoyosDeLaRonda(5, 18)
    const s = Object.fromEntries(hoyos.slice(0, 14).map((h) => [h, 4]))
    expect(posicionEnLaRonda(s, hoyos).siguienteHoyo).toBe(1)
  })
  it('con un hueco en la tarjeta va al hueco, igual que el scorer', () => {
    expect(posicionEnLaRonda({ 1: 4, 2: 4, 4: 4, 5: 4, 6: 4 }, hoyosDeLaRonda(1, 18)).siguienteHoyo).toBe(3)
  })
  it('sin scores va en el primero; con todo anotado no hay siguiente', () => {
    expect(posicionEnLaRonda({}, hoyosDeLaRonda(10, 9))).toEqual({ siguienteHoyo: 10, jugados: 0, totalHoyos: 9 })
    const nueve = Object.fromEntries(hoyosDeLaRonda(1, 9).map((h) => [h, 4]))
    expect(posicionEnLaRonda(nueve, hoyosDeLaRonda(1, 9))).toEqual({ siguienteHoyo: null, jugados: 9, totalHoyos: 9 })
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
  it('torneo con handicap de juego: el header avisa el % (solo neto individual)', () => {
    expect(etiquetaDeModalidad('neto', 'stroke_play', 85)).toBe('Stroke Play Neto · 85 %')
    expect(etiquetaDeModalidad('neto', 'stableford', 90)).toBe('Stableford · 90 %')
    expect(etiquetaDeModalidad('neto', 'match_play', 75)).toBe('Match Play Neto · 75 %')
    // Al 100 %, en bruto (incluida la vista sin sesión) o en equipos no se juega con %.
    expect(etiquetaDeModalidad('neto', 'stroke_play', 100)).toBe('Stroke Play Neto')
    expect(etiquetaDeModalidad('gross', 'match_play', 85)).toBe('Match Play')
    expect(etiquetaDeModalidad('neto', 'scramble', 85)).toBe('Scramble Neto')
    expect(etiquetaDeModalidad('neto', 'stroke_play', null)).toBe('Stroke Play Neto')
  })
  it('las cuatro etiquetas del header', () => {
    expect(etiquetaDeModalidad('gross', 'stroke_play')).toBe('Stroke Play')
    expect(etiquetaDeModalidad('neto', 'stroke_play')).toBe('Stroke Play Neto')
    expect(etiquetaDeModalidad('neto', 'stableford')).toBe('Stableford')
    expect(etiquetaDeModalidad('neto', 'match_play')).toBe('Match Play Neto')
    // #511: el scorer sin sesión arma el match en bruto; no puede rotularse "Neto".
    expect(etiquetaDeModalidad('gross', 'match_play')).toBe('Match Play')
    expect(etiquetaDeModalidad(undefined, undefined)).toBe('Stroke Play')
  })
  it('#602: los formatos por equipo dicen su nombre, no "Stroke Play"', () => {
    expect(etiquetaDeModalidad('neto', 'scramble')).toBe('Scramble Neto')
    expect(etiquetaDeModalidad('gross', 'scramble')).toBe('Scramble')
    expect(etiquetaDeModalidad('neto', 'foursome')).toBe('Foursome Neto')
    expect(etiquetaDeModalidad('gross', 'best_ball')).toBe('Best Ball')
    expect(etiquetaDeModalidad('neto', 'best_ball')).toBe('Best Ball Neto')
  })
})

describe('posicionDeRondaEnCurso', () => {
  const ronda = (formato_juego: string | null, hoyo_inicio = 1, holes = 9) => ({ formato_juego, hoyo_inicio, holes })
  it('stroke play individual: dice dónde va', () => {
    expect(posicionDeRondaEnCurso(ronda('stroke_play', 10), { 10: 4 })).toEqual({ siguienteHoyo: 11, jugados: 1, totalHoyos: 9 })
  })
  it.each(['scramble', 'foursome'])('%s: los golpes son del equipo → no afirma hoyo', (f) => {
    expect(posicionDeRondaEnCurso(ronda(f), {})).toBeNull()
  })
  it('sin scores legibles (error o no juega la ronda) → null', () => {
    expect(posicionDeRondaEnCurso(ronda('stroke_play'), null)).toBeNull()
  })
})
