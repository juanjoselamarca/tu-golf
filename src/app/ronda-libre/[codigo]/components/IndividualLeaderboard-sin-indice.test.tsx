// #511 — Columna HCP de la vista en vivo de una ronda libre: un jugador cuyo índice
// no se declaró o no es legible para este visor (anónimo: `profiles` le devuelve 0
// filas) sale "—", nunca un 0 inventado como si fuera su handicap.
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { IndividualLeaderboard } from './IndividualLeaderboard'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import type { RondaLibre } from '@/types/ronda'
import { crearHcpAMostrar } from '@/lib/data/ronda-libre-live-api'

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

const pintar = (sinIndice: string[], expanded: string | null = null) => render(
  <IndividualLeaderboard
    ronda={ronda} leaderboard={leaderboard} isNetoMode={false} hasCourse parMap={parMap} siMap={siMap}
    courseHcpMap={courseHcpMap} hcpAMostrar={crearHcpAMostrar(jugadores, displayHcpMap, sinIndice)}
    fechaDisplay="30 oct" expanded={expanded} onToggleExpand={() => {}}
  />,
)

const filaDe = (nombre: string) => screen.getAllByText(nombre)[0].closest('button, [role="button"], div[style*="grid"]') as HTMLElement

describe('IndividualLeaderboard (ronda libre) — HCP de un jugador sin índice', () => {
  it('jugador en sinIndice → "—" (Sin índice), no 0; el de índice declarado muestra su HCP', () => {
    pintar(['j1'])
    expect(screen.getByText('HCP')).toBeTruthy()
    const ana = filaDe('Ana Cuenta')
    expect(within(ana).getByText('Sin índice')).toBeTruthy()
    expect(within(ana).queryByText('0')).toBeNull()
    expect(within(filaDe('Bea Invitada')).getByText('13')).toBeTruthy()
  })

  it('discrimina: sin sinIndice la celda muestra el 0 de scoring', () => {
    pintar([])
    expect(within(filaDe('Ana Cuenta')).getByText('0')).toBeTruthy()
  })
})

describe('crearHcpAMostrar (fuente única del HCP a mostrar)', () => {
  const js = [{ id: 'a', handicap: null }, { id: 'b', handicap: 11.6 }, { id: 'c', handicap: null }]
  it('sinIndice → null aunque haya un 0 en el mapa (su 0 de scoring no es un handicap)', () => {
    expect(crearHcpAMostrar(js, { a: 0 }, ['a'])('a')).toBeNull()
  })
  it('course handicap a mostrar resuelto → ese número', () => {
    expect(crearHcpAMostrar(js, { b: 14 }, [])('b')).toBe(14)
  })
  it('sin mapa: cae al handicap de tarjeta redondeado; sin nada → null (nunca 0 de relleno)', () => {
    const h = crearHcpAMostrar(js, {}, [])
    expect(h('b')).toBe(12)
    expect(h('c')).toBeNull()
  })
})
