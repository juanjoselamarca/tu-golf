import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayerScoreCard } from './PlayerScoreCard'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'
import type { HoleData, Jugador } from '@/types/ronda'

const HOYO: HoleData = { numero: 12, par: 4, stroke_index: 13, yardaje: null }

const JUGADOR: Jugador = {
  id: 'j1',
  nombre: 'Juan Pérez',
  user_id: null,
  scores: {},
  handicap: 18,
}

/**
 * Una tarjeta en neto, un solo hoyo jugado, hándicap 18 (un golpe en cada hoyo).
 * El `golpes` del hoyo decide el neto: 5 golpes − 1 recibido = 4 = par.
 */
function renderTarjeta(golpes: number, formatoJuego: 'stroke_play' | 'stableford' = 'stroke_play') {
  const neto = golpes - 1
  render(
    <PlayerScoreCard
      jugador={JUGADOR}
      playerScores={{ 12: golpes }}
      currentHole={12}
      par={4}
      holeData={HOYO}
      totals={{ gross: golpes, vsPar: golpes - 4, out: 0, inn: golpes, holesPlayed: 1, parJugado: 4 }}
      played={1}
      hcp={18}
      displayHcp={18}
      dotHcp={18}
      siAllocByHole={{ 12: 13 }}
      ordenHoyos={[12]}
      holeDataMap={{ 12: HOYO }}
      totalHoles={18}
      modoJuego="neto"
      formatoJuego={formatoJuego}
      showNetStableford
      pending={false}
      onChange={() => {}}
      theme={SCORER_THEME}
    />,
  )
  return neto
}

describe('PlayerScoreCard · cómo se escribe el neto', () => {
  // En golf el par NO se escribe "+0": se escribe "E" (even), que es lo que
  // muestran el marcador en vivo y el ranking de la MISMA ronda. La tarjeta
  // armaba el signo a mano y escribía "Net: +0", así que la app se contradecía
  // entre dos pantallas de la misma vuelta. Las dos escrituras del neto de la
  // tarjeta —el total corrido y el chip del hoyo— entran en este caso.
  it('el neto en par se escribe E, nunca +0', () => {
    renderTarjeta(5)
    expect(screen.queryByText(/\+0/)).toBeNull()
    expect(screen.getAllByText('Net: E').length).toBe(2)
  })

  it('sobre par lleva el signo', () => {
    renderTarjeta(6)
    expect(screen.getAllByText('Net: +1').length).toBe(2)
  })

  it('bajo par lleva el signo menos', () => {
    renderTarjeta(4)
    expect(screen.getAllByText('Net: -1').length).toBe(2)
  })

  // En stableford la tarjeta cuenta PUNTOS, no golpes contra el par: un "E" ahí
  // sería un vs-par colado en una pantalla que no habla de vs-par. Las dos
  // escrituras bifurcan antes de llegar al formateador y esto lo fija.
  it('en stableford escribe puntos y ningún vs-par', () => {
    renderTarjeta(5, 'stableford')
    expect(screen.queryByText(/Net: /)).toBeNull()
    expect(screen.queryByText('E')).toBeNull()
    expect(screen.getAllByText(/\d+ pts$/).length).toBe(2)
  })
})
