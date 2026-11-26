import { describe, expect, it } from 'vitest'
import { CONFIG_SKINS_POR_DEFECTO, type ConfigSkins } from '@/golf/formats/skins'
import { leerReglasSkins, valorDelHoyoSkins } from './skins-del-scorer'

const hoyos = [1, 2, 3].map((numero, i) => ({ numero, par: 4, si: i + 1 }))
const gross: ConfigSkins = { ...CONFIG_SKINS_POR_DEFECTO, modo: 'gross' }
const reglas = (config: ConfigSkins = gross) => ({ config, jugadorIds: ['a', 'b'] })
const ctx = (chs: (number | null)[] = [null, null]) => ({ jugadores: chs.map((c, i) => ({ nombre: `J${i}`, courseHandicap: c })), hoyos })

describe('valorDelHoyoSkins', () => {
  it('sin nada anotado el primer hoyo vale 1', () => {
    expect(valorDelHoyoSkins({ reglas: reglas(), contexto: ctx(), scores: {}, fuera: {}, hoyo: 1 })).toEqual({ valor: 1, provisional: false })
  })
  it('empate en el 1: el 2 vale 2 (arrastre)', () => {
    const scores = { a: { 1: 4 }, b: { 1: 4 } }
    expect(valorDelHoyoSkins({ reglas: reglas(), contexto: ctx(), scores, fuera: {}, hoyo: 2 })).toEqual({ valor: 2, provisional: false })
  })
  it('con el 1 a medio anotar, el 2 es provisional', () => {
    const r = valorDelHoyoSkins({ reglas: reglas(), contexto: ctx(), scores: { a: { 1: 4 } }, fuera: {}, hoyo: 2 })
    expect(r?.provisional).toBe(true)
  })
  it('X de todos en el 1: nadie gana, arrastra', () => {
    const r = valorDelHoyoSkins({ reglas: reglas(), contexto: ctx(), scores: {}, fuera: { a: { 1: true }, b: { 1: true } }, hoyo: 2 })
    expect(r?.valor).toBe(2)
  })
  it('neto con un jugador sin hándicap: el motor bloquea y no se muestra cifra', () => {
    const neto = { ...CONFIG_SKINS_POR_DEFECTO, modo: 'neto' as const }
    expect(valorDelHoyoSkins({ reglas: reglas(neto), contexto: ctx([10, null]), scores: {}, fuera: {}, hoyo: 1 })).toBeNull()
    expect(valorDelHoyoSkins({ reglas: reglas(neto), contexto: ctx([10, 12]), scores: {}, fuera: {}, hoyo: 1 })).toEqual({ valor: 1, provisional: false })
  })
  it('salida por el 10: el arrastre sigue el orden de juego (gana el 10, empatan del 11 al 18 → el 1 vale 9)', () => {
    // El contexto llega en orden de juego (`hoyosJugadosDeLaRonda(10, 18)` = 10..18, 1..9), no por número.
    const alDiez = [...Array.from({ length: 9 }, (_, i) => i + 10), ...Array.from({ length: 9 }, (_, i) => i + 1)]
    const contexto = { jugadores: ctx().jugadores, hoyos: alDiez.map(numero => ({ numero, par: 4, si: numero })) }
    const vuelta = Object.fromEntries(alDiez.slice(0, 9).map(h => [h, 4]))
    const scores = { a: { ...vuelta, 10: 3 }, b: vuelta }
    expect(valorDelHoyoSkins({ reglas: reglas(), contexto, scores, fuera: {}, hoyo: 10 })?.valor).toBe(1)
    expect(valorDelHoyoSkins({ reglas: reglas(), contexto, scores, fuera: {}, hoyo: 1 })).toEqual({ valor: 9, provisional: false })
  })
  it('contexto que no calza con las reglas u hoyo fuera del skins: null', () => {
    expect(valorDelHoyoSkins({ reglas: reglas(), contexto: ctx([null]), scores: {}, fuera: {}, hoyo: 1 })).toBeNull()
    expect(valorDelHoyoSkins({ reglas: reglas(), contexto: ctx(), scores: {}, fuera: {}, hoyo: 9 })).toBeNull()
  })
})

describe('leerReglasSkins', () => {
  it('lee las reglas guardadas y rechaza lo inválido', () => {
    expect(leerReglasSkins({ config: gross, jugadorIds: ['a'] })).toEqual({ config: gross, jugadorIds: ['a'] })
    expect(leerReglasSkins(null)).toBeNull()
    expect(leerReglasSkins({ config: { modo: 'gross' }, jugadorIds: ['a'] })).toBeNull()
    expect(leerReglasSkins({ config: gross, jugadorIds: [1] })).toBeNull()
  })
})
