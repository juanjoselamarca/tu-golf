/**
 * Pestaña Juego de una Timba libre (maqueta ScorerC aprobada por Juanjo): lo que se muestra sale SOLO de la vista
 * del servidor (`GET /juego`), nunca de un neto calculado en el cliente.
 */
import { describe, it, expect } from 'vitest'
import { armarReglasGuardadas, calcularJuegoPersonalizado, crearConfigDePlantilla, type ConfigJuego } from '@/golf/formats/personalizado'
import { armarEntradaDelJuego, vistaDelJuego, type VistaDelJuego } from './juego-de-la-ronda'
import { armarTablaDelJuego, nombresCortos } from './tabla-del-juego'

const J = '00000000-0000-4000-8000-00000000000a'
const P = '00000000-0000-4000-8000-00000000000b'
const D = '00000000-0000-4000-8000-00000000000c'
const T = '00000000-0000-4000-8000-00000000000d'
const IDS = [J, P, D, T]
const NOMBRES = { [J]: 'Juan Pérez', [P]: 'Pedro Soto', [D]: 'Diego Ruiz', [T]: 'Tomás Lira' }
const PAR = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, 4]))
const SI = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, i + 1]))

function vista(
  scores: Record<string, Record<number, number>>,
  cfg: ConfigJuego,
  extra: { hoyoInicio?: number; ch?: Record<string, number> } = {},
): VistaDelJuego {
  const r = armarEntradaDelJuego({
    reglasJuego: armarReglasGuardadas(cfg, IDS),
    ronda: { holes: 18, hoyo_inicio: extra.hoyoInicio ?? 1, estado: 'en_curso' },
    jugadores: IDS.map(id => ({ id, scores: scores[id] ?? {} })),
    mapasHandicap: { courseHcpMap: extra.ch ?? { [J]: 10, [P]: 14, [D]: 6, [T]: 18 }, sinIndice: [] },
    parMap: PAR, siMap: SI, marcas: [], retiros: [],
  })
  if (!r.ok) throw new Error(r.motivo)
  return vistaDelJuego(r.entrada, r.jugadorIds, calcularJuegoPersonalizado(r.entrada))
}

// La Colombiana con sorteo AB-CD → AC-BD → AD-BC, tramos de 6.
const colombiana: ConfigJuego = { ...crearConfigDePlantilla('colombiana'), sorteo: [0, 1, 2] }

interface Golpes { h: number; j: number; p: number; d: number; t?: number }
const golpes = (h: number, j: number, p: number, d: number, t?: number): Golpes => ({ h, j, p, d, t })
function tarjetas(filas: Golpes[]) {
  const s: Record<string, Record<number, number>> = { [J]: {}, [P]: {}, [D]: {}, [T]: {} }
  for (const f of filas) {
    s[J][f.h] = f.j
    s[P][f.h] = f.p
    s[D][f.h] = f.d
    if (f.t != null) s[T][f.h] = f.t
  }
  return s
}

describe('armarTablaDelJuego — La Colombiana a mitad de ronda', () => {
  // Cada hoyo = caso dorado 6 (JP 2 – DT 1; Juan +2 · Pedro +2 · Diego +1 · Tomás +1).
  const filas = [1, 2, 3, 4, 5, 6, 7].map(h => golpes(h, 4, 6, 5, 5))
  // Hoyo 8: Tomás todavía no anota → pendiente.
  filas.push(golpes(8, 4, 4, 4))
  const v = vista(tarjetas(filas), colombiana)
  const tabla = armarTablaDelJuego(v, NOMBRES, 8)

  it('encabezado: nombre del juego y "N de M hoyos" con los hoyos puntuados', () => {
    expect(tabla.titulo).toBe('La Colombiana')
    expect(tabla.hoyosPuntuados).toBe(7)
    expect(tabla.totalHoyos).toBe(18)
  })

  it('ranking con los totales del motor; los empatados comparten puesto', () => {
    expect(tabla.ranking.map(r => r.puntos)).toEqual(v.resultado.ranking.map(r => r.puntos))
    expect(tabla.ranking.map(r => r.puesto)).toEqual(v.resultado.ranking.map(r => r.puesto))
    expect(tabla.ranking[0].texto).toMatch(/^\+\d+$/)
    // Solo el tramo 1 (Juan y Pedro juntos): empatan y comparten el 1º; Diego y Tomás, el 3º.
    const t1 = armarTablaDelJuego(vista(tarjetas(filas.slice(0, 6)), colombiana), NOMBRES, 6)
    expect(t1.ranking.map(r => [r.puesto, r.nombre, r.texto])).toEqual([
      [1, 'Juan', '+12'], [1, 'Pedro', '+12'], [3, 'Diego', '+6'], [3, 'Tomás', '+6'],
    ])
  })

  it('separador por tramo con su marcador, y el hoyo pendiente en "falta anotar"', () => {
    const tipos = tabla.filas.map(f => (f.tipo === 'tramo' ? `T${f.indice}` : String(f.numero)))
    expect(tipos).toEqual(['T0', '1', '2', '3', '4', '5', '6', 'T1', '7', '8'])
    const t0 = tabla.filas[0]
    expect(t0.tipo === 'tramo' && t0.marcador).toEqual({ parejas: ['Juan y Pedro', 'Diego y Tomás'], puntos: [12, 6] })
    const h1 = tabla.filas[1]
    expect(h1.tipo === 'hoyo' && h1.celdas.map(c => c.texto)).toEqual(['+2', '+2', '+1', '+1'])
    const h8 = tabla.filas.at(-1)
    expect(h8?.tipo === 'hoyo' && h8.pendiente).toBe(true)
    expect(h8?.tipo === 'hoyo' && h8.celdas.map(c => c.texto)).toEqual(Array(4).fill('falta anotar'))
    expect(h8?.tipo === 'hoyo' && h8.sinJugar).toBe(false)
  })

  it('un hoyo que nadie jugó (sin_jugar) dice "No se jugó", no "falta anotar"', () => {
    const conHueco: VistaDelJuego = {
      ...v,
      resultado: { ...v.resultado, hoyos: v.resultado.hoyos.map(h => (h.numero === 2 ? { ...h, estado: 'sin_jugar' as const } : h)) },
    }
    const h2 = armarTablaDelJuego(conHueco, NOMBRES, null).filas.find(f => f.tipo === 'hoyo' && f.numero === 2)
    expect(h2?.tipo === 'hoyo' && [h2.pendiente, h2.sinJugar]).toEqual([true, true])
    expect(h2?.tipo === 'hoyo' && h2.celdas.map(c => c.texto)).toEqual(Array(4).fill('No se jugó'))
  })

  it('marcador actual = el tramo del hoyo en que va el scorer', () => {
    expect(tabla.marcadorActual?.parejas).toEqual(['Juan y Diego', 'Pedro y Tomás'])
    expect(armarTablaDelJuego(v, NOMBRES, 3).marcadorActual?.parejas).toEqual(['Juan y Pedro', 'Diego y Tomás'])
  })

  it('sin hoyo actual (vista del grupo) usa el último hoyo con golpes; no muestra hoyos sin tocar', () => {
    const t = armarTablaDelJuego(v, NOMBRES, null)
    expect(t.marcadorActual?.parejas).toEqual(['Juan y Diego', 'Pedro y Tomás'])
    expect(t.filas.filter(f => f.tipo === 'hoyo').length).toBe(8)
  })

  it('columnas en el orden A, B, C, D con nombre corto', () => {
    expect(tabla.columnas.map(c => c.nombre)).toEqual(['Juan', 'Pedro', 'Diego', 'Tomás'])
  })
})

