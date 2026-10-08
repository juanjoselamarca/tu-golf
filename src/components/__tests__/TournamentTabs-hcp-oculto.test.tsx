/**
 * TournamentTabs con un handicap OCULTO al visor (`Player.hcp === null`, lo anula el
 * servidor para un espectador sin sesión): la columna HCP queda vacía, el nombre no
 * lleva "(hcp)" y la tarjeta expandida muestra sólo golpes brutos — sin un neto ni
 * puntos recalculados con 0, que serían falsos.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TournamentTabs from '@/components/TournamentTabs'
import type { Player } from '@/lib/golf-data'

const scores = Array.from({ length: 18 }, () => 4)
const jugador = (over: Partial<Player>): Player => ({
  pos: 1, id: 'j1', name: 'Ana', country: 'CL', cat: 'General', hcp: 18, hcpDisplay: 18,
  today: 0, total: 54, holes: 18, grossTotal: 72, netTotal: 54, stablefordTotal: 54,
  status: 'F', scores, ...over,
})

function pintar(players: Player[]) {
  return render(
    <TournamentTabs
      players={players}
      groups={[]}
      modoJuego="neto"
      totalHoyos={18}
      isLive={false}
      gwi={{ jugadores: [], results: [] }}
      playerIdToIndex={{}}
      formato="stableford"
    />,
  )
}

describe('TournamentTabs — handicap oculto al visor', () => {
  it('visible: la celda HCP del jugador muestra su handicap', () => {
    pintar([jugador({})])
    expect(screen.getByTestId('celda-hcp').textContent).toBe('18')
    expect(screen.getByText('HCP')).toBeTruthy()
  })

  it('oculto para uno: su celda queda vacía y la del otro no', () => {
    pintar([jugador({ hcp: null, hcpDisplay: null }), jugador({ id: 'j2', name: 'Beto', pos: 2, hcp: 12, hcpDisplay: 12 })])
    expect(screen.getAllByTestId('celda-hcp').map((c) => c.textContent)).toEqual(['', '12'])
  })

  it('oculto para todos (vista bruta): no hay columna HCP — ni cabecera ni celdas vacías', () => {
    pintar([jugador({ hcp: null, hcpDisplay: null })])
    expect(screen.queryAllByTestId('celda-hcp')).toEqual([])
    expect(screen.queryByText('HCP')).toBeNull()
  })

  it('oculto: la tarjeta expandida no muestra "HCP" ni el handicap junto al nombre', () => {
    const { container } = pintar([jugador({ hcp: null, hcpDisplay: null })])
    fireEvent.click(screen.getAllByText('Ana')[0])
    expect(container.textContent).not.toMatch(/HCP\s*\d/)
    expect(container.textContent).not.toMatch(/Ana\s*\(\d+\)/)
  })
})
