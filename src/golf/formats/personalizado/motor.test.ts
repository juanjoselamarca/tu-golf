import { describe, it, expect } from 'vitest'
import {
  calcularJuegoPersonalizado,
  crearConfigDePlantilla,
  repartirPorPuesto,
  type ConfigJuego,
  type EntradaJuego,
  type HoyoDelJuego,
  type MarcaPuntito,
  type PuntitoConfig,
} from './index'

// Casos dorados de docs/specs/formato-personalizado.md. A = Juan, B = Pedro, C = Diego, D = Tomás.
const JUAN = { id: 'juan', courseHandicap: 10 }
const PEDRO = { id: 'pedro', courseHandicap: 14 }
const DIEGO = { id: 'diego', courseHandicap: 6 }
const TOMAS = { id: 'tomas', courseHandicap: 18 }
const CUATRO = [JUAN, PEDRO, DIEGO, TOMAS]
const TRES = [JUAN, PEDRO, DIEGO]

/** Siempre empieza con el sorteo AB-CD en el primer tramo, para que el primer hoyo sea Juan+Pedro vs Diego+Tomás. */
const sinAzar = () => 0.99
function plantilla(p: ConfigJuego['plantilla'], extra: Partial<ConfigJuego> = {}): ConfigJuego {
  const base = crearConfigDePlantilla(p, sinAzar)
  return {
    ...base,
    ...(base.unidad === 'parejas_rotativas' ? { sorteo: [0, 1, 2] as [number, number, number] } : {}),
    ...(base.unidad === 'parejas_fijas' ? { parejas: [[0, 1], [2, 3]] as ConfigJuego['parejas'] } : {}),
    ...extra,
  }
}

/** Ronda de 18 hoyos donde se juega solo el primero (los demás quedan pendientes y no suman). */
function unHoyo(
  config: ConfigJuego,
  jugadores: EntradaJuego['jugadores'],
  golpes: Record<string, number | undefined>,
  hoyo: Partial<HoyoDelJuego> = {},
  extra: Partial<EntradaJuego> = {},
) {
  const primero: HoyoDelJuego = { numero: 1, par: 4, strokeIndex: 1, ...hoyo }
  const hoyos: HoyoDelJuego[] = [primero, ...Array.from({ length: 17 }, (_, i) => ({ numero: i + 2, par: 4, strokeIndex: i + 2 }))]
  // El SI del primero se intercambia con el que lo tenía para que siga siendo una permutación.
  if (primero.strokeIndex !== 1) hoyos[primero.strokeIndex - 1] = { ...hoyos[primero.strokeIndex - 1], strokeIndex: 1 }
  const scores = Object.fromEntries(jugadores.map(j => [j.id, golpes[j.id] == null ? {} : { 1: golpes[j.id] }]))
  const r = calcularJuegoPersonalizado({ config, jugadores, hoyos, scores, marcas: [], ...extra })
  return { r, h: r.hoyos[0] }
}

const puntito = (tipo: PuntitoConfig['tipo'], destino: PuntitoConfig['destino'] = 'individual'): PuntitoConfig => ({
  id: tipo,
  tipo,
  valor: 1,
  destino,
  activo: true,
})

describe('repartirPorPuesto — regla de empate única', () => {
  it('sin empates, cada puesto recibe su valor', () => {
    expect(repartirPorPuesto([4, 5, 6], [2, 0, -2])).toEqual([2, 0, -2])
  })
  it('empate que divide entero', () => {
    expect(repartirPorPuesto([4, 4, 5], [2, 0, -2])).toEqual([1, 1, -2])
  })
  it('empate que no divide entero → 0 para los empatados', () => {
    expect(repartirPorPuesto([4, 4, 4, 3], [2, 0, 0, -2])).toEqual([0, 0, 0, 2])
  })
  it('dos "no jugó" (Infinity) empatan sin romper el orden', () => {
    expect(repartirPorPuesto([Infinity, 4, Infinity, 5], [2, 0, 0, -2])).toEqual([-1, 2, -1, 0])
  })
})

