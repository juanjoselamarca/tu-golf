import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayerCards, progresoDeTarjeta } from './PlayerCards'
import type { ScoringPlayer, ScoringRound } from '@/lib/data/tournaments/scoring'

// Fable #829: quien no juega la ronda (sin tarjeta) salía con "0/18", como si jugara y no llevara nada.
describe('PlayerCards — progreso de la tarjeta', () => {
  const enJuego = { id: 'r1', status: 'in_progress' } as unknown as ScoringRound
  const cerrada = { id: 'r1', status: 'closed' } as unknown as ScoringRound

  it.each([
    ['sin tarjeta y retirado', undefined, 'withdrawn', 'No juega'],
    ['sin tarjeta y pendiente', undefined, 'pending', 'No juega'],
    ['sin tarjeta y aprobado', undefined, 'approved', 'Sin tarjeta'],
    ['con tarjeta en juego', enJuego, 'approved', '7/18'],
  ])('%s', (_caso, round, status, texto) => {
    expect(progresoDeTarjeta({ round, status, hoyosConScore: 7, holeCount: 18 })).toBe(texto)
  })

  it('tarjeta cerrada → "✓ Completo"', () => {
    expect(progresoDeTarjeta({ round: cerrada, status: 'approved', hoyosConScore: 18, holeCount: 18 })).toBe('✓ Completo')
  })

  it('en el carrusel, el retirado sin tarjeta no muestra "0/18"', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const p = { id: 'p1', status: 'withdrawn', profiles: { name: 'Ana Pérez' }, rounds: [] } as unknown as ScoringPlayer
    render(<PlayerCards players={[p]} selectedId={null} holeCount={18} filledCount={0} getActiveRound={() => undefined} hasScoresLoaded roundHoleCounts={new Map()} onSelect={() => {}} />)
    expect(screen.queryByText('0/18')).toBeNull()
    expect(screen.getByText('No juega')).toBeTruthy()
  })
})
