// 09-nov-2026 (R4794T) — Desde que un formato por equipos se puede jugar con un solo
// equipo contra el par, el cuadro de ronda finalizada no puede decir "Equipo ganador"
// cuando no hubo rival. Con dos equipos sigue coronando al primero (fix 128).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WinnerCelebration } from './WinnerCelebration'
import type { RondaLibre } from '@/types/ronda'
import type { TeamShareRow } from '@/lib/ronda/team-ranking'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(cleanup)

const ronda = {
  id: 'r1', codigo: 'SCR1', course_name: 'Los Leones', course_id: 'c1', tees: 'blanco', holes: 18, hoyo_inicio: 1,
  fecha: '2026-11-07', estado: 'finalizada', modo_juego: 'gross', formato_juego: 'scramble', ronda_libre_jugadores: [],
} as unknown as RondaLibre

const equipo = (nombre: string, diff: number, jugadores: string[], holesPlayed = 18): TeamShareRow =>
  ({ nombre, jugadores, score: holesPlayed === 0 ? 0 : 72 + diff, diff, holesPlayed })

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

describe('WinnerCelebration — equipo que no anotó nada', () => {
  it('no empata con el líder aunque los dos digan E, y no es el ganador', () => {
    pintar([equipo('Jugó', 0, ['A', 'B']), equipo('Vacío', 0, ['C', 'D'], 0)])
    expect(screen.getByText('Equipo ganador')).toBeTruthy()
    expect(screen.getByText('Jugó')).toBeTruthy()
    expect(screen.queryByText('Empate')).toBeNull()
  })

  it('si ningún equipo anotó un hoyo no hay cuadro: ni "ganador" ni "contra el par"', () => {
    const { container } = render(
      <WinnerCelebration ronda={ronda} leaderboard={[]} fechaDisplay="7 nov" onShare={() => {}}
        teams={[equipo('Uno', 0, ['A', 'B'], 0), equipo('Dos', 0, ['C', 'D'], 0)]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('tres equipos empatados se nombran con comas y una "y"', () => {
    pintar([equipo('Uno', 0, ['A']), equipo('Dos', 0, ['B']), equipo('Tres', 0, ['C'])])
    expect(screen.getByText('Uno, Dos y Tres')).toBeTruthy()
  })
})

describe('WinnerCelebration — individual: el empate es el de la tabla', () => {
  const strokePlay = { ...ronda, formato_juego: 'stroke_play' } as unknown as RondaLibre
  const parMap = { 1: 4, 2: 4 }
  const siMap = { 1: 1, 2: 2 }
  const jugador = (id: string, nombre: string, scores: Record<string, number>) => ({ id, nombre, scores, handicap: 0 })
  const tabla = (jugadores: ReturnType<typeof jugador>[]) => buildLeaderboard({
    jugadores, holes: 2, parMap, siMap, courseHcpMap: {}, modoJuego: 'gross', formatoJuego: 'stroke_play',
  } as unknown as Parameters<typeof buildLeaderboard>[0])

  it('premisa: un inscrito sin hoyos tiene vs par 0, igual que un líder en E', () => {
    const lb = tabla([jugador('a', 'Juan Pérez', { 1: 4, 2: 4 }), jugador('b', 'Diego Soto', {})])
    expect(lb.map(j => [j.vsPar, j.holesPlayed])).toEqual([[0, 2], [0, 0]])
  })

  it('líder en E y un inscrito sin hoyos: "Ganador · Juan", no "Empate · Juan y Diego"', () => {
    const lb = tabla([jugador('a', 'Juan Pérez', { 1: 4, 2: 4 }), jugador('b', 'Diego Soto', {})])
    render(<WinnerCelebration ronda={strokePlay} leaderboard={lb} fechaDisplay="7 nov" onShare={() => {}} />)
    expect(screen.getByText('Ganador')).toBeTruthy()
    expect(screen.getByText('Juan Pérez')).toBeTruthy()
    expect(screen.queryByText('Empate')).toBeNull()
  })

  it('dos en E con hoyos y uno sin hoyos: empate de los dos que anotaron', () => {
    const lb = tabla([jugador('a', 'Juan Pérez', { 1: 4, 2: 4 }), jugador('b', 'Pedro Lagos', { 1: 5, 2: 3 }), jugador('c', 'Diego Soto', {})])
    render(<WinnerCelebration ronda={strokePlay} leaderboard={lb} fechaDisplay="7 nov" onShare={() => {}} />)
    expect(screen.getByText('Empate')).toBeTruthy()
    expect(screen.getByText('Juan y Pedro')).toBeTruthy()
  })

  it('nadie anotó: no hay cuadro', () => {
    const lb = tabla([jugador('a', 'Juan Pérez', {}), jugador('b', 'Diego Soto', {})])
    const { container } = render(<WinnerCelebration ronda={strokePlay} leaderboard={lb} fechaDisplay="7 nov" onShare={() => {}} />)
    expect(container.textContent).toBe('')
  })
})