describe('casos dorados', () => {
  it('1 · 2-0-2 de 3', () => {
    const { h } = unHoyo(plantilla('dos_cero_dos'), TRES, { juan: 4, pedro: 5, diego: 6 })
    expect(h.puntos).toEqual({ juan: 2, pedro: 0, diego: -2 })
  })
  it('2 · 2-0-2 de 3 con empate arriba', () => {
    const { h } = unHoyo(plantilla('dos_cero_dos'), TRES, { juan: 4, pedro: 4, diego: 5 })
    expect(h.puntos).toEqual({ juan: 1, pedro: 1, diego: -2 })
  })
  it('3 · 2-0-2 de 4', () => {
    const { h } = unHoyo(plantilla('dos_cero_dos'), CUATRO, { juan: 4, pedro: 5, diego: 5, tomas: 6 })
    expect(h.puntos).toEqual({ juan: 2, pedro: 0, diego: 0, tomas: -2 })
  })
  it('4 · 2-0-2 de 4, triple empate arriba (el hoyo no suma cero)', () => {
    const { h } = unHoyo(plantilla('dos_cero_dos'), CUATRO, { juan: 4, pedro: 4, diego: 4, tomas: 6 })
    expect(h.puntos).toEqual({ juan: 0, pedro: 0, diego: 0, tomas: -2 })
  })
  it('5 · 2-0-2 de 4 neto a la diferencia del más bajo, SI 5', () => {
    const { h } = unHoyo(plantilla('dos_cero_dos', { modo: 'neto' }), CUATRO, { juan: 4, pedro: 5, diego: 4, tomas: 4 }, { strokeIndex: 5 })
    expect(h.scoreDeJuego).toEqual({ juan: 4, pedro: 4, diego: 4, tomas: 3 })
    expect(h.puntos).toEqual({ juan: 0, pedro: 0, diego: 0, tomas: 2 })
  })
  it('5b · el mismo hoyo con hándicap completo: todos reciben en el SI 5', () => {
    const { h } = unHoyo(plantilla('dos_cero_dos', { modo: 'neto', handicap: 'completo' }), CUATRO, { juan: 4, pedro: 5, diego: 4, tomas: 4 }, { strokeIndex: 5 })
    expect(h.scoreDeJuego).toEqual({ juan: 3, pedro: 4, diego: 3, tomas: 3 })
  })
  it('6 · Colombiana: mejor bola JP, peor bola DT, suma empatada', () => {
    const { r, h } = unHoyo(plantilla('colombiana'), CUATRO, { juan: 4, pedro: 6, diego: 5, tomas: 5 })
    expect(h.marcadorParejas).toEqual([2, 1])
    expect(h.puntos).toEqual({ juan: 2, pedro: 2, diego: 1, tomas: 1 })
    expect(r.tramos[0].marcador).toEqual([2, 1])
  })
  it('7 · Colombiana: mejor bola empatada se reparte 1 y 1', () => {
    const { h } = unHoyo(plantilla('colombiana'), CUATRO, { juan: 4, pedro: 5, diego: 4, tomas: 6 })
    expect(h.marcadorParejas).toEqual([3, 1])
    expect(h.puntos).toEqual({ juan: 3, pedro: 3, diego: 1, tomas: 1 })
  })
  it('8 · Subterránea: solo peor bola; el birdie no entra al duelo', () => {
    const { h } = unHoyo(plantilla('subterranea'), CUATRO, { juan: 3, pedro: 5, diego: 4, tomas: 4 })
    expect(h.puntos).toEqual({ juan: 0, pedro: 0, diego: 1, tomas: 1 })
  })
  it('9 · Subterror de 4', () => {
    const { h } = unHoyo(plantilla('subterror'), CUATRO, { juan: 4, pedro: 5, diego: 5, tomas: 7 })
    expect(h.puntos).toEqual({ juan: 0, pedro: 0, diego: 0, tomas: -1 })
  })
  it('10 · Subterror de 4, empatan los dos peores → nadie pierde', () => {
    const { h } = unHoyo(plantilla('subterror'), CUATRO, { juan: 4, pedro: 4, diego: 6, tomas: 6 })
    expect(h.puntos).toEqual({ juan: 0, pedro: 0, diego: 0, tomas: 0 })
  })

  const especiales = (destino: PuntitoConfig['destino']) =>
    plantilla('colombiana', { puntitos: [puntito('birdie', destino), puntito('greenie', destino), puntito('sandy', destino)] })
  const marcas11: MarcaPuntito[] = [
    { jugadorId: 'juan', hoyo: 1, puntitoId: 'greenie' },
    { jugadorId: 'diego', hoyo: 1, puntitoId: 'sandy' },
  ]
  it('11 · puntos especiales con destino individual', () => {
    const { h } = unHoyo(especiales('individual'), CUATRO, { juan: 2, pedro: 4, diego: 4, tomas: 3 }, { par: 3 }, { marcas: marcas11 })
    expect(h.puntos).toEqual({ juan: 5, pedro: 3, diego: 0, tomas: 0 })
    expect(h.marcadorParejas).toEqual([5, 0])
    const sandy = h.especiales.find(e => e.tipo === 'sandy')!
    expect(sandy).toMatchObject({ jugadorId: 'diego', cuenta: false, puntos: 0, razon: 'El sandy cuenta solo con par o mejor' })
  })
  it('12 · el mismo hoyo con destino pareja: Pedro suma los puntos de Juan', () => {
    const { h } = unHoyo(especiales('pareja'), CUATRO, { juan: 2, pedro: 4, diego: 4, tomas: 3 }, { par: 3 }, { marcas: marcas11 })
    expect(h.puntos).toEqual({ juan: 5, pedro: 5, diego: 0, tomas: 0 })
    expect(h.marcadorParejas).toEqual([5, 0])
  })
  it('13 · birdie automático: eagle 2× y hoyo en uno 3×', () => {
    const config = plantilla('dos_cero_dos', { duelos: [], puntitos: [puntito('birdie')] })
    expect(unHoyo(config, TRES, { juan: 3, pedro: 5, diego: 5 }, { par: 5 }).h.puntos.juan).toBe(2)
    expect(unHoyo(config, TRES, { juan: 3, pedro: 1, diego: 3 }, { par: 3 }).h.puntos).toEqual({ juan: 0, pedro: 3, diego: 0 })
    expect(unHoyo(config, TRES, { juan: 2, pedro: 5, diego: 5 }, { par: 5 }).h.puntos.juan).toBe(3) // albatros
  })
  it('14 · hoyo pendiente: no se puntúa nada', () => {
    const config = plantilla('dos_cero_dos', { puntitos: [puntito('birdie')] })
    const { r, h } = unHoyo(config, CUATRO, { juan: 3, pedro: 5, diego: 5 })
    expect(h.estado).toBe('pendiente')
    expect(h.puntos).toEqual({ juan: 0, pedro: 0, diego: 0, tomas: 0 })
    expect(h.especiales).toEqual([])
    expect(r.hoyosPendientes).toContain(1)
  })
  it('15 · la rotación sigue el orden jugado desde el hoyo 10', () => {
    const numeros = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const hoyos = numeros.map(numero => ({ numero, par: 4, strokeIndex: numero }))
    const config = plantilla('colombiana', { sorteo: [1, 0, 2] })
    const r = calcularJuegoPersonalizado({ config, jugadores: CUATRO, hoyos, scores: {}, marcas: [] })
    expect(r.tramos.map(t => [t.parejas, t.hoyos])).toEqual([
      [[[0, 2], [1, 3]], [10, 11, 12, 13, 14, 15]],
      [[[0, 1], [2, 3]], [16, 17, 18, 1, 2, 3]],
      [[[0, 3], [1, 2]], [4, 5, 6, 7, 8, 9]],
    ])
  })
  it('16 · greenie reasignado: solo cuenta el último y el anterior desaparece', () => {
    const config = plantilla('dos_cero_dos', { duelos: [], puntitos: [puntito('greenie')] })
    const marcas: MarcaPuntito[] = [
      { jugadorId: 'pedro', hoyo: 1, puntitoId: 'greenie' },
      { jugadorId: 'juan', hoyo: 1, puntitoId: 'greenie' },
    ]
    const { h } = unHoyo(config, TRES, { juan: 3, pedro: 3, diego: 4 }, { par: 3 }, { marcas })
    expect(h.especiales).toEqual([{ jugadorId: 'juan', puntitoId: 'greenie', tipo: 'greenie', puntos: 1, cuenta: true, razon: undefined }])
    expect(h.puntos).toEqual({ juan: 1, pedro: 0, diego: 0 })
  })
  it('16b · greenie en un par 4 no cuenta', () => {
    const config = plantilla('dos_cero_dos', { duelos: [], puntitos: [puntito('greenie')] })
    const { h } = unHoyo(config, TRES, { juan: 3, pedro: 4, diego: 4 }, { par: 4 }, { marcas: [{ jugadorId: 'juan', hoyo: 1, puntitoId: 'greenie' }] })
    expect(h.especiales[0]).toMatchObject({ cuenta: false, razon: 'El greenie es solo en par 3' })
    expect(h.puntos.juan).toBe(0)
  })
  it('17 · 2-0-2 de 4 con Tomás retirado', () => {
    const { h } = unHoyo(plantilla('dos_cero_dos'), CUATRO, { juan: 4, pedro: 5, diego: 6 }, {}, { retiros: { tomas: 1 } })
    expect(h.puntos).toEqual({ juan: 2, pedro: 0, diego: 0, tomas: -2 })
  })
  it('18 · Colombiana con Tomás retirado', () => {
    const { h } = unHoyo(plantilla('colombiana'), CUATRO, { juan: 5, pedro: 6, diego: 4 }, {}, { retiros: { tomas: 1 } })
    expect(h.puntos).toEqual({ juan: 2, pedro: 2, diego: 2, tomas: 2 })
    expect(h.marcadorParejas).toEqual([2, 2])
  })
  it('19 · 2-0-2 de 4 con Pedro y Tomás retirados', () => {
    const { h } = unHoyo(plantilla('dos_cero_dos'), CUATRO, { juan: 4, diego: 5 }, {}, { retiros: { pedro: 1, tomas: 1 } })
    expect(h.puntos).toEqual({ juan: 2, pedro: -1, diego: 0, tomas: -1 })
  })
})

