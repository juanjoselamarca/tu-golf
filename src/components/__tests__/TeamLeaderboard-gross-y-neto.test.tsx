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
  it('tabla NETO: la columna dice Neto y bajo cada neto va su gross rotulado', () => {
    render(<TeamLeaderboard modoJuego="neto" totalHoles={18} formato="scramble" teams={[equipo('Los Ross', -7, 1), equipo('Los Lamarca', -5, 1)]} />)
    expect(screen.getByText('-7')).toBeTruthy()
    expect(screen.getByText('-5')).toBeTruthy()
    expect(screen.getAllByText('Gross +1')).toHaveLength(2)
    expect(screen.getAllByText('Neto').length).toBeGreaterThanOrEqual(2) // pill del modo + columna
  })
  it('tabla GROSS: la columna dice Gross y no hay segunda línea', () => {
    render(<TeamLeaderboard modoJuego="gross" totalHoles={18} formato="scramble" teams={[equipo('A', -7, 1)]} />)
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.queryByText(/^Gross [+-E]/)).toBeNull()
    expect(screen.getAllByText('Gross').length).toBeGreaterThanOrEqual(2)
  })
  it('un equipo sin hoyos no muestra un gross inventado', () => {
    render(<TeamLeaderboard modoJuego="neto" totalHoles={18} formato="scramble" teams={[equipo('A', -2, 0), equipo('B', 0, 0, 0)]} />)
    expect(screen.getAllByText(/^Gross /)).toHaveLength(1)
  })
  it('el score usa los tokens con tema (no un hex fijo que en oscuro queda a ~3:1)', () => {
    render(<TeamLeaderboard modoJuego="neto" totalHoles={18} formato="scramble" teams={[equipo('Los Ross', -7, 1), equipo('Los Lamarca', 1, 3)]} />)
    expect((screen.getByText('-7') as HTMLElement).style.color).toBe('var(--score-eagle-fg)')
    expect((screen.getByText('+1') as HTMLElement).style.color).toBe('var(--score-bogey-fg)')
  })
})
