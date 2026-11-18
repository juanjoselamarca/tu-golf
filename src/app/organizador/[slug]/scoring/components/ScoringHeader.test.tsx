// Cabecera del scorer del organizador: el deshacer de un guardado incierto (sin respuesta del servidor) no se
// ofrece hasta que la relectura de la tarjeta diga qué quedó en la base (revisión #834, vuelta 6).

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScoringHeader } from './ScoringHeader'
import type { LastAction } from '../hooks/useScoreEntry'

vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))

const accion = (estado: LastAction['estado']): LastAction => ({
  id: 1, holeNumber: 7, previousScore: undefined, newScore: 5, playerId: 'p1', roundId: 'r1', estado,
})
const cabecera = (lastAction: LastAction) => render(
  <ScoringHeader name="Copa" slug="copa" status="in_progress" isMultiRound={false} activeRoundNum={1}
    totalRounds={1} saving={false} lastAction={lastAction} onUndo={vi.fn()} />,
)

describe('ScoringHeader · deshacer', () => {
  it('con el guardado incierto dice que está revisando el hoyo y no ofrece deshacer', () => {
    cabecera(accion('incierto'))
    expect(screen.getByRole('status').textContent).toBe('Revisando hoyo 7…')
    expect(screen.queryByRole('button', { name: /Deshacer/ })).toBeNull()
  })

  it('con el guardado confirmado ofrece deshacer', () => {
    cabecera(accion('guardado'))
    expect(screen.getByRole('button', { name: 'Deshacer hoyo 7' })).toBeTruthy()
  })
})
