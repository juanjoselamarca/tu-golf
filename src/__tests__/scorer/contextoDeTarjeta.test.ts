import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HoleData } from '@/types/ronda'

// Hoyos de 3 hoyos par 4 (SI 1..3) y course handicaps de scoring controlados por el test.
const cargarHoyosDelScorer = vi.fn()
const courseHandicapsDeRonda = vi.fn()
vi.mock('@/lib/data/ronda-libre-scorer', () => ({ cargarHoyosDelScorer: (...a: unknown[]) => cargarHoyosDelScorer(...a) }))
vi.mock('@/lib/data/ronda-libre', () => ({ courseHandicapsDeRonda: (...a: unknown[]) => courseHandicapsDeRonda(...a) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { contextoDeTarjeta, guardarTarjetaEnHistorial } from '@/lib/data/ronda-libre-finalizar'

const hoyos = [1, 2, 3]
const holeDataMap: Record<number, HoleData> = Object.fromEntries(
  hoyos.map(n => [n, { numero: n, par: 4, stroke_index: n, yardaje: null }]),
)
const parMap: Record<number, number> = { 1: 4, 2: 4, 3: 4 }

/** Cliente mínimo: nombre de equipo e INSERT en historial; registra la fila insertada. */
function cliente(nombreEquipo: string | null = null) {
  const insertadas: Array<Record<string, unknown>> = []
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q, limit: () => q, ilike: () => q,
    single: async () => ({ data: nombreEquipo ? { ronda_equipos: { nombre: nombreEquipo } } : null, error: null }),
    insert: (fila: Record<string, unknown>) => { insertadas.push(fila); return { then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) } },
  }
  return { cliente: { from: vi.fn(() => q) } as never, insertadas }
}

const ronda = (formato: string, extra: Record<string, unknown> = {}) => ({
  id: 'r1', codigo: 'ABC', course_name: 'Club', course_id: 'c1', fecha: '2026-10-03', estado: 'en_curso', tees: 'azul',
  recorridos: null, holes: 3, hoyo_inicio: 1, modo_juego: 'neto', formato_juego: formato,
  ronda_libre_jugadores: [
    { id: 'p1', nombre: 'Ana', handicap: 0, user_id: 'u1', scores: {}, tees: null },
    // Índice declarado 30: si el match usara `handicap` (el índice) en vez del CH de
    // scoring, Beto recibiría golpes y el resultado cambiaría.
    { id: 'p2', nombre: 'Beto', handicap: 30, user_id: 'u2', scores: {}, tees: null },
  ],
  ...extra,
}) as never

beforeEach(() => {
  vi.clearAllMocks()
  cargarHoyosDelScorer.mockResolvedValue({ parMap, holeDataMap, finalParTotal: 12 })
  courseHandicapsDeRonda.mockResolvedValue({ courseHcpMap: { p1: 0, p2: 0 }, indexByJugador: {}, sinIndice: new Set(), courseDataByTee: {} })
})

const contexto = (formato: string, scoresPorJugador: Record<string, Record<string, number>>, jugadorId = 'p1', extra = {}) =>
  contextoDeTarjeta(cliente().cliente, {
    ronda: ronda(formato, extra), jugadorId, scores: scoresPorJugador[jugadorId] ?? {}, scoresPorJugador, hoyos, parMap,
  })

describe('contextoDeTarjeta — match play', () => {
  it('resultado desde la perspectiva de quien guarda: Ganó / Perdió', async () => {
    const s = { p1: { '1': 3, '2': 3, '3': 4 }, p2: { '1': 4, '2': 4, '3': 4 } }
    expect((await contexto('match_play', s, 'p1')).matchResult).toBe('Ganó 2&1')
    expect((await contexto('match_play', s, 'p2')).matchResult).toBe('Perdió 2&1')
  })

  it('reparte golpes con el course handicap de SCORING, no con el índice de la tarjeta', async () => {
    // Con el índice (30) Beto recibiría 1 golpe por hoyo y empataría los tres hoyos.
    const s = { p1: { '1': 3, '2': 3, '3': 3 }, p2: { '1': 4, '2': 4, '3': 4 } }
    expect((await contexto('match_play', s)).matchResult).toBe('Ganó 2&1')
  })

  it('empate al final → "Empate"', async () => {
    const s = { p1: { '1': 4, '2': 4, '3': 4 }, p2: { '1': 4, '2': 4, '3': 4 } }
    expect((await contexto('match_play', s)).matchResult).toBe('Empate')
  })

  it('hoyo concedido: cuenta como perdido en el match y se estima min(doble bogey neto, neto rival + 1)', async () => {
    // Ana concede el 1 (Beto 4 → estimación 5); Beto gana el 1, Ana gana 2 y 3 → Ana 1 UP.
    const s = { p1: { '1': -1, '2': 3, '3': 3 }, p2: { '1': 4, '2': 4, '3': 4 } }
    const r = await contexto('match_play', s)
    expect(r.matchResult).toBe('Ganó 1 UP')
    expect(r.scores).toEqual({ 1: 5, 2: 3, 3: 3 })
    expect(r.estimados).toEqual([{ hoyo: 1, motivo: 'concedido' }])
  })

  it('concedido sin score del rival → doble bogey neto (con golpes recibidos)', async () => {
    courseHandicapsDeRonda.mockResolvedValue({ courseHcpMap: { p1: 3, p2: 0 }, indexByJugador: {}, sinIndice: new Set(), courseDataByTee: {} })
    const s = { p1: { '1': -1, '2': 5, '3': 5 }, p2: { '2': 4, '3': 4 } }
    const r = await contexto('match_play', s)
    // 3 hoyos, CH 3 → 1 golpe por hoyo: doble bogey neto = 4 + 2 + 1.
    expect(r.scores[1]).toBe(7)
  })

  it('jugador sin índice: el máximo es par + 5 (WHS 3.1b)', async () => {
    courseHandicapsDeRonda.mockResolvedValue({ courseHcpMap: { p1: 0, p2: 0 }, indexByJugador: {}, sinIndice: new Set(['p1']), courseDataByTee: {} })
    const s = { p1: { '1': -1, '2': 5, '3': 5 }, p2: {} }
    expect((await contexto('match_play', s)).scores[1]).toBe(9)
  })

  it('hoyo ganado sin terminar (el rival concedió y no anoté) → par neto', async () => {
    courseHandicapsDeRonda.mockResolvedValue({ courseHcpMap: { p1: 3, p2: 0 }, indexByJugador: {}, sinIndice: new Set(), courseDataByTee: {} })
    const s = { p1: { '2': 4, '3': 4 }, p2: { '1': -1, '2': 4, '3': 4 } }
    const r = await contexto('match_play', s)
    expect(r.scores[1]).toBe(5)
    expect(r.estimados).toEqual([{ hoyo: 1, motivo: 'ganado_sin_terminar' }])
  })

  it('hoyos posteriores a decidirse el match: par neto si no se anotaron, el score real si se anotó', async () => {
    // Ana gana 1 y 2 → 2&1; el 3 no se juega.
    const sinJugar = await contexto('match_play', { p1: { '1': 3, '2': 3 }, p2: { '1': 4, '2': 4 } })
    expect(sinJugar.scores[3]).toBe(4)
    expect(sinJugar.estimados).toEqual([{ hoyo: 3, motivo: 'no_jugado' }])
    const jugado = await contexto('match_play', { p1: { '1': 3, '2': 3, '3': 6 }, p2: { '1': 4, '2': 4 } })
    expect(jugado.scores[3]).toBe(6)
    expect(jugado.estimados).toEqual([])
  })
})

describe('contextoDeTarjeta — otros formatos', () => {
  it('stroke play: la tarjeta pasa tal cual y no se consultan hoyos ni handicaps', async () => {
    const r = await contexto('stroke_play', { p1: { '1': 4, '2': 5, '3': 4 } })
    expect(r).toEqual({ scores: { '1': 4, '2': 5, '3': 4 }, matchResult: null, teamName: null, estimados: [] })
    expect(cargarHoyosDelScorer).not.toHaveBeenCalled()
  })

  it('formato por equipos: nombre del equipo del jugador', async () => {
    const r = await contextoDeTarjeta(cliente('Los Pros').cliente, {
      ronda: ronda('best_ball'), jugadorId: 'p1', scores: {}, scoresPorJugador: {}, hoyos, parMap,
    })
    expect(r.teamName).toBe('Los Pros')
  })
})

describe('guardarTarjetaEnHistorial — la fila de un match con concedidos', () => {
  it('nunca guarda -1: total, hoyos jugados, resultado y metadata.estimados', async () => {
    const { cliente: sb, insertadas } = cliente()
    const s = { p1: { '1': -1, '2': 3, '3': 3 }, p2: { '1': 4, '2': 4, '3': 4 } }
    const r = await guardarTarjetaEnHistorial(sb, {
      ronda: ronda('match_play', { course_id: null }), jugador: { id: 'p1', tees: null }, userId: 'u1',
      scores: s.p1, scoresPorJugador: s, hoyos, parMap, ratingsPorTee: new Map(), conId: false,
    })
    expect(r.status).toBe('insertada')
    const fila = insertadas[0]
    expect(fila.scores).toEqual([5, 3, 3])
    expect(fila.total_gross).toBe(11)
    expect(fila.holes_played).toBe(3)
    expect(fila.match_result).toBe('Ganó 1 UP')
    expect(fila.metadata).toMatchObject({ estimados: [{ hoyo: 1, motivo: 'concedido' }] })
    expect((fila.scores as number[]).every(v => v == null || v >= 1)).toBe(true)
  })
})
