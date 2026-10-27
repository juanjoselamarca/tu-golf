import { describe, it, expect } from 'vitest'
import { esTarjetaCompletaOMitad, hoyosDeLaRonda } from './hoyos-jugados'

describe('esTarjetaCompletaOMitad', () => {
  it('completa: los 18 de una ronda de 18 o los 9 de una de 9', () => {
    expect(esTarjetaCompletaOMitad(hoyosDeLaRonda(1, 18), 18)).toBe(true)
    expect(esTarjetaCompletaOMitad(hoyosDeLaRonda(1, 9), 9)).toBe(true)
  })

  it('la ida o la vuelta exacta de una ronda de 18', () => {
    expect(esTarjetaCompletaOMitad(hoyosDeLaRonda(1, 9), 18)).toBe(true)
    expect(esTarjetaCompletaOMitad(hoyosDeLaRonda(10, 9), 18)).toBe(true)
  })

  it('a medias, o 9 hoyos que no son una mitad: no', () => {
    expect(esTarjetaCompletaOMitad(hoyosDeLaRonda(1, 12), 18)).toBe(false)
    expect(esTarjetaCompletaOMitad(hoyosDeLaRonda(1, 8), 18)).toBe(false)
    expect(esTarjetaCompletaOMitad([1, 2, 3, 4, 5, 10, 11, 12, 13], 18)).toBe(false)
    expect(esTarjetaCompletaOMitad(hoyosDeLaRonda(1, 5), 9)).toBe(false)
    expect(esTarjetaCompletaOMitad([], 18)).toBe(false)
  })
})
