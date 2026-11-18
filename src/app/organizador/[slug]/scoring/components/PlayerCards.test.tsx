import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayerCards, progresoDeTarjeta } from './PlayerCards'
import type { ScoringPlayer, ScoringRound } from '@/lib/data/tournaments/scoring'

// Fable #829: quien no juega la ronda (sin tarjeta) salía con "0/18", como si jugara y no llevara nada.
describe('PlayerCards — progreso de la tarjeta', () => {
  const enJuego = { id: 'r1', status: 'in_progress' } as unknown as ScoringRound
  const cerrada = { id: 'r1', status: 'closed' } as unknown as ScoringRound

  const V = { rondaVigente: true, admiteTarjetas: true }
  // Fable #833 P2-b: el carrusel dice lo mismo que el panel (casoSinTarjeta).
  it.each([
    ['sin tarjeta y retirado, ronda vigente', 'withdrawn', V, 'No juega'],
    ['sin tarjeta y pendiente, ronda vigente', 'pending', V, 'No juega'],
    ['sin tarjeta y aprobado, ronda vigente', 'approved', V, 'Sin tarjeta'],
    ['sin tarjeta y aprobado, ronda pasada', 'approved', { ...V, rondaVigente: false }, 'No jugó'],
    ['sin tarjeta y retirado, ronda pasada', 'withdrawn', { ...V, rondaVigente: false }, 'No jugó'],
    ['sin tarjeta y aprobado, torneo cerrado', 'approved', { ...V, admiteTarjetas: false }, 'No jugó'],
    ['sin tarjeta y retirado, torneo cerrado', 'withdrawn', { ...V, admiteTarjetas: false }, 'No jugó'],
  ])('%s', (_caso, status, ctx, texto) => {
    expect(progresoDeTarjeta({ round: undefined, status, hoyosConScore: 0, holeCount: 18, ...ctx })).toBe(texto)
  })

  it('con tarjeta en juego → "7/18"', () => {
    expect(progresoDeTarjeta({ round: enJuego, status: 'approved', hoyosConScore: 7, holeCount: 18, ...V })).toBe('7/18')
  })

  it('tarjeta cerrada → "✓ Completo"', () => {
    expect(progresoDeTarjeta({ round: cerrada, status: 'approved', hoyosConScore: 18, holeCount: 18, ...V })).toBe('✓ Completo')
  })

  it('en el carrusel, el retirado sin tarjeta no muestra "0/18"', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const p = { id: 'p1', status: 'withdrawn', profiles: { name: 'Ana Pérez' }, rounds: [] } as unknown as ScoringPlayer
    render(<PlayerCards players={[p]} selectedId={null} holeCount={18} filledCount={0} getActiveRound={() => undefined} hasScoresLoaded roundHoleCounts={new Map()} rondaVigente admiteTarjetas onSelect={() => {}} />)
    expect(screen.queryByText('0/18')).toBeNull()
    expect(screen.getByText('No juega')).toBeTruthy()
  })

  // Fable #833 v2/v3: a 390 px la 3ª tarjeta quedaba bajo el degradado. Se trae con scroll SÓLO horizontal del
  // carrusel (scrollIntoView movía también la página) y sólo al cambiar la elegida.
  it('la tarjeta elegida se trae con scroll horizontal del carrusel, sin mover la página', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const scrollTo = vi.fn()
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo
    const ventana = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const originales = (['clientWidth', 'offsetWidth', 'offsetLeft'] as const).map((k) => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)] as const)
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.dataset.playerCard ? 120 : 358 } })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.dataset.playerCard ? 120 : 358 } })
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', { configurable: true, get() { return this.dataset.playerCard ? (Number(this.dataset.playerCard.slice(1)) - 1) * 132 : 0 } })
    try {
      const ps = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, status: 'approved', profiles: { name: id }, rounds: [] })) as unknown as ScoringPlayer[]
      const props = { players: ps, holeCount: 18, filledCount: 0, getActiveRound: () => undefined, hasScoresLoaded: true, roundHoleCounts: new Map(), rondaVigente: true, admiteTarjetas: false, onSelect: () => {} }
      const { rerender } = render(<PlayerCards {...props} selectedId="p1" />)
      scrollTo.mockClear()
      rerender(<PlayerCards {...props} selectedId="p3" />)
      // p3: x=264, ancho 120, margen 32 → 264+120+32-358 = 58.
      expect(scrollTo).toHaveBeenCalledTimes(1)
      expect(scrollTo.mock.calls[0][0]).toEqual({ left: 58, behavior: 'smooth' })
      expect(scrollTo.mock.calls[0][0]).not.toHaveProperty('top')
      expect(scrollIntoView).not.toHaveBeenCalled()
      expect(ventana).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { pressed: true }).getAttribute('data-player-card')).toBe('p3')
      // Llegan más jugadores con la misma elegida: no se vuelve a mover.
      rerender(<PlayerCards {...props} players={[...ps, { ...ps[0], id: 'p5' }]} selectedId="p3" />)
      expect(scrollTo).toHaveBeenCalledTimes(1)
    } finally {
      for (const [k, desc] of originales) {
        if (desc) Object.defineProperty(HTMLElement.prototype, k, desc)
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k]
      }
      ventana.mockRestore()
    }
  })
})
