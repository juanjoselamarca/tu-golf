import { describe, it, expect } from 'vitest'
import {
  crearConfigDePlantilla,
  sortearOrdenDeParejas,
  sortearParejasFijas,
  validarJuegoPersonalizado,
  type ConfigJuego,
  type PlantillaJuego,
} from './index'

const jugadores = (n: number, hcp: (number | null)[] = [10, 14, 6, 18]) =>
  Array.from({ length: n }, (_, i) => ({ nombre: ['Juan', 'Pedro', 'Diego', 'Tomás'][i], courseHandicap: hcp[i] }))

const errores = (config: unknown, n = 4, hoyos = 18, hcp?: (number | null)[]) => {
  const r = validarJuegoPersonalizado(config, { jugadores: jugadores(n, hcp), cantidadHoyos: hoyos })
  return r.ok ? [] : r.errores
}

const PLANTILLAS: PlantillaJuego[] = ['colombiana', 'dos_cero_dos', 'subterranea', 'subterror', 'personalizado_total']

describe('plantillas', () => {
  it.each(PLANTILLAS)('%s nace válida con 4 jugadores en 9, 18 y 27 hoyos', p => {
    for (const hoyos of [9, 18, 27]) expect(errores(crearConfigDePlantilla(p), 4, hoyos)).toEqual([])
  })
  it('los juegos individuales también valen con 3', () => {
    for (const p of ['dos_cero_dos', 'subterror', 'personalizado_total'] as const) expect(errores(crearConfigDePlantilla(p), 3)).toEqual([])
  })
  it('el sorteo de la Colombiana es una permutación de las 3 combinaciones', () => {
    let semilla = 7
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 200; i++) expect([...sortearOrdenDeParejas(azar)].sort()).toEqual([0, 1, 2])
  })
  it('las parejas fijas sorteadas reparten a los 4 y A queda en la primera', () => {
    let semilla = 11
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 200; i++) {
      const [p1, p2] = sortearParejasFijas(azar)
      expect([...p1, ...p2].sort()).toEqual([0, 1, 2, 3])
      expect(p1[0]).toBe(0)
    }
  })
})

describe('validador', () => {
  it('Colombiana con 3 jugadores: lo bloquea con un mensaje', () => {
    expect(errores(crearConfigDePlantilla('colombiana'), 3)).toEqual(['La Colombiana es para 4 jugadores.'])
  })
  it('menos de 3 o más de 4 jugadores', () => {
    expect(errores(crearConfigDePlantilla('dos_cero_dos'), 2)).toEqual(['Timba libre es para 3 o 4 jugadores.'])
  })
  it('personalizado de parejas con 3 jugadores', () => {
    const c: ConfigJuego = { ...crearConfigDePlantilla('subterranea'), plantilla: 'personalizado_total' }
    expect(errores(c, 3)).toEqual(['Los juegos de parejas son para 4 jugadores.'])
  })
  it('parejas que rotan con hoyos no divisibles por 3', () => {
    expect(errores(crearConfigDePlantilla('colombiana'), 4, 10)).toEqual(['Las parejas que rotan necesitan una cantidad de hoyos divisible por 3.'])
  })
  it('sorteo repetido o parejas que repiten jugador', () => {
    expect(errores({ ...crearConfigDePlantilla('colombiana'), sorteo: [0, 0, 1] })).toEqual(['Falta sortear el orden de las parejas.'])
    expect(errores({ ...crearConfigDePlantilla('subterranea'), parejas: [[0, 1], [1, 2]] })).toEqual(['Elige las dos parejas: cada jugador en una sola.'])
  })
  it('tipo de duelo que no corresponde a la unidad', () => {
    const individual = crearConfigDePlantilla('dos_cero_dos')
    expect(errores({ ...individual, duelos: [{ tipo: 'mejor_bola', valor: 1, perdedorResta: false }] })).toEqual([
      'Mejor bola, peor bola y suma son para juegos de parejas.',
    ])
    const parejas = crearConfigDePlantilla('subterranea')
    expect(errores({ ...parejas, duelos: individual.duelos })).toEqual(['El duelo por puesto es para juegos individuales.'])
  })
  it('tabla por puesto sin valores para la cantidad de jugadores', () => {
    const c = { ...crearConfigDePlantilla('dos_cero_dos'), duelos: [{ tipo: 'por_puesto', tablas: { '4': [2, 0, 0, -2] } }] }
    expect(errores(c, 3)).toEqual(['Falta el valor de cada puesto para 3 jugadores.'])
  })
  it('sin duelos ni puntos especiales activos', () => {
    const c = { ...crearConfigDePlantilla('dos_cero_dos'), duelos: [], puntitos: [{ id: 'b', tipo: 'birdie', valor: 1, destino: 'individual', activo: false }] }
    expect(errores(c)).toEqual(['Elige al menos un duelo o un punto especial.'])
  })
  it('neto con un jugador sin hándicap: lo nombra', () => {
    const c = { ...crearConfigDePlantilla('dos_cero_dos'), modo: 'neto' }
    expect(errores(c, 4, 18, [10, null, 6, 18])).toEqual(['Para jugar neto, Pedro necesita hándicap.'])
    expect(errores({ ...c, modo: 'gross' }, 4, 18, [10, null, 6, 18])).toEqual([])
  })
  it('dividir con un valor impar', () => {
    const c = { ...crearConfigDePlantilla('colombiana'), repartoPareja: 'dividir' }
    expect(errores(c)).toEqual(['Para dividir los puntos entre la pareja, cada duelo tiene que valer un número par.'])
  })
  it('punto especial repetido, propio sin nombre e ids repetidos', () => {
    const base = crearConfigDePlantilla('dos_cero_dos')
    const sandy = { id: 's1', tipo: 'sandy', valor: 1, destino: 'individual', activo: true }
    expect(errores({ ...base, puntitos: [sandy, { ...sandy, id: 's2' }] })).toEqual(['Cada punto especial puede ir una sola vez.'])
    expect(errores({ ...base, puntitos: [{ ...sandy, tipo: 'propio' }] })).toEqual(['Ponle nombre a tu punto propio.'])
    const propio = { ...sandy, tipo: 'propio', nombre: 'Lluvia' }
    expect(errores({ ...base, puntitos: [propio, { ...propio, nombre: 'Árbol' }] })).toEqual(['Las reglas del juego no son válidas. Vuelve a armarlo.'])
  })
  it('config que no respeta el esquema (valor fuera de rango, versión distinta, basura)', () => {
    const invalido = ['Las reglas del juego no son válidas. Vuelve a armarlo.']
    expect(errores({ ...crearConfigDePlantilla('colombiana'), duelos: [{ tipo: 'suma', valor: 50, perdedorResta: false }] })).toEqual(invalido)
    expect(errores({ ...crearConfigDePlantilla('colombiana'), version: 2 })).toEqual(invalido)
    expect(errores(null)).toEqual(invalido)
    expect(errores({ ...crearConfigDePlantilla('dos_cero_dos'), duelos: [{ tipo: 'por_puesto', tablas: { '3': [2.5, 0, -2] } }] })).toEqual(invalido)
  })
})
