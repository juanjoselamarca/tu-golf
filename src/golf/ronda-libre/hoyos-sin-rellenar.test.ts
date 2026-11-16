import { describe, expect, it } from 'vitest'
import { hoyosQueNoSeRellenan, hoyosQueQuedanSinJugarEnLaTimba } from './hoyos-sin-rellenar'
import { armarTarjetaHistorica, completarHoyosSinMarcarConPar } from './tarjeta-historica'
import { diferencialDeTarjeta } from '@/lib/indice-golfers'

const orden = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const jugadores = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('hoyosQueNoSeRellenan', () => {
  it('sin match ni retiro: ninguno', () => {
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', ordenHoyos: orden })).toEqual([])
  })

  it('retirado: los hoyos desde el retiro en orden de juego (salida por el 10)', () => {
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'b', retiros: { b: 7 }, ordenHoyos: orden })).toEqual([7, 8, 9])
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'b', retiros: { b: 18 }, ordenHoyos: orden }))
      .toEqual([18, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('fuera de una Timba el hoyo en pantalla sin anotar se sigue rellenando (bug 30-abr): no se excluye ninguno', () => {
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', scores: {}, ordenHoyos: orden, hoyoEnPantalla: 10 })).toEqual([])
  })

  it('el retiro de otro no toca a este jugador', () => {
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', retiros: { b: 7 }, ordenHoyos: orden })).toEqual([])
  })

  describe('Timba libre: al cerrar, un hoyo sin score es "no jugó" (regla de Juanjo, 26-oct)', () => {
    const nueve = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    // Alguien ya anotó el 9 (el hoyo en pantalla): ese hoyo se jugó y el par gris de los demás se rellena.
    const conElNueve = { b: { 9: 5 } }
    it('no rellena ningún hoyo salvo el que está en pantalla, si alguien ya lo anotó', () => {
      expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', scores: conElNueve, ordenHoyos: nueve, esTimba: true, hoyoEnPantalla: 9 }))
        .toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })
    it('el hoyo en pantalla que nadie anotó no se rellena: cuenta como no jugado (jugaron 9 y "Siguiente" dejó el 10)', () => {
      const dieciocho = Array.from({ length: 18 }, (_, i) => i + 1)
      const nueveAnotados = Object.fromEntries(nueve.map(h => [h, 4]))
      const scores = { a: nueveAnotados, b: nueveAnotados, c: nueveAnotados }
      expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', scores, ordenHoyos: dieciocho, esTimba: true, hoyoEnPantalla: 10 }))
        .toEqual(dieciocho)
      expect(hoyosQueQuedanSinJugarEnLaTimba({ jugadores, scores, ordenHoyos: dieciocho, hoyoEnPantalla: 10 }))
        .toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
    })
    it('el score de un retirado en el hoyo en pantalla no lo vuelve jugado', () => {
      expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', scores: { c: { 9: 5 } }, retiros: { c: 9 }, ordenHoyos: nueve, esTimba: true, hoyoEnPantalla: 9 }))
        .toEqual(nueve)
    })
    it('el hoyo en pantalla tampoco se rellena si el jugador se retiró antes', () => {
      expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'b', scores: { a: { 9: 4 } }, retiros: { b: 7 }, ordenHoyos: nueve, esTimba: true, hoyoEnPantalla: 9 }))
        .toEqual(nueve)
    })
    it('sin hoyo en pantalla de la ronda no inventa ninguno', () => {
      expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', ordenHoyos: nueve, esTimba: true })).toEqual(nueve)
    })
    it('el cierre rellena solo el par gris del hoyo en pantalla (bug 30-abr) y deja vacíos los otros', () => {
      const noRellenar = hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', scores: conElNueve, ordenHoyos: nueve, esTimba: true, hoyoEnPantalla: 9 })
      const par = Object.fromEntries(nueve.map(h => [h, 4]))
      const { scores } = completarHoyosSinMarcarConPar({ 1: 5, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 }, nueve, par, noRellenar)
      expect(scores).toEqual({ 1: 5, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 9: 4 })
    })
    it('hoyos que quedan sin jugar: los que alguien no retirado no anotó, fuera del hoyo en pantalla', () => {
      const scores = { a: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 }, b: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4 }, c: { 1: 4 } }
      expect(hoyosQueQuedanSinJugarEnLaTimba({ jugadores, scores: { ...scores, b: { ...scores.b, 9: 4 } }, retiros: { c: 2 }, ordenHoyos: nueve, hoyoEnPantalla: 9 })).toEqual([7, 8])
      const hastaEl8 = { a: scores.b, b: scores.b, c: scores.b }
      expect(hoyosQueQuedanSinJugarEnLaTimba({ jugadores, scores: { ...hastaEl8, a: { ...scores.b, 9: 4 } }, ordenHoyos: nueve, hoyoEnPantalla: 9 })).toEqual([])
      // Nadie anotó el 9 en pantalla: también queda sin jugar.
      expect(hoyosQueQuedanSinJugarEnLaTimba({ jugadores, scores: hastaEl8, ordenHoyos: nueve, hoyoEnPantalla: 9 })).toEqual([9])
    })
    it('la tarjeta del historial lleva los hoyos vacíos como null y no inventa diferencial', () => {
      const tarjeta = armarTarjetaHistorica({ scores: { 1: 5, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 9: 4 }, hoyos: nueve, roundHoles: 9, parMap: Object.fromEntries(nueve.map(h => [h, 4])) })
      expect(tarjeta.scores).toEqual([5, 4, 4, 4, 4, 4, null, null, 4])
      expect(tarjeta.totalGross).toBe(29)
      expect(tarjeta.holesPlayed).toBe(7)
      expect(diferencialDeTarjeta({
        grossAjustado: tarjeta.totalGross, holesPlayed: tarjeta.holesPlayed, hoyosJugados: [1, 2, 3, 4, 5, 6, 9],
        ratings: { slope: 125, cr: 35.5, nineHole: null }, bolaCompartida: false,
      })).toBeNull()
    })
  })
})
