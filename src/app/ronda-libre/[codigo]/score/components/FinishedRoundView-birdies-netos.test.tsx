// 07-nov (hunter) — Pantalla de fin de ronda en modo neto: la ronda 5H635S (Prince of Wales, 9 hoyos,
// índice 15 → 9 golpes, 4 pares y ningún birdie bruto) decía "4 birdies" mientras el historial, la tarjeta
// pública y el board de la misma ronda decían "0 Birdies". El conteo neto sigue (#602); la etiqueta lo dice.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FinishedRoundView } from './FinishedRoundView'
import type { RondaLibre, HoleData } from '@/types/ronda'

vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))

// Prince of Wales, front 9: par y SI de catálogo (SI 18h impar/par mezclado, como en la cancha real).
const pares = [4, 4, 5, 3, 4, 4, 3, 4, 5]
const sis = [13, 3, 1, 17, 7, 11, 15, 5, 9]
const front = <T,>(f: (h: number, i: number) => T) => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, f(i + 1, i)]))
const parMap = front((_, i) => pares[i]) as Record<number, number>
const holeDataMap = front((h, i) => ({ numero: h, par: pares[i], stroke_index: sis[i], yardaje: null })) as Record<number, HoleData>
// Lo anotado en 5H635S: 5,4,7,3,5,4,3,5,8 → 44 (+8), 4 pares, 3 bogeys, 2 dobles o peor.
const anotado = [5, 4, 7, 3, 5, 4, 3, 5, 8]
const scores = front((_, i) => anotado[i]) as Record<number, number>

function ronda(modo_juego: 'neto' | 'gross'): RondaLibre {
  return {
    id: 'r1', codigo: '5H635S', course_name: 'Prince of Wales', holes: 9, hoyo_inicio: 1, estado: 'finalizada',
    modo_juego, formato_juego: 'stroke_play', ronda_libre_jugadores: [{ id: 'j1', nombre: 'E2E Test', scores: {} }],
  } as unknown as RondaLibre
}

function pintar(modo_juego: 'neto' | 'gross', playerHcp: Record<string, number>, scoresJugador: Record<number, number>) {
  render(
    <FinishedRoundView
      ronda={ronda(modo_juego)} finalScore={{ gross: Object.values(scoresJugador).reduce((a, b) => a + b, 0), totalPar: 36 }}
      historicalRoundId={null} activeJugadorId="j1" jugadores={[]} scores={{ j1: scoresJugador }} parMap={parMap}
      playerHcp={playerHcp} holeDataMap={holeDataMap} codigo="5H635S" showStableford={false} totalStableford={0}
      isMatchPlay={false} matchResult={null} onContinueScoring={() => {}}
    />,
  )
}

describe('FinishedRoundView — birdies en modo neto', () => {
  it('neto con 9 golpes y 4 pares brutos: dice "4 birdies netos", nunca "4 birdies" a secas', () => {
    pintar('neto', { j1: 9 }, scores)
    expect(screen.getByText('4 birdies netos')).toBeTruthy()
    expect(screen.queryByText('4 birdies')).toBeNull()
  })

  it('gross con la misma tarjeta: ningún birdie, ninguna píldora', () => {
    pintar('gross', { j1: 9 }, scores)
    expect(screen.queryByText(/birdie/)).toBeNull()
    expect(screen.queryByText(/eagle/)).toBeNull()
  })

  it('gross con un birdie real: "1 birdie" sin sufijo', () => {
    pintar('gross', {}, { ...scores, 2: 3 })
    expect(screen.getByText('1 birdie')).toBeTruthy()
    expect(screen.queryByText(/netos/)).toBeNull()
  })

  it('neto con un eagle neto (hoyo 3, SI 1: 7 − 1 golpe = 6 es par; con 4 brutos queda 3 = eagle neto)', () => {
    pintar('neto', { j1: 9 }, { ...scores, 3: 4 })
    expect(screen.getByText('1 eagle neto')).toBeTruthy()
    expect(screen.getByText('4 birdies netos')).toBeTruthy()
  })
})
