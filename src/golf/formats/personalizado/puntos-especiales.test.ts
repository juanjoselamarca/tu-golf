import { describe, it, expect } from 'vitest'
import { PUNTITOS_CON_PAR_O_MEJOR, esUnoPorHoyo, porQueNoCuenta, seJuegaEnElHoyo, sePuedeOfrecer } from './puntos-especiales'

describe('seJuegaEnElHoyo', () => {
  it('el greenie solo en un par 3 conocido; el resto en cualquier hoyo', () => {
    expect(seJuegaEnElHoyo('greenie', 3)).toBe(true)
    expect(seJuegaEnElHoyo('greenie', 4)).toBe(false)
    expect(seJuegaEnElHoyo('greenie', undefined)).toBe(false)
    expect(seJuegaEnElHoyo('sandy', 5)).toBe(true)
    expect(seJuegaEnElHoyo('chipingo', null)).toBe(true)
  })
})

describe('porQueNoCuenta — la regla que aplica el motor', () => {
  it('sin golpes en el hoyo: no jugó (vale para todos los puntos)', () => {
    expect(porQueNoCuenta('chipingo', undefined, 4)).toEqual({ motivo: 'no_jugo', razon: 'No jugó el hoyo' })
    expect(porQueNoCuenta('sandy', null, 4)?.motivo).toBe('no_jugo')
  })
  it('greenie fuera de un par 3', () => {
    expect(porQueNoCuenta('greenie', 3, 4)).toEqual({ motivo: 'no_se_juega_en_el_hoyo', razon: 'El greenie es solo en par 3' })
  })
  it('sandy y greenie: bogey no cuenta; par y birdie sí', () => {
    expect(porQueNoCuenta('sandy', 5, 4)).toEqual({ motivo: 'sobre_par', razon: 'El sandy cuenta solo con par o mejor' })
    expect(porQueNoCuenta('greenie', 4, 3)).toEqual({ motivo: 'sobre_par', razon: 'El greenie cuenta solo con par o mejor' })
    expect(porQueNoCuenta('sandy', 4, 4)).toBeNull()
    expect(porQueNoCuenta('sandy', 3, 4)).toBeNull()
    expect(porQueNoCuenta('greenie', 2, 3)).toBeNull()
  })
  it('chipingo y propios no dependen del score', () => {
    expect(porQueNoCuenta('chipingo', 9, 4)).toBeNull()
    expect(porQueNoCuenta('propio', 9, 4)).toBeNull()
  })
  it('solo sandy y greenie exigen par o mejor', () => {
    expect([...PUNTITOS_CON_PAR_O_MEJOR].sort()).toEqual(['greenie', 'sandy'])
  })
})

describe('sePuedeOfrecer — qué botón tiene sentido mostrar en la cancha', () => {
  it('sandy: sin score se ofrece (el par se rellena al pasar de hoyo); con score, solo par o mejor', () => {
    expect(sePuedeOfrecer('sandy', undefined, 4)).toBe(true)
    expect(sePuedeOfrecer('sandy', 5, 4)).toBe(false)
    expect(sePuedeOfrecer('sandy', 4, 4)).toBe(true)
    expect(sePuedeOfrecer('sandy', 3, 4)).toBe(true)
  })
  it('greenie: solo en par 3; sin score se ofrece, con score solo par o mejor', () => {
    expect(sePuedeOfrecer('greenie', 3, 4)).toBe(false)
    expect(sePuedeOfrecer('greenie', 3, 3)).toBe(true)
    expect(sePuedeOfrecer('greenie', 4, 3)).toBe(false)
    expect(sePuedeOfrecer('greenie', undefined, 3)).toBe(true)
    expect(sePuedeOfrecer('greenie', undefined, 4)).toBe(false)
  })
  it('chipingo y propios: a todos, aunque todavía no se anote el score', () => {
    expect(sePuedeOfrecer('chipingo', undefined, 4)).toBe(true)
    expect(sePuedeOfrecer('propio', 8, 4)).toBe(true)
  })
  it('par desconocido: el sandy se ofrece con score anotado (el motor juzga con el par de la cancha)', () => {
    expect(sePuedeOfrecer('sandy', 5, undefined)).toBe(true)
    expect(sePuedeOfrecer('sandy', undefined, undefined)).toBe(true)
    expect(sePuedeOfrecer('greenie', 2, undefined)).toBe(false)
  })
  it('solo el greenie es uno por hoyo', () => {
    expect(esUnoPorHoyo('greenie')).toBe(true)
    expect(esUnoPorHoyo('sandy')).toBe(false)
  })
})
