import { describe, it, expect } from 'vitest'
import {
  formaDeLaRonda,
  esMultiRecorrido,
  PRIMER_HOYO_DEL_BACK_9,
  type EleccionDeRonda,
} from './forma-de-la-ronda'
import type { CourseLoop } from '@/lib/data/ronda-libre-nueva'

const NORTE: CourseLoop = { recorrido: 'Norte', holes: 9, par: 36 }
const SUR: CourseLoop = { recorrido: 'Sur', holes: 9, par: 36 }
const ESTE: CourseLoop = { recorrido: 'Este', holes: 9, par: 35 }

function eleccion(over: Partial<EleccionDeRonda> = {}): EleccionDeRonda {
  return {
    loops: [],
    loopsElegidos: [],
    hoyosElegidos: 18,
    mitad: 'front',
    shotgun: false,
    hoyoShotgun: 1,
    ...over,
  }
}

describe('esMultiRecorrido', () => {
  it('una cancha con menos de dos recorridos no ofrece elegir', () => {
    expect(esMultiRecorrido([])).toBe(false)
    expect(esMultiRecorrido([NORTE])).toBe(false)
  })

  it('dos o más recorridos sí', () => {
    expect(esMultiRecorrido([NORTE, SUR])).toBe(true)
    expect(esMultiRecorrido([NORTE, SUR, ESTE])).toBe(true)
  })
})

describe('formaDeLaRonda — cancha simple', () => {
  it('ronda completa: 18 hoyos desde el 1', () => {
    expect(formaDeLaRonda(eleccion())).toEqual({
      holes: 18,
      hoyoInicio: 1,
      esMultiRecorrido: false,
    })
  })

  it('front 9 arranca en el hoyo 1', () => {
    const forma = formaDeLaRonda(eleccion({ hoyosElegidos: 9, mitad: 'front' }))
    expect(forma).toEqual({ holes: 9, hoyoInicio: 1, esMultiRecorrido: false })
  })

  it('back 9 arranca en el hoyo 10 — es dato de scoring, no cosmética', () => {
    const forma = formaDeLaRonda(eleccion({ hoyosElegidos: 9, mitad: 'back' }))
    expect(forma).toEqual({
      holes: 9,
      hoyoInicio: PRIMER_HOYO_DEL_BACK_9,
      esMultiRecorrido: false,
    })
  })

  it('el shotgun mueve el arranque de una ronda de 18', () => {
    const forma = formaDeLaRonda(eleccion({ shotgun: true, hoyoShotgun: 7 }))
    expect(forma.hoyoInicio).toBe(7)
  })

  it('sin shotgun el hoyo elegido se ignora', () => {
    const forma = formaDeLaRonda(eleccion({ shotgun: false, hoyoShotgun: 7 }))
    expect(forma.hoyoInicio).toBe(1)
  })

  it('un shotgun colado en media ronda NO pisa el front/back', () => {
    // El front/back ya define el arranque. Si el shotgun ganara, un back 9
    // arrancaría en un hoyo que no pertenece a la mitad que se juega.
    const forma = formaDeLaRonda(
      eleccion({ hoyosElegidos: 9, mitad: 'back', shotgun: true, hoyoShotgun: 4 }),
    )
    expect(forma.hoyoInicio).toBe(PRIMER_HOYO_DEL_BACK_9)
  })
})

describe('formaDeLaRonda — multi-recorrido', () => {
  const loops = [NORTE, SUR, ESTE]

  it('los hoyos salen de la SUMA de los recorridos elegidos, no del botón 18/9', () => {
    const forma = formaDeLaRonda(
      eleccion({ loops, loopsElegidos: ['Norte', 'Sur'], hoyosElegidos: 9 }),
    )
    expect(forma).toEqual({ holes: 18, hoyoInicio: 1, esMultiRecorrido: true })
  })

  it('un recorrido de 18 hoyos aporta sus 18', () => {
    const completo: CourseLoop = { recorrido: 'Championship', holes: 18, par: 72 }
    const forma = formaDeLaRonda(
      eleccion({ loops: [completo, NORTE], loopsElegidos: ['Championship'] }),
    )
    expect(forma.holes).toBe(18)
  })

  it('un recorrido sin cantidad de hoyos cuenta como 9', () => {
    const sinHoyos = { recorrido: 'Mystery', holes: 0, par: 36 } as CourseLoop
    const forma = formaDeLaRonda(
      eleccion({ loops: [sinHoyos, NORTE], loopsElegidos: ['Fantasma'] }),
    )
    expect(forma.holes).toBe(9)
  })

  it('sin recorridos elegidos cae al botón 18/9', () => {
    const forma = formaDeLaRonda(eleccion({ loops, loopsElegidos: [], hoyosElegidos: 18 }))
    expect(forma.holes).toBe(18)
  })

  it('el shotgun también aplica en multi-recorrido', () => {
    const forma = formaDeLaRonda(
      eleccion({ loops, loopsElegidos: ['Norte', 'Sur'], shotgun: true, hoyoShotgun: 12 }),
    )
    expect(forma.hoyoInicio).toBe(12)
  })

  it('el front/back NO aplica en multi-recorrido: los recorridos ya lo definen', () => {
    const forma = formaDeLaRonda(
      eleccion({ loops, loopsElegidos: ['Norte', 'Sur'], mitad: 'back' }),
    )
    expect(forma.hoyoInicio).toBe(1)
  })
})
