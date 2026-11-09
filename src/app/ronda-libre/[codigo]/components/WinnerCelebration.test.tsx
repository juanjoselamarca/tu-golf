// 09-nov-2026 (R4794T) — Desde que un formato por equipos se puede jugar con un solo
// equipo contra el par, el cuadro de ronda finalizada no puede decir "Equipo ganador"
// cuando no hubo rival. Con dos equipos sigue coronando al primero (fix 128).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WinnerCelebration } from './WinnerCelebration'
import type { RondaLibre } from '@/types/ronda'
import type { TeamShareRow } from '@/lib/ronda/team-ranking'

const ronda = {
  id: 'r1', codigo: 'SCR1', course_name: 'Los Leones', course_id: 'c1', tees: 'blanco', holes: 18, hoyo_inicio: 1,
  fecha: '2026-11-07', estado: 'finalizada', modo_juego: 'gross', formato_juego: 'scramble', ronda_libre_jugadores: [],
} as unknown as RondaLibre

const equipo = (nombre: string, diff: number, jugadores: string[]): TeamShareRow => ({ nombre, jugadores, score: 72 + diff, diff })

function pintar(teams: TeamShareRow[]) {
  render(<WinnerCelebration ronda={ronda} leaderboard={[]} fechaDisplay="7 nov" onShare={() => {}} teams={teams} />)
}

describe('WinnerCelebration — formatos por equipo', () => {
  it('un solo equipo juega contra el par: no hay "Equipo ganador"', () => {
    pintar([equipo('Equipo 1', 3, ['Cristián', 'Compañero'])])
    expect(screen.getByText('Contra el par')).toBeTruthy()
    expect(screen.queryByText(/equipo ganador/i)).toBeNull()
    expect(screen.getByText('Equipo 1')).toBeTruthy()
    expect(screen.getByText('Cristián · Compañero')).toBeTruthy()
    expect(screen.getByText('+3')).toBeTruthy()
  })

  it('con dos equipos corona al primero del ranking', () => {
    pintar([equipo('Los Cóndores', -2, ['A', 'B']), equipo('Las Águilas', 1, ['C', 'D'])])
    expect(screen.getByText('Equipo ganador')).toBeTruthy()
    expect(screen.getByText('Los Cóndores')).toBeTruthy()
    expect(screen.queryByText('Contra el par')).toBeNull()
  })

  it('dos equipos con el mismo diff es empate', () => {
    pintar([equipo('Uno', 0, ['A', 'B']), equipo('Dos', 0, ['C', 'D'])])
    expect(screen.getByText('Empate')).toBeTruthy()
    expect(screen.getByText('Uno y Dos')).toBeTruthy()
  })
})
