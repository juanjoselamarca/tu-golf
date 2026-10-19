// #511 — `displayHandicap: null` = el HCP de este jugador no se muestra (sin índice
// o no legible para el visor). Antes caía a `courseHandicap` y pintaba un número.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Scorecard from './Scorecard'
import type { HcpMostrado } from '@/lib/data/ronda-libre-live-api'

const holes = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
const scores = Object.fromEntries(holes.map(h => [String(h.numero), 5]))
const pintar = (displayHandicap: HcpMostrado | undefined, courseHandicap = 5) =>
  render(<Scorecard holes={holes} scores={scores} courseHandicap={courseHandicap} displayHandicap={displayHandicap} modo="neto" formato="stroke_play" playerName="Ana" />)

describe('Scorecard — etiqueta HCP', () => {
  it('displayHandicap null → sin etiqueta HCP', () => {
    pintar(null)
    expect(screen.queryByText(/^HCP\s/)).toBeNull()
  })
  it('displayHandicap número → "HCP N"; undefined → cae al course handicap', () => {
    const { unmount } = pintar(9)
    expect(screen.getByText('HCP 9')).toBeTruthy()
    unmount()
    pintar(undefined)
    expect(screen.getByText('HCP 5')).toBeTruthy()
  })
  // Sin índice juega con 0: en una cancha con CR ≈ par su course handicap es 0, y
  // la etiqueta igual tiene que decir "S/Ind" (la columna del leaderboard lo dice).
  it('"S/Ind" se muestra aunque el course handicap sea 0', () => {
    pintar('S/Ind', 0)
    expect(screen.getByText('HCP S/Ind')).toBeTruthy()
  })
  it('sin displayHandicap (torneos) y course handicap 0 → sin etiqueta, como antes', () => {
    pintar(undefined, 0)
    expect(screen.queryByText(/^HCPs/)).toBeNull()
  })
})
