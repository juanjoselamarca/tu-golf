// Hunter 08-nov-2026: en un torneo con un invitado sin cuenta (players.user_id null,
// player_name "Invitado Hunter"), el carrusel del scoring del organizador mostraba
// "?" de inicial y "—" de nombre, y la cabecera de la tarjeta quedaba en blanco.
// El board público y /en-vivo ya lo llamaban por su nombre (resolveLegacyPlayerName):
// el mismo jugador con dos identidades según la pantalla.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ScoringPlayer, ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'
import { PlayerCards } from './PlayerCards'
import { ScorecardPanel } from './ScorecardPanel'

vi.mock('./HoleStatsTable', () => ({ HoleStatsTable: () => null }))
// jsdom no trae ResizeObserver; el carrusel lo usa para las flechas de scroll.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

const invitado = {
  id: 'inv', user_id: null, player_name: 'Invitado Hunter', profiles: null,
  handicap_at_registration: 12, rounds: [],
} as unknown as ScoringPlayer
const registrado = {
  id: 'reg', user_id: 'u1', player_name: null, profiles: { name: 'E2E Test' },
  handicap_at_registration: 15, rounds: [],
} as unknown as ScoringPlayer

function renderCards(players: ScoringPlayer[]) {
  render(
    <PlayerCards
      players={players}
      selectedId={null}
      holeCount={9}
      filledCount={0}
      getActiveRound={() => undefined}
      hasScoresLoaded={false}
      roundHoleCounts={new Map()}
      onSelect={() => {}}
    />,
  )
}

describe('Scoring del organizador — nombre del invitado sin cuenta', () => {
  it('el carrusel muestra el nombre de inscripción del invitado, no "? —"', () => {
    renderCards([registrado, invitado])
    expect(screen.getByText('Invitado')).toBeTruthy()
    expect(screen.getByText('IH')).toBeTruthy()
    expect(screen.getByText('E2E')).toBeTruthy()
    expect(screen.getByText('ET')).toBeTruthy()
    expect(screen.queryByText('?')).toBeNull()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('un inscrito sin perfil ni nombre de inscripción se llama "Jugador" (como en el board)', () => {
    renderCards([{ ...invitado, player_name: '   ' } as ScoringPlayer])
    expect(screen.getByText('Jugador')).toBeTruthy()
    expect(screen.getByText('J')).toBeTruthy()
  })

  it('la cabecera de la tarjeta dice el nombre del invitado', () => {
    const entry = {
      selectedPlayer: invitado,
      selectedRound: { id: 'r1', status: 'in_progress' },
      holes: [], currentScores: {}, errorHoles: new Set(), saving: new Set(),
      allFilled: false, parJugado: 0, grossTotal: 0, outGross: 0, inGross: 0, netTotal: 0,
      stablefordPtsAt: () => 0, saveScore: vi.fn(), finalizeRound: vi.fn(), selectedId: 'inv',
    } as unknown as UseScoreEntryReturn
    const tournament = { format: 'stroke_play', modo_juego: 'neto' } as unknown as ScoringTournament
    render(<ScorecardPanel tournament={tournament} courseHoles={[]} holeCount={9} entry={entry} />)
    expect(screen.getByText('Invitado Hunter')).toBeTruthy()
  })
})
