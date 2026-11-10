/**
 * Columna Pos del board de torneo: empates estilo golf ("T2", "T2", "4") con el
 * criterio del motor. A mitad de vuelta, mismo score = empate; con las tarjetas
 * terminadas, el countback ya separó y no va T. Sin hoyos jugados, "—".
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import TournamentTabs from '@/components/TournamentTabs'
import { rankEntries } from '@/golf/leaderboard/rank-entries'
import type { LeaderboardEntry } from '@/golf/leaderboard/types'
import type { Player } from '@/lib/golf-data'

function entry(name: string, gross: number, scores: (number | null)[], status: 'F' | 'live' = 'F'): LeaderboardEntry {
  const holesPlayed = scores.filter((s) => s != null).length
  return {
    name, handicap: 0, grossTotal: gross, netTotal: gross, stablefordTotal: 0, vsPar: 0,
    holesPlayed, parPlayed: holesPlayed * 4, scores, status,
  }
}
const vuelta = (n: number, v = 4) => [...new Array(n).fill(v), ...new Array(18 - n).fill(null)]

function pintar(players: Player[]) {
  return render(
    <TournamentTabs
      players={players}
      groups={[]}
      modoJuego="gross"
      totalHoyos={18}
      isLive
      gwi={{ jugadores: [], results: [] }}
      playerIdToIndex={{}}
      formato="stroke_play"
    />,
  )
}

/** Texto de la columna Pos, fila por fila (la primera celda de cada fila de jugador). */
const columnaPos = (nombres: string[]) =>
  nombres.map((n) => screen.getByText(n).parentElement?.firstElementChild?.textContent)

afterEach(cleanup)

describe('TournamentTabs — posiciones con empate', () => {
  it('en vivo: dos jugadores en el mismo score son T2 y T2, el siguiente 4, y el que no salió "—"', () => {
    const { players } = rankEntries([
      entry('Ana', 34, vuelta(9, 4).map((v, i) => (i === 0 ? 2 : v)), 'live'), // -2
      entry('Diego', 40, vuelta(9, 4).map((v, i) => (i < 4 ? 5 : v)), 'live'), // +4
      entry('María', 44, vuelta(10, 4).map((v, i) => (i < 4 ? 5 : v)), 'live'), // +4
      entry('Pedro', 46, vuelta(9, 5).map((v, i) => (i === 0 ? 6 : v)), 'live'), // +10
      entry('Sin salir', 0, vuelta(0), 'live'),
    ], 'gross', { parTotal: 72, formatoJuego: 'stroke_play' })
    pintar(players)
    expect(columnaPos(['Ana', 'Diego', 'María', 'Pedro', 'Sin salir'])).toEqual(['1', 'T2', 'T2', '4', '—'])
  })

  it('tarjetas terminadas: el countback separa y no hay T', () => {
    const a = [...new Array(18).fill(4)]
    const b = [3, ...new Array(8).fill(4), 5, ...new Array(8).fill(4)] // mismo total, back 9 peor
    const { players } = rankEntries([entry('Beto', 72, b), entry('Alfa', 72, a)], 'gross', { parTotal: 72, formatoJuego: 'stroke_play' })
    pintar(players)
    expect(screen.queryByText('T1')).toBeNull()
    expect(players.map((p) => p.name)).toEqual(['Alfa (desempate)', 'Beto (desempate)'])
    expect(columnaPos(['Alfa (desempate)', 'Beto (desempate)'])).toEqual(['1', '2'])
  })
})