describe('retiro y cierre', () => {
  it('el retiro aplica desde su hoyo en orden de juego, no antes', () => {
    const numeros = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const hoyos = numeros.map(numero => ({ numero, par: 4, strokeIndex: numero }))
    const todos4 = Object.fromEntries(numeros.map(n => [n, 4]))
    const scores = { juan: todos4, pedro: todos4, diego: todos4, tomas: { 10: 4 } }
    const r = calcularJuegoPersonalizado({ config: plantilla('subterror'), jugadores: CUATRO, hoyos, scores, marcas: [], retiros: { tomas: 11 } })
    expect(r.hoyosPendientes).toEqual([])
    expect(r.hoyos[0].puntos.tomas).toBe(0) // hoyo 10: jugó y empató
    expect(r.totales.tomas).toBe(-17)
  })
  it('ronda cerrada: un hoyo sin score cuenta como "no jugó"', () => {
    const { h } = unHoyo(plantilla('dos_cero_dos'), CUATRO, { juan: 4, pedro: 5, diego: 6 }, {}, { rondaCerrada: true })
    expect(h.estado).toBe('puntuado')
    expect(h.puntos.tomas).toBe(-2)
  })
  it('marcar el greenie a un retirado no se lo quita al que sí lo ganó', () => {
    const config = plantilla('dos_cero_dos', { duelos: [], puntitos: [puntito('greenie')] })
    const marcas: MarcaPuntito[] = [
      { jugadorId: 'juan', hoyo: 1, puntitoId: 'greenie' },
      { jugadorId: 'tomas', hoyo: 1, puntitoId: 'greenie' },
    ]
    const { h } = unHoyo(config, CUATRO, { juan: 3, pedro: 4, diego: 4 }, { par: 3 }, { marcas, retiros: { tomas: 1 } })
    expect(h.puntos.juan).toBe(1)
    expect(h.especiales.find(e => e.jugadorId === 'tomas')).toMatchObject({ cuenta: false, razon: 'No jugó el hoyo' })
  })
  it('un retirado no gana puntos especiales en los hoyos que no jugó', () => {
    const config = plantilla('dos_cero_dos', { puntitos: [puntito('chipingo')] })
    const { h } = unHoyo(config, CUATRO, { juan: 4, pedro: 5, diego: 6 }, {}, { retiros: { tomas: 1 }, marcas: [{ jugadorId: 'tomas', hoyo: 1, puntitoId: 'chipingo' }] })
    expect(h.especiales[0]).toMatchObject({ jugadorId: 'tomas', cuenta: false, razon: 'No jugó el hoyo' })
    expect(h.puntos.tomas).toBe(-2)
  })
})

