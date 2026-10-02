import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchHoyosDeLaRonda = vi.fn()
vi.mock('@/lib/data/course-holes', () => ({ fetchHoyosDeLaRonda: (...a: unknown[]) => fetchHoyosDeLaRonda(...a) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { extrasDeTarjeta } from '@/lib/data/ronda-libre-finalizar'

const hoyos = [1, 2, 3]
const holeRows = hoyos.map(n => ({ numero: n, par: 4, stroke_index: n }))

/** Cliente mínimo: sólo la query del nombre de equipo. */
function cliente(nombreEquipo: string | null) {
  const q = {
    select: () => q, eq: () => q, limit: () => q,
    single: async () => ({ data: nombreEquipo ? { ronda_equipos: { nombre: nombreEquipo } } : null, error: null }),
  }
  return { from: vi.fn(() => q) } as never
}

const base = {
  id: 'r1', codigo: 'ABC', course_id: 'c1', recorridos: null, holes: 3, modo_juego: 'gross',
  ronda_libre_jugadores: [
    { id: 'p1', nombre: 'Ana', handicap: 0 },
    { id: 'p2', nombre: 'Beto', handicap: 0 },
  ],
}

describe('extrasDeTarjeta', () => {
  beforeEach(() => { vi.clearAllMocks(); fetchHoyosDeLaRonda.mockResolvedValue(holeRows) })

  it('match play: resultado con los golpes de ambos (mismo texto que el finalizador)', async () => {
    const ronda = { ...base, formato_juego: 'match_play' } as never
    const scoresPorJugador = { p1: { '1': 3, '2': 3, '3': 4 }, p2: { '1': 4, '2': 4, '3': 4 } }
    const a = await extrasDeTarjeta(cliente(null), { ronda, jugadorId: 'p1', scoresPorJugador, hoyos })
    // Ana gana el 1 y el 2: 2 arriba con 1 por jugar → match decidido.
    expect(a.matchResult).toBe('2&1')
    expect(a.teamName).toBeNull()
  })

  it('stroke play: sin match ni equipo y sin consultar hoyos', async () => {
    const ronda = { ...base, formato_juego: 'stroke_play' } as never
    const r = await extrasDeTarjeta(cliente('X'), { ronda, jugadorId: 'p1', scoresPorJugador: {}, hoyos })
    expect(r).toEqual({ matchResult: null, teamName: null })
    expect(fetchHoyosDeLaRonda).not.toHaveBeenCalled()
  })

  it('formato por equipos: nombre del equipo del jugador', async () => {
    const ronda = { ...base, formato_juego: 'best_ball' } as never
    const r = await extrasDeTarjeta(cliente('Los Pros'), { ronda, jugadorId: 'p1', scoresPorJugador: {}, hoyos })
    expect(r.teamName).toBe('Los Pros')
  })

  it('cancha sin hoyos cargados: sin resultado de match (no inventa)', async () => {
    fetchHoyosDeLaRonda.mockResolvedValue([])
    const ronda = { ...base, formato_juego: 'match_play' } as never
    const r = await extrasDeTarjeta(cliente(null), { ronda, jugadorId: 'p1', scoresPorJugador: { p1: { '1': 3 }, p2: { '1': 4 } }, hoyos })
    expect(r.matchResult).toBeNull()
  })
})
