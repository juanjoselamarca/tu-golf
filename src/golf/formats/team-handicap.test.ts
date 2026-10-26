import { describe, it, expect } from 'vitest'
import {
  porcentajesScramble,
  handicapEquipoScramble,
  handicapEquipoFoursome,
  handicapDeEquipo,
  SCRAMBLE_ASIGNACION_OFICIAL,
  type TeamHandicapConfig,
} from './team-handicap'

// Números verificados a mano (Rules of Handicapping, Apéndice C; WHS 6.2a:
// % sobre el handicap de cancha SIN redondear, un solo redondeo final, .5 sube).

describe('porcentajesScramble', () => {
  it('oficial o sin config → la tabla oficial por tamaño', () => {
    expect(porcentajesScramble(2)).toEqual([35, 15])
    expect(porcentajesScramble(3, { modo: 'oficial' })).toEqual([30, 20, 10])
    expect(porcentajesScramble(4, null)).toEqual(SCRAMBLE_ASIGNACION_OFICIAL[4])
  })
  it('tamaño sin tabla → null', () => {
    expect(porcentajesScramble(1)).toBeNull()
    expect(porcentajesScramble(5)).toBeNull()
  })
  it('personalizado: solo si hay un % por jugador', () => {
    expect(porcentajesScramble(2, { modo: 'personalizado', porcentajes: [50, 50] })).toEqual([50, 50])
    expect(porcentajesScramble(3, { modo: 'personalizado', porcentajes: [50, 50] })).toBeNull()
    expect(porcentajesScramble(2, { modo: 'personalizado', porcentaje_suma: 50 })).toBeNull()
  })
})

describe('handicapEquipoScramble — oficial', () => {
  it('2 jugadores 9,5132 / 11,3938 → 35 %·9,5132 + 15 %·11,3938 = 5,04 → 5', () => {
    expect(handicapEquipoScramble([9.5132, 11.3938])).toBe(5)
  })
  it('el orden de entrada no importa (el menor recibe el 35 %)', () => {
    expect(handicapEquipoScramble([11.3938, 9.5132])).toBe(5)
  })
  it('3 jugadores 5 / 12 / 20 → 30/20/10 = 5,9 → 6 (la tabla vieja 20/15/10 daba 4,8)', () => {
    expect(handicapEquipoScramble([20, 5, 12])).toBe(6)
  })
  it('4 jugadores 0 / 10 / 20 / 30 → 25/20/15/10 = 8', () => {
    expect(handicapEquipoScramble([30, 0, 20, 10])).toBe(8)
  })
  it('.5 exacto sube: 5 / 5 → 2,5 → 3', () => {
    expect(handicapEquipoScramble([5, 5])).toBe(3)
  })
  it('plus es el menor: −2 / 8 → −0,7 + 1,2 = 0,5 → 1', () => {
    expect(handicapEquipoScramble([8, -2])).toBe(1)
  })
  it('dos plus: −4 / −2 → −1,4 − 0,3 = −1,7 → −2', () => {
    expect(handicapEquipoScramble([-2, -4])).toBe(-2)
  })
  it('plus con .5 exacto: −15 / −15 → −5,25 − 2,25 = −7,5 → −7 (redondearHandicapWHS, entero listo para el smallint; Postgres daría −8)', () => {
    const h = handicapEquipoScramble([-15, -15])
    expect(h).toBe(-7)
    expect(Number.isInteger(h)).toBe(true)
  })
  it('un solo redondeo: 8,6 / 8,6 → 4,3 → 4 (redondear antes cada CH daba 9 / 9 → 4,5 → 5)', () => {
    expect(handicapEquipoScramble([8.6, 8.6])).toBe(4)
  })
  it('tamaño sin tabla o vacío → null', () => {
    expect(handicapEquipoScramble([10])).toBeNull()
    expect(handicapEquipoScramble([1, 2, 3, 4, 5])).toBeNull()
    expect(handicapEquipoScramble([])).toBeNull()
    expect(handicapEquipoScramble([Number.NaN, 10])).toBeNull()
  })
})

describe('handicapEquipoScramble — personalizado', () => {
  it('[50, 50] sobre 10 / 20 → 15', () => {
    expect(handicapEquipoScramble([20, 10], { modo: 'personalizado', porcentajes: [50, 50] })).toBe(15)
  })
  it('los % se aplican del menor al mayor: [40, 10] sobre 20 / 10 → 4 + 2 = 6', () => {
    expect(handicapEquipoScramble([20, 10], { modo: 'personalizado', porcentajes: [40, 10] })).toBe(6)
  })
  it('largo distinto a los jugadores → null', () => {
    expect(handicapEquipoScramble([5, 12, 20], { modo: 'personalizado', porcentajes: [35, 15] })).toBeNull()
  })
})

describe('handicapEquipoFoursome', () => {
  it('oficial 9,5132 + 11,3938 = 20,907 → 50 % = 10,45 → 10 (sobre índices 10 + 9 daba 9 o 10 según redondeo)', () => {
    expect(handicapEquipoFoursome([9.5132, 11.3938])).toBe(10)
  })
  it('7 + 8 → 7,5 → 8', () => {
    expect(handicapEquipoFoursome([7, 8], { modo: 'oficial' })).toBe(8)
  })
  it('personalizado 40 % de la suma 30 → 12', () => {
    expect(handicapEquipoFoursome([12, 18], { modo: 'personalizado', porcentaje_suma: 40 })).toBe(12)
  })
  it('plus: −3 + 2 = −1 → −0,5 → 0 (WHS: .5 hacia arriba)', () => {
    expect(handicapEquipoFoursome([-3, 2])).toBe(0)
  })
  it('no son 2 jugadores o personalizado sin porcentaje_suma → null', () => {
    expect(handicapEquipoFoursome([10])).toBeNull()
    expect(handicapEquipoFoursome([10, 12, 14])).toBeNull()
    expect(handicapEquipoFoursome([10, 12], { modo: 'personalizado', porcentajes: [50, 50] })).toBeNull()
  })
  it('un modo desconocido (JSONB raro) → null, igual que scramble; no cae al oficial', () => {
    const raro = { modo: 'raro' } as unknown as TeamHandicapConfig
    expect(handicapEquipoFoursome([10, 12], raro)).toBeNull()
    expect(handicapEquipoScramble([10, 12], raro)).toBeNull()
  })
})

describe('handicapDeEquipo', () => {
  it('despacha por formato; best ball y otros → null', () => {
    expect(handicapDeEquipo('scramble', [5, 12, 20], { modo: 'oficial' })).toBe(6)
    expect(handicapDeEquipo('foursome', [7, 8], undefined)).toBe(8)
    expect(handicapDeEquipo('best_ball', [7, 8], undefined)).toBeNull()
    expect(handicapDeEquipo('stroke_play', [7, 8], undefined)).toBeNull()
    expect(handicapDeEquipo(null, [7, 8], undefined)).toBeNull()
  })
})
