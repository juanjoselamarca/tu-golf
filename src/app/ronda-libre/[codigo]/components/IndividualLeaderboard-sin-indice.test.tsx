// #511 + 19-oct — Columna HCP de la vista en vivo de una ronda libre. Nunca un 0
// inventado como si fuera el handicap:
//  - sabemos que no tiene índice (invitado sin índice, o perfil leído sin índice) → "S/Ind";
//  - no se puede saber (jugador con cuenta y visor anónimo: no lee perfiles) → "—".
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { IndividualLeaderboard } from './IndividualLeaderboard'
import { HcpCelda } from './HcpCelda'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import type { RondaLibre } from '@/types/ronda'
import { crearHcpAMostrar, SIN_INDICE } from '@/lib/data/ronda-libre-live-api'

const parMap = { 1: 4, 2: 4, 3: 4 }
const siMap = { 1: 1, 2: 2, 3: 3 }
const jugadores = [
  { id: 'j1', nombre: 'Ana Cuenta', user_id: 'u1', handicap: null, tees: null, scores: { 1: 5, 2: 5, 3: 5 } },
  { id: 'j2', nombre: 'Bea Invitada', user_id: null, handicap: 12, tees: null, scores: { 1: 5, 2: 5, 3: 5 } },
  { id: 'j3', nombre: 'Coni Invitada', user_id: null, handicap: null, tees: null, scores: { 1: 5, 2: 5, 3: 5 } },
]
const ronda = {
  id: 'r1', codigo: 'ABC123', course_name: 'Los Leones', course_id: 'c1', tees: 'azul', holes: 18, hoyo_inicio: 1,
  fecha: '2026-10-30', estado: 'en_curso', modo_juego: 'gross', formato_juego: 'stroke_play', ronda_libre_jugadores: jugadores,
} as unknown as RondaLibre
const courseHcpMap = { j1: 0, j2: 13, j3: 0 }
const displayHcpMap = { j1: 0, j2: 13, j3: 0 }
const leaderboard = buildLeaderboard({
  jugadores: jugadores as never, holes: 18, hoyoInicio: 1, parMap, siMap, courseHcpMap, modoJuego: 'gross', formatoJuego: 'stroke_play',
})

const pintar = (sinIndice: string[], perfilLeido: ReadonlySet<string> | 'todos' = new Set()) => render(
  <IndividualLeaderboard
    ronda={ronda} leaderboard={leaderboard} isNetoMode={false} hasCourse parMap={parMap} siMap={siMap}
    courseHcpMap={courseHcpMap} hcpAMostrar={crearHcpAMostrar(jugadores, displayHcpMap, sinIndice, perfilLeido)}
    fechaDisplay="30 oct" expanded={null} onToggleExpand={() => {}}
  />,
)

const filaDe = (nombre: string) => screen.getAllByText(nombre)[0].closest('button, [role="button"], div[style*="grid"]') as HTMLElement

describe('IndividualLeaderboard (ronda libre) — HCP de un jugador sin índice', () => {
  it('visor anónimo: la cuenta sin índice legible sale "—"; la invitada sin índice, "S/Ind"; nadie con 0', () => {
    pintar(['j1', 'j3'])
    expect(screen.getByText('HCP')).toBeTruthy()
    const ana = filaDe('Ana Cuenta')
    expect(within(ana).getByText('Índice no visible')).toBeTruthy()
    expect(within(ana).queryByText('0')).toBeNull()
    const coni = filaDe('Coni Invitada')
    expect(within(coni).getByText(SIN_INDICE)).toBeTruthy()
    expect(within(coni).queryByText('0')).toBeNull()
    expect(within(filaDe('Bea Invitada')).getByText('13')).toBeTruthy()
  })

  it('visor con sesión que leyó el perfil de Ana: ella también sale "S/Ind"', () => {
    pintar(['j1', 'j3'], new Set(['j1']))
    expect(within(filaDe('Ana Cuenta')).getByText(SIN_INDICE)).toBeTruthy()
  })

  it('discrimina: sin sinIndice la celda muestra el 0 de scoring', () => {
    pintar([])
    expect(within(filaDe('Ana Cuenta')).getByText('0')).toBeTruthy()
  })
})

describe('crearHcpAMostrar (fuente única del HCP a mostrar)', () => {
  const js = [
    { id: 'a', user_id: 'u-a', handicap: null },
    { id: 'b', handicap: 11.6 },
    { id: 'c', handicap: null },
    { id: 'd', user_id: null, handicap: null },
  ]
  it('cuenta en sinIndice sin perfil leído → null aunque haya un 0 en el mapa (no se sabe si tiene)', () => {
    expect(crearHcpAMostrar(js, { a: 0 }, ['a'], new Set())('a')).toBeNull()
  })
  it('cuenta en sinIndice con perfil leído (por id o "todos") → SIN_INDICE', () => {
    expect(crearHcpAMostrar(js, { a: 0 }, ['a'], new Set(['a']))('a')).toBe(SIN_INDICE)
    expect(crearHcpAMostrar(js, { a: 0 }, ['a'], 'todos')('a')).toBe(SIN_INDICE)
  })
  it('invitado (índice no viene del perfil) en sinIndice → SIN_INDICE aunque el visor sea anónimo', () => {
    expect(crearHcpAMostrar(js, { d: 0 }, ['d'], new Set())('d')).toBe(SIN_INDICE)
  })
  it('course handicap a mostrar resuelto → ese número', () => {
    expect(crearHcpAMostrar(js, { b: 14 }, [], new Set())('b')).toBe(14)
  })
  it('sin mapa: cae al handicap de tarjeta redondeado; sin nada → null (nunca 0 de relleno)', () => {
    const h = crearHcpAMostrar(js, {}, [], new Set())
    expect(h('b')).toBe(12)
    expect(h('c')).toBeNull()
  })
})

// La celda que pintan la columna del leaderboard y la tarjeta de match play.
describe('HcpCelda', () => {
  it('null → "—" con texto accesible "Índice no visible"', () => {
    render(<span data-testid="c"><HcpCelda hcp={null} /></span>)
    expect(within(screen.getByTestId('c')).getByText('—').getAttribute('aria-hidden')).toBe('true')
    expect(within(screen.getByTestId('c')).getByText('Índice no visible')).toBeTruthy()
  })
  it('SIN_INDICE → "S/Ind" con texto accesible "Sin índice"', () => {
    render(<span data-testid="c"><HcpCelda hcp={SIN_INDICE} /></span>)
    expect(within(screen.getByTestId('c')).getByText('S/Ind')).toBeTruthy()
    expect(within(screen.getByTestId('c')).getByText('Sin índice')).toBeTruthy()
  })
  it('número → el número', () => {
    render(<span data-testid="c"><HcpCelda hcp={13} /></span>)
    expect(screen.getByTestId('c').textContent).toBe('13')
  })
})
