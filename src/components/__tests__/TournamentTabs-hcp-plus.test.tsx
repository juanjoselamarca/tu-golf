/**
 * Board público del torneo con un jugador plus: el HCP se guarda negativo y se muestra con "+".
 * El redondeo es el del motor (`redondearHandicapWHS`, .5 hacia arriba: −1.5 → −1 = "+1"), el mismo con
 * que la tarjeta reparte los golpes: lo que se ve es lo que puntúa.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TournamentTabs from '@/components/TournamentTabs'
import type { ScorecardProps } from '@/components/Scorecard'
import { formatearHandicap } from '@/golf/handicap-index-range'

// La tarjeta real, pero guardando las props con que la monta el board (golpes que reparte vs HCP del header).
const props = vi.hoisted(() => [] as Array<{ courseHandicap: number; displayHandicap?: unknown }>)
vi.mock('@/components/Scorecard', async orig => {
  const real = (await orig()) as { default: (p: ScorecardProps) => unknown }
  return { ...real, default: (p: ScorecardProps) => { props.push(p); return real.default(p) } }
})
import type { Player } from '@/lib/golf-data'

const scores = Array.from({ length: 18 }, () => 4)
const jugador = (over: Partial<Player>): Player => ({
  pos: 1, id: 'j1', name: 'Ana', country: 'CL', cat: 'General', hcp: -1.5, hcpDisplay: -1.5,
  today: 0, total: 74, holes: 18, grossTotal: 72, netTotal: 74, stablefordTotal: 34,
  status: 'F', scores, claveEmpate: null, ...over,
})

function pintar(players: Player[]) {
  return render(
    <TournamentTabs players={players} groups={[]} modoJuego="neto" totalHoyos={18} isLive={false}
      gwi={{ jugadores: [], results: [] }} playerIdToIndex={{}} formato="stroke_play" />,
  )
}

describe('TournamentTabs — HCP plus', () => {
  it('la celda HCP de un plus 1.5 dice "+1" (redondeo del motor), nunca "-1" ni "+2"', () => {
    pintar([jugador({})])
    expect(screen.getByTestId('celda-hcp').textContent).toBe('+1')
  })

  it('el plus 2.5 es "+2" y el 12.5 es "13": .5 hacia arriba, como el motor', () => {
    pintar([jugador({ hcp: -2.5, hcpDisplay: -2.5 })])
    expect(screen.getByTestId('celda-hcp').textContent).toBe('+2')
  })

  it('un plus que redondea a cero es "0", no "-0" ni "+0"', () => {
    pintar([jugador({ hcp: -0.4, hcpDisplay: -0.4 })])
    expect(screen.getByTestId('celda-hcp').textContent).toBe('0')
  })

  it('la tarjeta expandida lleva el "+"', () => {
    const { container } = pintar([jugador({})])
    fireEvent.click(screen.getAllByText('Ana')[0])
    expect(container.textContent).toContain('HCP +1')
    expect(container.textContent).not.toMatch(/-1\b/)
  })

  it.each([-1.5, -2.5, -0.5, 12.5, 7.5, 15.499999999999995])('hcp %s: el "HCP N" de la tarjeta son los golpes que reparte', hcp => {
    props.length = 0
    const { container } = pintar([jugador({ hcp, hcpDisplay: undefined })])
    fireEvent.click(screen.getAllByText('Ana')[0])
    const p = props.at(-1)!
    expect(p.displayHandicap).toBe(p.courseHandicap)
    expect(container.textContent).toContain(`HCP ${formatearHandicap(p.courseHandicap)}`)
    expect(screen.getByTestId('celda-hcp').textContent).toBe(formatearHandicap(p.courseHandicap))
  })
})
