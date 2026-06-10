/**
 * El CTA del landing dispara el evento de conversión correcto al hacer click.
 * Cubre el wiring de analítica que usan todos los CTAs (hero, planes, CTA final,
 * compete, funnel del juego).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import CTAButton from './CTAButton'

const capture = vi.fn()
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }))
// next/link → <a> simple para no necesitar router en el test
vi.mock('next/link', () => ({
  default: ({ href, onClick, className, children }: { href: string; onClick?: () => void; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className} onClick={onClick}>{children}</a>
  ),
}))

describe('CTAButton — tracking de conversión', () => {
  beforeEach(() => capture.mockClear())

  it('dispara home_cta_click con { location, target } al click', () => {
    const { getByText } = render(
      <CTAButton href="/register" location="hero" target="register">Crear cuenta gratis</CTAButton>,
    )
    fireEvent.click(getByText('Crear cuenta gratis'))
    expect(capture).toHaveBeenCalledWith('home_cta_click', { location: 'hero', target: 'register' })
  })

  it('pasa el href al link', () => {
    const { getByText } = render(
      <CTAButton href="/demo" location="final" target="demo">Ver demo</CTAButton>,
    )
    expect(getByText('Ver demo').getAttribute('href')).toBe('/demo')
  })
})
