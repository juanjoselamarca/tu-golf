/**
 * Stableford GROSS en ronda libre — torneo Los Leones 04-oct-2026.
 *
 * Bug: `buildLeaderboard` (vista en vivo de los seguidores) repartía golpes con el course
 * handicap de cada jugador aunque la ronda fuera `modo_juego='gross'` → los puntos salían
 * en neto. En gross el handicap no entra en juego (`handicapQueJuega`).
 */
import { describe, it, expect } from 'vitest'
import { buildLeaderboard } from './leaderboard'
import type { Jugador } from '@/types/ronda'
import { PAR_LEONES, SI_LEONES_BD, TARJETAS_LEONES, PUNTOS_ESPERADOS_LEONES } from '@/golf/core/__fixtures__/los-leones'

function jugador(id: string, scores: Record<string, number>, handicap: number): Jugador {
  return { id, nombre: `QA_LEONES_${id}`, user_id: null, scores, handicap }
}

function leaderboard(jugadores: Jugador[], courseHcpMap: Record<string, number>, modoJuego: 'gross' | 'neto' = 'gross') {
  return buildLeaderboard({
    jugadores, holes: 18, hoyoInicio: 1, parMap: PAR_LEONES, siMap: SI_LEONES_BD,
    courseHcpMap, modoJuego, formatoJuego: 'stableford',
  })
}

describe('buildLeaderboard — Stableford gross Los Leones', () => {
  it('fixtures A/B/C/D dan 36/18/28/40 y ordenan por puntos DESC', () => {
    const js = (['A', 'B', 'C', 'D'] as const).map(k => jugador(k, TARJETAS_LEONES[k], 0))
    const lb = leaderboard(js, { A: 0, B: 0, C: 0, D: 0 })
    expect(lb.map(e => e.id)).toEqual(['D', 'A', 'C', 'B'])
    for (const e of lb) expect(e.stablefordPts).toBe(PUNTOS_ESPERADOS_LEONES[e.id as 'A'])
  })

  it('gross vs net: un jugador con course handicap 21 (índice 18) saca EXACTAMENTE lo mismo que uno sin índice', () => {
    const conIndice = jugador('A', TARJETAS_LEONES.A, 18)
    const sinIndice = jugador('A0', TARJETAS_LEONES.A, 0)
    const lb = leaderboard([conIndice, sinIndice], { A: 21, A0: 0 })
    const pts = Object.fromEntries(lb.map(e => [e.id, e.stablefordPts]))
    expect(pts.A).toBe(36)
    expect(pts.A0).toBe(36)
  })

  it('el course handicap ausente del mapa (cae a jugador.handicap) tampoco da golpes en gross', () => {
    const lb = leaderboard([jugador('B', TARJETAS_LEONES.B, 18)], {})
    expect(lb[0].stablefordPts).toBe(18)
  })

  it('pickup = anotar doble bogey (0 pts): C con el hoyo 1 en par+2 → 26 y la ronda sigue', () => {
    const c = { ...TARJETAS_LEONES.C, '1': PAR_LEONES[1] + 2 }
    const lb = leaderboard([jugador('C', c, 0)], { C: 0 })
    expect(lb[0].stablefordPts).toBe(26)
    expect(lb[0].holesPlayed).toBe(18)
  })

  it('a mitad de ronda (9 hoyos) la tabla no muestra -72: vs par contra el par jugado', () => {
    const a9 = Object.fromEntries(Object.entries(TARJETAS_LEONES.A).filter(([h]) => Number(h) <= 9))
    const lb = leaderboard([jugador('A', a9, 0)], { A: 0 })
    expect(lb[0].stablefordPts).toBe(18)
    expect(lb[0].vsParGross).toBe(0)
    expect(lb[0].holesPlayed).toBe(9)
  })

  it('NETO no cambia: con course handicap 21 el par en los 18 suma más de 36', () => {
    const lb = leaderboard([jugador('A', TARJETAS_LEONES.A, 18)], { A: 21 }, 'neto')
    expect(lb[0].stablefordPts).toBeGreaterThan(36)
  })
})
