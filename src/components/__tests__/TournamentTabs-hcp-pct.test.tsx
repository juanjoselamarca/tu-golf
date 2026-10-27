/**
 * El handicap de juego del torneo (`tournaments.hcp_pct`) se avisa UNA vez en la
 * cabecera del board ("Handicap al 85 %"), no por jugador. Al 100 % no hay aviso.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import TournamentTabs from '@/components/TournamentTabs'
import type { Player } from '@/lib/golf-data'

const jugador: Player = {
  pos: 1, id: 'j1', name: 'Ana', country: 'CL', cat: 'General', hcp: 18, hcpDisplay: 18,
  today: 0, total: 72, holes: 18, grossTotal: 72, netTotal: 54, stablefordTotal: 36,
  status: 'F', scores: Array.from({ length: 18 }, () => 4),
}

function pintar(etiquetaHcpPct: string | null) {
  return render(
    <TournamentTabs
      players={[jugador]}
      groups={[]}
      modoJuego="neto"
      totalHoyos={18}
      isLive={false}
      gwi={{ jugadores: [], results: [] }}
      playerIdToIndex={{}}
      formato="stroke_play"
      etiquetaHcpPct={etiquetaHcpPct}
    />,
  )
}

afterEach(cleanup)

describe('TournamentTabs — handicap de juego del torneo', () => {
  it('85 %: la cabecera lo avisa una sola vez', () => {
    pintar('Handicap al 85 %')
    expect(screen.getAllByText('Handicap al 85 %')).toHaveLength(1)
  })

  it('100 % (null): sin aviso', () => {
    pintar(null)
    expect(screen.queryByText(/Handicap al/)).toBeNull()
  })
})
