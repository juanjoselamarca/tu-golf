// 19-oct (#602, revisión Fable) — Pantalla de fin de ronda de un 9h desde el 10:
//  - los birdies netos reparten los 5 golpes del CH (antes el SI se normalizaba sobre 1-9
//    ausentes y con SI de catálogo 18h sólo caían 2 golpes);
//  - la mini tarjeta pinta los hoyos 10-18 bajo "IN" (antes 1-9 vacíos bajo "OUT").
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FinishedRoundView } from './FinishedRoundView'
import type { RondaLibre, HoleData } from '@/types/ronda'

vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))

const back = <T,>(f: (h: number, i: number) => T) => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 10, f(i + 10, i)]))
const parMap = back(() => 4) as Record<number, number>
const holeDataMap = back((h, i) => ({ numero: h, par: 4, stroke_index: 2 * i + 2, yardaje: null })) as Record<number, HoleData>
const ronda = {
  id: 'r1', codigo: 'BACK9', course_name: 'Club de Polo', holes: 9, hoyo_inicio: 10, estado: 'finalizada',
  modo_juego: 'neto', formato_juego: 'stroke_play', ronda_libre_jugadores: [{ id: 'j1', nombre: 'Alberto', scores: {} }],
} as unknown as RondaLibre

describe('FinishedRoundView — 9 hoyos desde el 10', () => {
  it('birdies netos con los 5 golpes del CH y mini tarjeta 10-18 en IN', () => {
    render(
      <FinishedRoundView
        ronda={ronda} finalScore={{ gross: 36, totalPar: 36 }} historicalRoundId={null} activeJugadorId="j1"
        jugadores={[]} scores={{ j1: back(() => 4) as Record<number, number> }} parMap={parMap} playerHcp={{ j1: 5 }}
        holeDataMap={holeDataMap} codigo="BACK9" showStableford={false} totalStableford={0}
        isMatchPlay={false} matchResult={null} onContinueScoring={() => {}}
      />,
    )
    expect(screen.getByText('5 birdies')).toBeTruthy() // 4 en par 4 − 1 golpe en 5 hoyos
    expect(screen.getAllByText('IN').length).toBeGreaterThan(0)
    expect(screen.queryByText('OUT')).toBeNull()
    expect(screen.getAllByText('18').length).toBeGreaterThan(0)
  })
})