describe('armarTablaDelJuego — otros juegos', () => {
  it('individual (2-0-2): sin marcador ni separadores', () => {
    const v = vista(tarjetas([golpes(1, 4, 5, 6, 6)]), crearConfigDePlantilla('dos_cero_dos'))
    const t = armarTablaDelJuego(v, NOMBRES, 1)
    expect(t.titulo).toBe('El 2-0-2')
    expect(t.marcadorActual).toBeNull()
    expect(t.filas.every(f => f.tipo === 'hoyo')).toBe(true)
  })
  it('parejas fijas: marcador sí, separadores no (un solo tramo)', () => {
    const cfg: ConfigJuego = { ...crearConfigDePlantilla('subterranea'), parejas: [[0, 1], [2, 3]] }
    const t = armarTablaDelJuego(vista(tarjetas([golpes(1, 3, 5, 4, 4)]), cfg), NOMBRES, 1)
    expect(t.marcadorActual).toEqual({ parejas: ['Juan y Pedro', 'Diego y Tomás'], puntos: [0, 1] })
    expect(t.filas.every(f => f.tipo === 'hoyo')).toBe(true)
  })
  it('personalizado total se titula como la Timba', () => {
    const cfg: ConfigJuego = { ...crearConfigDePlantilla('dos_cero_dos'), plantilla: 'personalizado_total' }
    expect(armarTablaDelJuego(vista({}, cfg), NOMBRES, 1).titulo).toBe('Timba libre')
  })
  it('neto: cada celda trae los golpes recibidos de la vista (caso dorado 5: en el SI 5 reciben Pedro y Tomás)', () => {
    const cfg: ConfigJuego = { ...crearConfigDePlantilla('dos_cero_dos'), modo: 'neto' }
    const t = armarTablaDelJuego(vista(tarjetas([golpes(5, 4, 5, 4, 4)]), cfg), NOMBRES, 5)
    expect(t.esNeto).toBe(true)
    const h5 = t.filas.find(f => f.tipo === 'hoyo' && f.numero === 5)
    expect(h5?.tipo === 'hoyo' && h5.celdas.map(c => c.golpesRecibidos)).toEqual([0, 1, 0, 1])
    expect(h5?.tipo === 'hoyo' && h5.celdas.map(c => c.texto)).toEqual(['0', '0', '0', '+2'])
  })
  it('neto sin hándicap de alguien: lo dice `sinHandicap` del resultado (sin repetir el predicado)', () => {
    const cfg: ConfigJuego = { ...crearConfigDePlantilla('dos_cero_dos'), modo: 'neto' }
    const t = armarTablaDelJuego(vista({}, cfg, { ch: { [J]: 10, [P]: 14, [D]: 6 } }), NOMBRES, 1)
    expect(t.sinHandicap).toEqual(['Tomás'])
  })
  it('sin golpes todavía: sin filas, 0 de 18', () => {
    const t = armarTablaDelJuego(vista({}, colombiana), NOMBRES, null)
    expect(t.filas).toEqual([])
    expect(t.hoyosPuntuados).toBe(0)
  })
  it('salida en el 10: las filas siguen el orden jugado', () => {
    const v = vista(tarjetas([golpes(10, 4, 4, 4, 4), golpes(11, 4, 4, 4, 4)]), crearConfigDePlantilla('dos_cero_dos'), { hoyoInicio: 10 })
    expect(armarTablaDelJuego(v, NOMBRES, 11).filas.map(f => f.tipo === 'hoyo' && f.numero)).toEqual([10, 11])
  })
})

describe('nombresCortos', () => {
  it('primer nombre; si dos se llaman igual, agrega la inicial del apellido', () => {
    expect(nombresCortos(['Juan Pérez', 'Juan Soto', 'Diego', '  '])).toEqual(['Juan P.', 'Juan S.', 'Diego', 'Jugador 4'])
  })
})
