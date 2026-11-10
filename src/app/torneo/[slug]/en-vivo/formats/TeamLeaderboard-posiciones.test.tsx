import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import TeamLeaderboard from './TeamLeaderboard'
import type { LiveTeam } from '../types'

const t = (id: string, vs_par: number, thru: number): LiveTeam => ({
  id, name: id, players: [], team_scores_per_hole: [], team_total: 0, vs_par, thru,
})
const filas = () =>
  Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
    const celdas = tr.querySelectorAll('td')
    return `${celdas[0]?.textContent} ${celdas[1]?.textContent}`
  })

afterEach(cleanup)

describe('TeamLeaderboard del torneo en vivo — posiciones con empate', () => {
  it('mismo vs par = T2/T2 aunque lleven distintos hoyos; el que no salió va al final con —', () => {
    render(<TeamLeaderboard holeCount={18} teams={[t('Sin salir', 0, 0), t('B', 1, 9), t('A', -1, 9), t('C', 1, 12), t('D', 3, 9)]} />)
    // Antes el equipo sin hoyos (vs par 0) quedaba entre A y B y empataba "E".
    expect(filas()).toEqual(['1 A', 'T2 C', 'T2 B', '4 D', '— Sin salir'])
  })
})
