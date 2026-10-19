// #511 — Columna HCP de la vista en vivo de una ronda libre: un jugador cuyo índice
// no se declaró o no es legible para este visor (anónimo: `profiles` le devuelve 0
// filas) sale "—", nunca un 0 inventado como si fuera su handicap.
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { IndividualLeaderboard } from './IndividualLeaderboard'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import type { RondaLibre } from '@/types/ronda'

const parMap = { 1: 4, 2: 4, 3: 4 }
const siMap = { 1: 1, 2: 2, 3: 3 }
const jugadores = [
  { id: 'j1', nombre: 'Ana Cuenta', user_id: 'u1', handicap: null, tees: null, scores: { 1: 5, 2: 5, 3: 5 } },
  { id: 'j2', nombre: 'Bea Invitada', user_id: null, handicap: 12, tees: null, scores: { 1: 5, 2: 5, 3: 5 } },
]
const ronda = {
  id: 'r1', codigo: 'ABC123', course_name: 'Los Leones', course_id: 'c1', tees: 'azul', holes: 18, hoyo_inicio: 1,
  fecha: '2026-10-30', estado: 'en_curso', modo_juego: 'gross', formato_juego: 'stroke_play', ronda_libre_jugadores: jugadores,
} as unknown as RondaLibre
const courseHcpMap = { j1: 0, j2: 13 }
const displayHcpMap = { j1: 0, j2: 13 }
const leaderboard = buildLeaderboard({
  jugadores: jugadores as never, holes: 18, hoyoInicio: 1, parMap, siMap, courseHcpMap, modoJuego: 'gross', formatoJuego: 'stroke_play',
})

const pintar = (sinIndice?: string[]) => render(
  <IndividualLeaderboard
    ronda={ronda} leaderboard={leaderboard} isNetoMode={false} hasCourse parMap={parMap} siMap={siMap}
    courseHcpMap={courseHcpMap} displayHcpMap={displayHcpMap} sinIndice={sinIndice}
    fechaDisplay="30 oct" expanded={null} onToggleExpand={() => {}}
  />,
)

const filaDe = (nombre: string) => screen.getByText(nombre).closest('button, [role="button"], div[style*="grid"]') as HTMLElement

describe('IndividualLeaderboard (ronda libre) — HCP de un jugador sin índice', () => {
  it('jugador en sinIndice → "—" (Sin índice), no 0; el de índice declarado muestra su HCP', () => {
    pintar(['j1'])
    expect(screen.getByText('HCP')).toBeTruthy()
    const ana = filaDe('Ana Cuenta')
    expect(within(ana).getByText('Sin índice')).toBeTruthy()
    expect(within(ana).queryByText('0')).toBeNull()
    expect(within(filaDe('Bea Invitada')).getByText('13')).toBeTruthy()
  })

  it('discrimina: sin la lista sinIndice la celda caería al 0 de scoring', () => {
    pintar()
    expect(within(filaDe('Ana Cuenta')).getByText('0')).toBeTruthy()
  })
})
