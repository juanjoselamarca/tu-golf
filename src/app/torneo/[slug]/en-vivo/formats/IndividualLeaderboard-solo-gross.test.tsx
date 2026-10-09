import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import IndividualLeaderboard from './IndividualLeaderboard'

const jugadores = [{ id: 'p1', name: 'Ana', scores_per_hole: [4], gross_total: 4, vs_par: 0, thru: 1 }]

describe('IndividualLeaderboard del torneo en vivo — vista sólo bruta', () => {
  it('soloBruto: sin columnas HCP ni Neto (nada de "0" de relleno)', () => {
    render(<IndividualLeaderboard players={jugadores} format="stroke_play" modo="gross" holeCount={9} soloBruto />)
    expect(screen.queryByText('HCP Cancha')).toBeNull()
    expect(screen.queryByText('Neto')).toBeNull()
    expect(screen.getByText('Bruto')).toBeTruthy()
  })
  it('sin soloBruto: HCP y Neto como siempre', () => {
    render(<IndividualLeaderboard players={[{ ...jugadores[0], handicap_index: 12, net_total: 3 }]} format="stroke_play" modo="neto" holeCount={9} />)
    expect(screen.getByText('HCP Cancha')).toBeTruthy()
    expect(screen.getByText('Neto')).toBeTruthy()
  })
})
