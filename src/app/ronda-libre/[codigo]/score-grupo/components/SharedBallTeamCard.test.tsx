// #602 — Tarjeta del equipo (scramble / foursome) en el scorer de grupo.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SharedBallTeamCard } from './SharedBallTeamCard'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'
import { hoyosDeBolaCompartida, totalesBolaCompartida } from '@/golf/formats'
import type { HoleData } from '@/types/ronda'

const ordenHoyos = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const holeDataMap: Record<number, HoleData> = Object.fromEntries(
  ordenHoyos.map(h => [h, { numero: h, par: 4, stroke_index: h * 2 - 1, yardaje: null }]),
)
const parMap = Object.fromEntries(ordenHoyos.map(h => [h, 4]))
const equipo = {
  id: 'e1', nombre: 'Padre e hijo', handicap_equipo: 10, handicap_equipo_juego: null, jugadorIds: ['a', 'b'], jugadorNombres: ['Juan', 'Juanito'],
  scores: Object.fromEntries(ordenHoyos.map(h => [String(h), 5])),
}

const pintar = (modoJuego: 'gross' | 'neto') => render(
  <SharedBallTeamCard
    equipo={equipo} formatoJuego="scramble" modoJuego={modoJuego} currentHole={9} par={4}
    totales={totalesBolaCompartida('scramble', equipo, hoyosDeBolaCompartida(ordenHoyos, parMap, holeDataMap))}
    foursomeInvertido={false} onToggleInvertido={() => {}} onChange={() => {}} theme={SCORER_THEME}
  />,
)

describe('SharedBallTeamCard — totales del equipo', () => {
  it('neto 9h: muestra el NETO del motor (mitad del handicap 18h) y el gross como secundario', () => {
    pintar('neto')
    expect(screen.getByText('Neto')).toBeTruthy()
    expect(screen.getByText('+4')).toBeTruthy()          // 45 − 5 golpes − 36
    expect(screen.getByText('Gross +9 · 45')).toBeTruthy()
    expect(screen.getByText('HCP 10')).toBeTruthy()      // escala 18h, igual que el board
  })
  it('gross: el vs par gross, sin "Neto" ni chip de handicap (no juega)', () => {
    pintar('gross')
    expect(screen.getByText('+9')).toBeTruthy()
    expect(screen.getByText('45')).toBeTruthy()
    expect(screen.queryByText('Neto')).toBeNull()
    expect(screen.queryByText(/^HCP/)).toBeNull()
  })
})

describe('SharedBallTeamCard — equipo de club (scramble rápido)', () => {
  const deClub = {
    ...equipo, nombre: 'Los Tigres', handicap_equipo: 8, handicap_equipo_juego: 8,
    handicap_origen: 'club' as const, jugadorIds: ['creador'], jugadorNombres: ['Juanjo'],
  }
  const pintarDeClub = (modoJuego: 'gross' | 'neto') => render(
    <SharedBallTeamCard
      equipo={deClub} formatoJuego="scramble" modoJuego={modoJuego} currentHole={9} par={4}
      totales={totalesBolaCompartida('scramble', deClub, hoyosDeBolaCompartida(ordenHoyos, parMap, holeDataMap))}
      foursomeInvertido={false} onToggleInvertido={() => {}} onChange={() => {}} theme={SCORER_THEME}
    />,
  )

  it('no muestra al creador como integrante: solo el nombre del equipo y su HCP del club', () => {
    pintarDeClub('neto')
    expect(screen.getByText('Los Tigres')).toBeTruthy()
    expect(screen.queryByText('Juanjo')).toBeNull()
    expect(screen.getByText('HCP 8')).toBeTruthy()
  })

  it('en gross tampoco muestra integrantes ni HCP, y no deja una fila vacía bajo el nombre', () => {
    pintarDeClub('gross')
    expect(screen.queryByText('Juanjo')).toBeNull()
    expect(screen.queryByText(/^HCP/)).toBeNull()
    expect(screen.getByText('Los Tigres').nextElementSibling).toBeNull()
  })
})
