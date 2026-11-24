import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveUpsell } from './LiveUpsell'
import { TvUpsell } from '../tv/TvUpsell'

// Regresión (hunter 24-nov): quien no es PRO llegaba a /en-vivo por la pestaña «En Vivo» del torneo (o por el link
// que comparte el organizador) y a /tv, y veía un upsell de pantalla completa sin camino de vuelta: solo «Conocer
// PRO». Ahora ambos ofrecen volver al leaderboard gratis del torneo.
describe('upsells del torneo — salida al leaderboard gratis', () => {
  it('/en-vivo: link al torneo, con o sin sesión', () => {
    const { unmount } = render(<LiveUpsell slug="copa-x" />)
    expect(screen.getByRole('link', { name: /Ver el leaderboard del torneo/ }).getAttribute('href')).toBe('/torneo/copa-x')
    unmount()
    render(<LiveUpsell slug="copa-x" loginNext="/torneo/copa-x/en-vivo" />)
    expect(screen.getByRole('link', { name: /Ver el leaderboard del torneo/ }).getAttribute('href')).toBe('/torneo/copa-x')
    expect(screen.getByRole('link', { name: 'Entrar' })).toBeDefined()
  })

  it('/tv: link al torneo', () => {
    render(<TvUpsell slug="copa-x" />)
    expect(screen.getByRole('link', { name: /Ver el leaderboard del torneo/ }).getAttribute('href')).toBe('/torneo/copa-x')
  })

  it('el slug va codificado en la ruta', () => {
    render(<LiveUpsell slug="copa x" />)
    expect(screen.getByRole('link', { name: /Ver el leaderboard del torneo/ }).getAttribute('href')).toBe('/torneo/copa%20x')
  })
})
