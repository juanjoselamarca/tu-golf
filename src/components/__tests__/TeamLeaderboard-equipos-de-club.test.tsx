import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import TeamLeaderboard from '../TeamLeaderboard'

const equipo = (teamNombre: string, jugadores: string[], teamHandicap?: number) => ({
  teamId: teamNombre, teamNombre, totalGross: 40, totalNeto: 36, totalStableford: 0,
  overUnderGross: 4, overUnderNeto: 0, holesPlayed: 9, jugadores, teamHandicap,
})

afterEach(cleanup)

describe('TeamLeaderboard — equipos de club (sin integrantes a la vista)', () => {
  it('muestra solo "HCP 8", pegado a la izquierda, sin el hueco de una lista de integrantes vacía', () => {
    render(<TeamLeaderboard modoJuego="neto" totalHoles={9} formato="scramble" teams={[equipo('Los Tigres', [], 8)]} />)
    const hcp = screen.getByText('HCP 8')
    expect(hcp.parentElement?.textContent).toBe('HCP 8')
    expect(hcp.style.marginLeft).toBe('0px')
  })

  it('sin integrantes ni HCP (gross) no deja una línea vacía bajo el nombre', () => {
    render(<TeamLeaderboard modoJuego="gross" totalHoles={9} formato="scramble" teams={[equipo('Los Pumas', [])]} />)
    const nombre = screen.getByText('Los Pumas')
    expect(nombre.parentElement?.children).toHaveLength(1)
  })

  it('un equipo con jugadores sigue mostrando la lista y el HCP separado', () => {
    render(<TeamLeaderboard modoJuego="neto" totalHoles={9} formato="scramble" teams={[equipo('Team A', ['Ana', 'Diego'], 6)]} />)
    expect(screen.getByText('HCP 6').parentElement?.textContent).toBe('Ana · DiegoHCP 6')
    expect(screen.getByText('HCP 6').style.marginLeft).toBe('6px')
  })
})
