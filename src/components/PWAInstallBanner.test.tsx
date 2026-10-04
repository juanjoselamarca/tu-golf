/**
 * Banner de instalación en el scorer — hallazgo de la prueba de fuego Los Leones (04-oct-2026).
 *
 * En iPhone sin la app instalada, el banner automático aparecía a los 3 s ENCIMA de la
 * barra "Siguiente →" del marcador (fixed, zIndex 200) y bloqueaba el toque; su "×" mide
 * 20 px. En las pantallas de anotar no se auto-muestra. El pedido EXPLÍCITO (p.ej. "Seguir"
 * en iPhone) se sigue mostrando en cualquier ruta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const ruta = { value: '/ronda-libre/ABC123/score-grupo' }
vi.mock('next/navigation', () => ({ usePathname: () => ruta.value }))

import { PWAInstallBanner, requestPwaInstall } from './PWAInstallBanner'
import { esRutaDeScoring } from '@/lib/rutas'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

describe('esRutaDeScoring', () => {
  it.each([
    ['/ronda-libre/ABC123/score', true],
    ['/ronda-libre/ABC123/score-grupo', true],
    ['/torneo/copa/score', true],
    ['/organizador/copa/scoring', true],
    ['/ronda-libre/ABC123', false],
    ['/dashboard', false],
    [null, false],
  ])('%s → %s', (p, esperado) => {
    expect(esRutaDeScoring(p as string | null)).toBe(esperado)
  })
})

describe('PWAInstallBanner — no tapa el scorer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI)
    // jsdom no trae matchMedia: Safari sin instalar = display-mode no standalone.
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('en el scorer de grupo NO se auto-muestra a los 3 s (iPhone Safari)', () => {
    ruta.value = '/ronda-libre/ABC123/score-grupo'
    render(<PWAInstallBanner />)
    act(() => { vi.advanceTimersByTime(3500) })
    expect(screen.queryByText('Golfers+ funciona mejor como app')).toBeNull()
  })

  it('fuera del scorer sí se auto-muestra (comportamiento previo)', () => {
    ruta.value = '/dashboard'
    render(<PWAInstallBanner />)
    act(() => { vi.advanceTimersByTime(3500) })
    expect(screen.getByText('Golfers+ funciona mejor como app')).toBeTruthy()
  })

  it('un pedido explícito se muestra aunque sea en el scorer', () => {
    ruta.value = '/ronda-libre/ABC123/score'
    render(<PWAInstallBanner />)
    act(() => { requestPwaInstall('Para recibir el marcador en vivo') })
    expect(screen.getByText('Instala Golfers+ para seguir la ronda')).toBeTruthy()
  })
})
