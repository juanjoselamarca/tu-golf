// Tests de `hoyosDeLaTarjeta` / `parDeLaTarjeta`: los hoyos que pintan la
// tarjeta del historial (`/perfil/historial/[id]`) y la pública (`/tarjeta/[id]`).
//
// El caso real que los motiva (prod, 17-oct-2026): una ronda de 9 hoyos jugada
// en el nueve de VUELTA de Los Leones se guardó con `par_per_hole` 1..9 = los
// pares del 10..18. Las dos tarjetas la pintaban con los pares del nueve de IDA
// del catálogo: birdies y bogeys en hoyos que no eran, y un vs-par distinto al
// del historial y al del link de WhatsApp (que ya usaban el par de la ronda).

import { describe, it, expect } from 'vitest'
import { hoyosDeLaTarjeta, parDeLaTarjeta } from './vueltas'

/** C.G. Los Leones (catálogo FedeGolf): par 72. */
const LOS_LEONES = [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 3, 4, 4, 5, 5].map((par, i) => ({
  numero: i + 1,
  par,
  stroke_index: ((i * 7) % 18) + 1,
}))
const NUEVE_DE_VUELTA = { 1: 4, 2: 3, 3: 4, 4: 4, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5 }

/** Río Blanco: cancha de 9, par 35. */
const RIO_BLANCO = [4, 4, 3, 5, 4, 3, 4, 4, 4].map((par, i) => ({ numero: i + 1, par, stroke_index: i + 1 }))

describe('hoyosDeLaTarjeta', () => {
  it('el par de la ronda manda sobre el catálogo (nueve de vuelta guardado como 1..9)', () => {
    const hoyos = hoyosDeLaTarjeta(LOS_LEONES, 9, NUEVE_DE_VUELTA)
    expect(hoyos.map(h => h.par)).toEqual([4, 3, 4, 4, 3, 4, 4, 5, 5])
    expect(parDeLaTarjeta(hoyos)).toBe(36)
  })

  it('una ronda de 9 en una cancha de 18 pinta sólo 9 hoyos (sin fila 10-18 vacía)', () => {
    const hoyos = hoyosDeLaTarjeta(LOS_LEONES, 9)
    expect(hoyos.map(h => h.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(hoyos.map(h => h.par)).toEqual([4, 4, 3, 5, 4, 3, 4, 4, 5])
  })

  it('sin par propio usa el catálogo, con su stroke index', () => {
    const hoyos = hoyosDeLaTarjeta(LOS_LEONES, 18)
    expect(hoyos.map(h => h.par)).toEqual(LOS_LEONES.map(h => h.par))
    expect(hoyos.map(h => h.stroke_index)).toEqual(LOS_LEONES.map(h => h.stroke_index))
    expect(parDeLaTarjeta(hoyos)).toBe(72)
  })

  it('cancha de 9 jugada a 18 sin par propio: repite la vuelta', () => {
    const hoyos = hoyosDeLaTarjeta(RIO_BLANCO, 18)
    expect(hoyos).toHaveLength(18)
    expect(parDeLaTarjeta(hoyos)).toBe(70)
  })

  it('un par propio de otro largo que la ronda no la contamina (mismo criterio que resolveParTotal)', () => {
    const par18 = Object.fromEntries(LOS_LEONES.map(h => [String(h.numero), 3]))
    const hoyos = hoyosDeLaTarjeta(LOS_LEONES, 9, par18)
    expect(hoyos.map(h => h.par)).toEqual([4, 4, 3, 5, 4, 3, 4, 4, 5])
  })

  it('un par propio inválido (con huecos) se ignora', () => {
    const hoyos = hoyosDeLaTarjeta(LOS_LEONES, 9, { 1: 4, 3: 4 })
    expect(parDeLaTarjeta(hoyos)).toBe(36)
  })

  it('sin catálogo (club de 27 con hoyos en los recorridos hijos) el par de la ronda llena la tarjeta', () => {
    const hoyos = hoyosDeLaTarjeta([], 9, [4, 4, 3, 5, 4, 3, 4, 4, 5])
    expect(hoyos.map(h => h.par)).toEqual([4, 4, 3, 5, 4, 3, 4, 4, 5])
    expect(hoyos.map(h => h.stroke_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('sin catálogo ni par propio: celdas vacías, no par 4 inventado', () => {
    const hoyos = hoyosDeLaTarjeta([], 18)
    expect(hoyos).toHaveLength(18)
    expect(hoyos.every(h => h.par === null)).toBe(true)
    expect(parDeLaTarjeta(hoyos)).toBeNull()
  })
})

describe('parDeLaTarjeta', () => {
  it('null si falta el par de algún hoyo o no hay hoyos', () => {
    expect(parDeLaTarjeta([{ par: 4 }, { par: null }])).toBeNull()
    expect(parDeLaTarjeta([])).toBeNull()
  })
})
