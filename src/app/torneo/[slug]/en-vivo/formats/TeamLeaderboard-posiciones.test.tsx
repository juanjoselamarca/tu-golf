import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import TeamLeaderboard from './TeamLeaderboard'
import type { LiveTeam } from '../types'
import { rankTeamsWithCountback } from '@/golf/leaderboard/team-tiebreak'

const t = (id: string, vs_par: number, thru: number, clave_empate?: string | null): LiveTeam => ({
  id, name: id, players: [], team_scores_per_hole: [], team_total: 0, vs_par, thru, clave_empate,
})
const filas = () =>
  Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
    const celdas = tr.querySelectorAll('td')
    return `${celdas[0]?.textContent} ${celdas[1]?.textContent}`
  })

afterEach(cleanup)

describe('TeamLeaderboard del torneo en vivo — posiciones con empate', () => {
  it('respeta el orden del motor y su clave: mismo vs par en cancha = T2/T2; el que no salió, —', () => {
    render(<TeamLeaderboard holeCount={18} teams={[
      t('A', -1, 9, '0#0'), t('C', 1, 12, '1#0'), t('B', 1, 9, '1#0'), t('D', 3, 9, '2#0'), t('Sin salir', 0, 0, null),
    ]} />)
    expect(filas()).toEqual(['1 A', 'T2 C', 'T2 B', '4 D', '— Sin salir'])
  })

  it('scramble cerrado, dos equipos empatados que separa el countback: 1 y 2, igual que el podio', () => {
    const hoyosA = [4, 4, 4, 4, 4, 4, 3, 3, 3]
    const hoyosB = [3, 3, 3, 4, 4, 4, 4, 4, 4]
    const motor = rankTeamsWithCountback(
      [{ id: 'B', vs: -3, hoyos: hoyosB }, { id: 'A', vs: -3, hoyos: hoyosA }],
      { mode: 'lower_wins', primaryScore: (x) => x.vs, holeScores: (x) => x.hoyos, holesPlayed: (x) => x.hoyos.length },
    )
    render(<TeamLeaderboard holeCount={9} teams={motor.map((m) => t(m.id, m.vs, 9, m.claveEmpate))} />)
    expect(filas()).toEqual(['1 A', '2 B'])
  })

  it('respuesta cacheada sin clave_empate: cae a comparar vs par', () => {
    render(<TeamLeaderboard holeCount={18} teams={[t('A', -1, 9), t('C', 1, 12), t('B', 1, 9), t('Sin salir', 0, 0)]} />)
    expect(filas()).toEqual(['1 A', 'T2 C', 'T2 B', '— Sin salir'])
  })
})
