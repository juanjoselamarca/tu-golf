// Regresión (hunter 18-nov, rehecho 23-nov): la pestaña Grupos del torneo
// mostraba "Matías Rojas (desempate) (4)". `rankEntries` pega la marca del
// countback en `name` para la fila del ranking, y Grupos reusaba ese `name`.
// El motor ahora emite `nombreBase`, `filaPublica` lo conserva y Grupos lo usa.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { rankEntries } from '@/golf/leaderboard/rank-entries'
import type { LeaderboardEntry } from '@/golf/leaderboard/types'
import { filaPublica, type VistaPublica } from '@/lib/data/tournaments/vista-publica'
import { nombreDelJugador } from '@/lib/golf-data'
import { GruposDelTorneo } from './GruposDelTorneo'

function entry(id: string, name: string, scores: number[]): LeaderboardEntry {
  const gross = scores.reduce((a, b) => a + b, 0)
  return {
    id,
    name,
    handicap: 4,
    grossTotal: gross,
    netTotal: gross - 4,
    stablefordTotal: 0,
    vsPar: gross - 72,
    holesPlayed: 18,
    scores,
    status: 'F',
  } as LeaderboardEntry
}

// Empate a 72 golpes, tarjetas completas: el countback (últimos 9) lo resuelve.
const empatados = [
  entry('p1', 'Matías Rojas', [...Array(9).fill(5), ...Array(9).fill(3)]),
  entry('p2', 'Ana Soto', [...Array(9).fill(3), ...Array(9).fill(5)]),
]

describe('Grupos del torneo con un empate resuelto por countback', () => {
  const { players } = rankEntries(empatados, 'gross', { parTotal: 72, formatoJuego: 'stroke_play' })

  it('la fila del ranking lleva la marca y nombreBase no', () => {
    const conMarca = players.find((p) => p.name.includes('(desempate)'))
    expect(conMarca).toBeDefined()
    expect(conMarca!.nombreBase).not.toContain('(')
    expect(nombreDelJugador(conMarca!)).toBe(conMarca!.nombreBase)
  })

  it('la pestaña Grupos muestra el nombre sin "(desempate)" tras filaPublica', () => {
    const vista = { soloBruto: false } as VistaPublica
    const publicos = players.map((p) => filaPublica(p, vista, new Set()))
    const playerIdToIndex = Object.fromEntries(publicos.map((p, i) => [p.id!, i]))
    render(
      <GruposDelTorneo
        groups={[{ id: 'g1', name: 'Grupo 1', teeTime: null, sortOrder: 1, playerIds: ['p1', 'p2'] }]}
        players={publicos}
        playerIdToIndex={playerIdToIndex}
        totalHoyos={18}
        esPuntos={false}
      />,
    )
    expect(screen.queryByText(/desempate/)).toBeNull()
    expect(screen.getByText(/Matías Rojas/)).toBeTruthy()
    expect(screen.getByText(/Ana Soto/)).toBeTruthy()
  })
})
