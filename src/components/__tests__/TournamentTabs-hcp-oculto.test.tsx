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
  it('oculto: la fila no muestra el handicap; visible: sí (el test discrimina)', () => {
    const oculto = pintar([jugador({ hcp: null, hcpDisplay: null })]).container.textContent ?? ''
    const visible = pintar([jugador({ id: 'j2' })]).container.textContent ?? ''
    expect(visible).toMatch(/18/)
    expect(oculto).not.toMatch(/18/)
  })

  it('oculto: la tarjeta expandida no muestra "HCP" ni un neto recalculado', () => {
    const { container } = pintar([jugador({ hcp: null, hcpDisplay: null })])
    fireEvent.click(screen.getAllByText('Ana')[0])
    expect(container.textContent).not.toMatch(/HCP\s*\d/)
  })
})
