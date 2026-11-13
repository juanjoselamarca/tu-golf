// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Acciones } from './CompetenciaHero'

afterEach(cleanup)

describe('Acciones del dashboard', () => {
  it('los links secundarios se subrayan pegados al texto, no con un borde que la altura de toque (44 px) separa', () => {
    render(<Acciones />)
    for (const name of ['Organizar torneo', 'Unirme con código']) {
      const link = screen.getByRole('link', { name })
      expect(link.style.borderBottom).toBe('')
      expect(link.style.textDecoration).toContain('underline')
      expect(link.style.alignItems).toBe('center')
    }
  })

  it('"Nueva ronda" usa el ícono de línea, no el carácter "+"', () => {
    render(<Acciones />)
    const link = screen.getByRole('link', { name: /Nueva ronda/ })
    expect(link.querySelector('svg')).not.toBeNull()
    expect(link.textContent?.trim()).toBe('Nueva ronda')
  })
})
