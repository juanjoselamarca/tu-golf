import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MatchPlayHoleCard } from './MatchPlayHoleCard'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'
import type { MatchResult } from '@/golf/formats/match-play'
import type { Jugador } from '@/types/ronda'

const jugadores: Jugador[] = [
  { id: 'a', nombre: 'Ana', user_id: 'u1', scores: {}, handicap: null },
  { id: 'b', nombre: 'Beto', user_id: null, scores: {}, handicap: 12 },
]
const matchResult = {
  holes: [{ numero: 1, par: 4, strokeIndex: 1, grossA: 5, grossB: 4, strokesA: 0, strokesB: 0, netoA: 5, netoB: 4, result: 'won_b' }],
} as unknown as MatchResult

function renderCard(mostrarNeto: boolean) {
  render(
    <MatchPlayHoleCard matchResult={matchResult} jugadores={jugadores} currentHole={1}
      activeScoreOnHole={5} onConcede={() => {}} mostrarNeto={mostrarNeto} theme={SCORER_THEME} />,
  )
}

describe('MatchPlayHoleCard — rótulo neto (#511)', () => {
  it('match en bruto (sin sesión): no rotula "neto" un golpe bruto', () => {
    renderCard(false)
    expect(screen.queryByText(/neto/)).toBeNull()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('match neto: muestra el neto de cada jugador', () => {
    renderCard(true)
    expect(screen.getByText('neto 5')).toBeTruthy()
    expect(screen.getByText('neto 4')).toBeTruthy()
  })
})
