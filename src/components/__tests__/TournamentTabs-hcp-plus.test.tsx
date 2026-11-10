/**
 * Board público del torneo con un jugador plus: el HCP se guarda negativo y se muestra con "+"
 * ("+2", no "-1"). El redondeo a golpes es simétrico: el plus 1.5 son 2 golpes, como 1.5
 * (`Math.round(-1.5)` daba −1). Lo mismo en la tarjeta expandida ("HCP +2").
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TournamentTabs from '@/components/TournamentTabs'
import type { Player } from '@/lib/golf-data'

const scores = Array.from({ length: 18 }, () => 4)
const jugador = (over: Partial<Player>): Player => ({
  pos: 1, id: 'j1', name: 'Ana', country: 'CL', cat: 'General', hcp: -1.5, hcpDisplay: -1.5,
  today: 0, total: 74, holes: 18, grossTotal: 72, netTotal: 74, stablefordTotal: 34,
  status: 'F', scores, ...over,
})

function pintar(players: Player[]) {
  return render(
    <TournamentTabs players={players} groups={[]} modoJuego="neto" totalHoyos={18} isLive={false}
      gwi={{ jugadores: [], results: [] }} playerIdToIndex={{}} formato="stroke_play" />,
  )
}

describe('TournamentTabs — HCP plus', () => {
  it('la celda HCP dice "+2", nunca "-1"', () => {
    pintar([jugador({})])
    expect(screen.getByTestId('celda-hcp').textContent).toBe('+2')
  })

  it('un plus que redondea a cero es "0", no "-0" ni "+0"', () => {
    pintar([jugador({ hcp: -0.4, hcpDisplay: -0.4 })])
    expect(screen.getByTestId('celda-hcp').textContent).toBe('0')
  })

  it('la tarjeta expandida y el nombre llevan el "+"', () => {
    const { container } = pintar([jugador({})])
    fireEvent.click(screen.getAllByText('Ana')[0])
    expect(container.textContent).toContain('HCP +2')
    expect(container.textContent).not.toMatch(/-1\b/)
  })
})