describe('neto: escala de hoyos y jugadores plus', () => {
  const nueve = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, strokeIndex: i + 1 }))
  const todos5 = Object.fromEntries(nueve.map(h => [h.numero, 5]))
  it('9 hoyos a la diferencia: 11 golpes = 2 en SI 1-2 y 1 en SI 3-9', () => {
    const jugadores = [{ id: 'a', courseHandicap: 2 }, { id: 'b', courseHandicap: 13 }, { id: 'c', courseHandicap: 2 }]
    const config = plantilla('dos_cero_dos', { modo: 'neto' })
    const r = calcularJuegoPersonalizado({ config, jugadores, hoyos: nueve, scores: { a: todos5, b: todos5, c: todos5 }, marcas: [] })
    expect(r.hoyos.map(h => h.scoreDeJuego.b)).toEqual([3, 3, 4, 4, 4, 4, 4, 4, 4])
    expect(r.hoyos.map(h => h.scoreDeJuego.a)).toEqual(Array(9).fill(5))
  })
  it('hándicap completo con un plus −2 en 18: devuelve golpes en SI 17 y 18', () => {
    const hoyos = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, strokeIndex: i + 1 }))
    const todos4 = Object.fromEntries(hoyos.map(h => [h.numero, 4]))
    const jugadores = [{ id: 'plus', courseHandicap: -2 }, { id: 'b', courseHandicap: 0 }, { id: 'c', courseHandicap: 0 }]
    const config = plantilla('dos_cero_dos', { modo: 'neto', handicap: 'completo' })
    const r = calcularJuegoPersonalizado({ config, jugadores, hoyos, scores: { plus: todos4, b: todos4, c: todos4 }, marcas: [] })
    expect(r.hoyos.map(h => h.scoreDeJuego.plus)).toEqual([...Array(16).fill(4), 5, 5])
  })
})

