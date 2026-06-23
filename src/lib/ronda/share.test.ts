import { describe, it, expect } from 'vitest'
import { buildLeaderboardShareData } from './share'
import type { RondaLibre } from '@/types/ronda'
import type { Equipo } from '@/app/ronda-libre/[codigo]/types'

/**
 * Canario del crash de share en scramble/foursome (PR #186 / code-review).
 *
 * En scramble los puntajes viven en el equipo (`ronda_equipos.scores`), NO en
 * `ronda_libre_jugadores`. Por eso `players` queda vacío en el payload de share,
 * mientras `teams` está poblado. `compartirLeaderboard` derefenciaba
 * `data.players[0].totalHoles` → TypeError. El fix mueve `holesPlayed` a
 * `data.totalHoles` (independiente de players). Este test clava esa forma.
 */
describe('buildLeaderboardShareData — scramble sin scores individuales', () => {
  const parMap = { 1: 4, 2: 4 }
  const siMap = { 1: 1, 2: 2 }

  const jugadores = [
    { id: 'j1', nombre: 'Ana', user_id: 'u1', scores: {}, handicap: 10 },
    { id: 'j2', nombre: 'Beto', user_id: 'u2', scores: {}, handicap: 12 },
  ]

  const equipos: Equipo[] = [
    { id: 'e1', nombre: 'Equipo 1', handicap_equipo: null, jugadorIds: ['j1', 'j2'], scores: { '1': 4, '2': 5 } },
  ]

  const ronda = {
    formato_juego: 'scramble',
    modo_juego: 'gross',
    holes: 2,
    course_name: 'Los Leones',
    ronda_libre_jugadores: jugadores,
  } as unknown as RondaLibre

  it('produce players vacío, teams poblado y totalHoles seteado (la forma que crasheaba)', () => {
    const data = buildLeaderboardShareData({
      ronda,
      leaderboard: [], // ningún jugador con holesPlayed > 0
      equipos,
      parMap, siMap,
      courseHcpMap: { j1: 10, j2: 12 },
      fechaDisplay: '22 jun 2026',
      codigo: 'ABC123',
      isFinished: true,
    })

    expect(data.players).toEqual([]) // <- el deref players[0] era el crash
    expect(data.teams && data.teams.length).toBeGreaterThan(0)
    expect(data.totalHoles).toBe(2) // <- holesPlayed de la card sale de acá, no de players[0]
  })
})
