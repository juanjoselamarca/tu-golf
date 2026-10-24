/**
 * Board de un torneo iniciado (camino de ronda libre): si la lectura de
 * `rondas_libres` falla, el board NO puede seguir con el % de juego en 100 y sin
 * datos de cancha — publicaría un neto distinto al del scorer sin avisar.
 * Mismo trato que `teamLeaderboard.ts` (el error se propaga).
 */
import { describe, it, expect } from 'vitest'
import { fetchRondaLibreJugadoresConCourseHcp } from './leaderboard'

const errorRondas = { code: '57014', message: 'canceling statement due to statement timeout' }

const cliente = {
  from: (t: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) q[m] = () => q
    q.in = async () => t === 'ronda_libre_jugadores'
      ? { data: [{ id: 'j1', nombre: 'Ana', user_id: null, scores: {}, handicap: 12, tees: 'azul', ronda_id: 'r1' }], error: null }
      : { data: null, error: errorRondas }
    return q
  },
} as unknown as Parameters<typeof fetchRondaLibreJugadoresConCourseHcp>[0]

describe('fetchRondaLibreJugadoresConCourseHcp — error al leer rondas_libres', () => {
  it('propaga el error en vez de calcular al 100 % sin cancha', async () => {
    await expect(fetchRondaLibreJugadoresConCourseHcp(cliente, ['r1'], 72, async () => new Map())).rejects.toMatchObject(errorRondas)
  })
})
