import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { UpsellCard } from './UpsellCard'

const cta = () => screen.getByRole('link', { name: /Conocer PRO/ })

describe('UpsellCard', () => {
  it('medium: badge, título, descripción y CTA a /planes', () => {
    render(<UpsellCard feature="history-full" title="Estadísticas avanzadas" description="Tendencia de scoring" />)
    expect(screen.getByText('PRO')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Estadísticas avanzadas' })).toBeDefined()
    expect(screen.getByText('Tendencia de scoring')).toBeDefined()
    expect(cta().getAttribute('href')).toBe('/planes')
    expect(cta().textContent).toBe('Conocer PRO')
  })

  it('PRO+: badge y CTA dicen PRO+', () => {
    render(<UpsellCard feature="season-projection" title="Proyección" description="d" />)
    expect(screen.getByText('PRO+')).toBeDefined()
    expect(cta().textContent).toBe('Conocer PRO+')
  })

  it('compact: fila sin descripción, con el CTA', () => {
    render(<UpsellCard feature="history-full" title="Modo TV" description="no se muestra" variant="compact" />)
    expect(screen.queryByText('no se muestra')).toBeNull()
    expect(cta()).toBeDefined()
  })

  it('full: título como sección y CTA presente', () => {
    render(<UpsellCard feature="history-full" title="Coach" description="d" variant="full" />)
    expect(screen.getByRole('heading', { name: 'Coach' })).toBeDefined()
    expect(cta()).toBeDefined()
  })

  // Regresión del bug reportado (23-sep): el contenido iba en una capa
  // absoluta sobre una caja de alto fijo con overflow oculto → badge y CTA
  // recortados. El contenido tiene que fluir y la tarjeta crecer con él.
  it('el contenido no va en una capa absoluta ni en una caja de alto fijo', () => {
    const { container } = render(
      <UpsellCard feature="history-full" title="t" description="d" />,
    )
    const html = container.innerHTML
    expect(html).not.toMatch(/absolute|overflow-hidden|inset-0/)
    const css = readFileSync(path.resolve(__dirname, 'UpsellCard.module.css'), 'utf8')
    expect(css).not.toMatch(/position:\s*absolute|overflow:\s*hidden|(^|[^-])height:\s*\d/m)
  })
})

describe('UpsellCard — "¿Ya tienes PRO? Entrar"', () => {
  it('con loginNext muestra Entrar hacia /login con la ruta de vuelta codificada', () => {
    render(<UpsellCard feature="leaderboard-live" variant="full" title="t" description="d" loginNext="/torneo/copa x/en-vivo" />)
    const entrar = screen.getByRole('link', { name: 'Entrar' })
    expect(entrar.getAttribute('href')).toBe('/login?next=%2Ftorneo%2Fcopa%20x%2Fen-vivo')
    expect(screen.getByText(/¿Ya tienes PRO\?/)).toBeTruthy()
  })

  it('sin loginNext (hay sesión) no aparece', () => {
    render(<UpsellCard feature="leaderboard-live" variant="full" title="t" description="d" />)
    expect(screen.queryByRole('link', { name: 'Entrar' })).toBeNull()
  })

  it('también en la variante medium', () => {
    render(<UpsellCard feature="leaderboard-live" title="t" description="d" loginNext="/torneo/x/tv" />)
    expect(screen.getByRole('link', { name: 'Entrar' }).getAttribute('href')).toBe('/login?next=%2Ftorneo%2Fx%2Ftv')
  })
})
