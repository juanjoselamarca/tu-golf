import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from '../Input'

describe('Input', () => {
  it('el <input> ocupa todo el alto de la caja de 48px (objetivo táctil ≥44px, no solo la línea de texto)', () => {
    render(<Input aria-label="Código del torneo" />)
    const input = screen.getByLabelText('Código del torneo')
    expect(input.className.split(' ')).toContain('self-stretch')
    expect(input.parentElement?.className).toContain('h-12')
  })
})
