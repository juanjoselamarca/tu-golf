import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import TeamLeaderboard from '../TeamLeaderboard'

const equipo = (teamId: string, overUnderGross: number, holesPlayed: number) => ({
  teamId, teamNombre: teamId, totalGross: 72 + overUnderGross, totalNeto: 72 + overUnderGross, totalStableford: 0,
  overUnderGross, overUnderNeto: overUnderGross, holesPlayed, jugadores: [],
})

afterEach(cleanup)

describe('TeamLeaderboard de la ronda libre — posiciones', () => {
  it('respeta el orden del motor; mismo vs par = T2 y T2; el que no salió, "—" al final', () => {
    const { container } = render(
      <TeamLeaderboard modoJuego="gross" totalHoles={18} formato="scramble" teams={[
        equipo('A', -2, 18), equipo('B', 1, 18), equipo('C', 1, 18), equipo('D', 4, 18), equipo('Sin salir', 0, 0),
      ]} />,
    )
    const filas = Array.from(container.querySelectorAll('[style*="grid-template-columns: 36px"]')).slice(1)
    expect(filas.map((f) => `${f.children[0].textContent} ${f.children[1].textContent?.split('▼')[0].trim()}`))
      .toEqual(['1 A', 'T2 B', 'T2 C', '4 D', '— Sin salir'])
  })
})
