import { describe, it, expect } from 'vitest'
import { esTarjetaCompletaOMitad, hoyoParaRetomar, hoyosDeLaRonda } from './hoyos-jugados'

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

describe('hoyoParaRetomar', () => {
  it('el primero sin anotar, en orden de juego', () => {
    expect(hoyoParaRetomar([10, 11, 12], h => h === 10)).toBe(11)
  })
  it('con la tarjeta llena, el último de la ronda', () => {
    expect(hoyoParaRetomar([1, 2, 3], () => true)).toBe(3)
    expect(hoyoParaRetomar([10, 11, 1, 2], () => true)).toBe(2)
  })
})