describe('reparto dividir y perdedor resta', () => {
  it('20 · con dividir, un empate que deja un impar no le da nada a nadie (ni al marcador)', () => {
    const config = plantilla('colombiana', { repartoPareja: 'dividir', duelos: [{ tipo: 'mejor_bola', valor: 2, perdedorResta: false }] })
    const { h } = unHoyo(config, CUATRO, { juan: 4, pedro: 6, diego: 4, tomas: 5 })
    expect(h.marcadorParejas).toEqual([0, 0])
    expect(h.puntos).toEqual({ juan: 0, pedro: 0, diego: 0, tomas: 0 })
  })
  it('con dividir, cada integrante suma la mitad', () => {
    const config = plantilla('subterranea', { repartoPareja: 'dividir', duelos: [{ tipo: 'peor_bola', valor: 2, perdedorResta: true }] })
    const { h } = unHoyo(config, CUATRO, { juan: 4, pedro: 5, diego: 4, tomas: 4 })
    expect(h.marcadorParejas).toEqual([-2, 2])
    expect(h.puntos).toEqual({ juan: -1, pedro: -1, diego: 1, tomas: 1 })
  })
})

describe('ranking y totales', () => {
  it('ordena de mayor a menor y los empatados comparten puesto', () => {
    const { r } = unHoyo(plantilla('dos_cero_dos'), CUATRO, { juan: 4, pedro: 4, diego: 5, tomas: 6 })
    expect(r.ranking).toEqual([
      { jugadorId: 'juan', puntos: 1, puesto: 1 },
      { jugadorId: 'pedro', puntos: 1, puesto: 1 },
      { jugadorId: 'diego', puntos: 0, puesto: 3 },
      { jugadorId: 'tomas', puntos: -2, puesto: 4 },
    ])
  })
})
