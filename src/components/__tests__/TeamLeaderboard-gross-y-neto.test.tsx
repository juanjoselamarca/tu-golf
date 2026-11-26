// Ensayo 24-nov (scramble neto de club): el espectador veía un solo número y no sabía si era el gross o el neto.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import TeamLeaderboard from '../TeamLeaderboard'

const equipo = (teamNombre: string, overUnderNeto: number, overUnderGross: number, holesPlayed = 18) => ({
  teamId: teamNombre, teamNombre, totalGross: 72 + overUnderGross, totalNeto: 72 + overUnderNeto, totalStableford: 0,
  overUnderGross, overUnderNeto, holesPlayed, jugadores: [], teamHandicap: 8,
})

afterEach(cleanup)

describe('TeamLeaderboard — gross y neto rotulados', () => {
  it('tabla NETO: columnas Neto y Gross, una al lado de la otra (como el PGA Tour)', () => {
    render(<TeamLeaderboard modoJuego="neto" totalHoles={18} formato="scramble" teams={[equipo('Los Ross', -7, 1), equipo('Los Lamarca', -5, 2)]} />)
    expect(screen.getByText('-7')).toBeTruthy()
    expect(screen.getByText('-5')).toBeTruthy()
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy()
    expect(screen.getAllByText('Neto').length).toBeGreaterThanOrEqual(2) // pill del modo + columna
    expect(screen.getByText('Gross')).toBeTruthy() // cabecera de la columna
  })
  it('tabla GROSS: una sola columna de score, sin columna Gross aparte', () => {
    render(<TeamLeaderboard modoJuego="gross" totalHoles={18} formato="scramble" teams={[equipo('A', -7, 1)]} />)
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.getAllByText('Gross')).toHaveLength(2) // pill del modo + columna de score
  })
  it('un equipo sin hoyos no muestra un gross inventado', () => {
    render(<TeamLeaderboard modoJuego="neto" totalHoles={18} formato="scramble" teams={[equipo('A', -2, 0), equipo('B', 0, 0, 0)]} />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2) // posición y gross del que no salió
    expect(screen.getAllByText('E')).toHaveLength(2) // gross de A y el neto en blanco de B (sin cambios)
  })
  it('con tarjeta: la fila se toca, anuncia si está abierta y despliega el detalle', () => {
    let abierto: string | null = null
    const { rerender } = render(<TeamLeaderboard modoJuego="neto" totalHoles={18} formato="scramble" teams={[equipo('Los Ross', -7, 1)]}
      expandedTeamId={abierto} onToggleTeam={(id) => { abierto = id }} renderTeamDetail={() => <p>tarjeta</p>} />)
    const fila = screen.getByRole('button', { name: /Los Ross: ver tarjeta/ })
    expect(fila.getAttribute('aria-expanded')).toBe('false')
    fila.click()
    rerender(<TeamLeaderboard modoJuego="neto" totalHoles={18} formato="scramble" teams={[equipo('Los Ross', -7, 1)]}
      expandedTeamId={abierto} onToggleTeam={(id) => { abierto = id }} renderTeamDetail={() => <p>tarjeta</p>} />)
    expect(screen.getByText('tarjeta')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Los Ross: ocultar tarjeta/ }).getAttribute('aria-expanded')).toBe('true')
  })
  it('el score usa los tokens con tema (no un hex fijo que en oscuro queda a ~3:1)', () => {
    render(<TeamLeaderboard modoJuego="neto" totalHoles={18} formato="scramble" teams={[equipo('Los Ross', -7, 2), equipo('Los Lamarca', 1, 3)]} />)
    expect((screen.getByText('-7') as HTMLElement).style.color).toBe('var(--score-eagle-fg)')
    expect((screen.getByText('+1') as HTMLElement).style.color).toBe('var(--score-bogey-fg)')
  })
})
