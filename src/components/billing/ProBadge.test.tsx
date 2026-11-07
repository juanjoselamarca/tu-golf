import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProBadge } from './ProBadge'

describe('ProBadge', () => {
  it('renders PRO for pro tier', () => {
    render(<ProBadge tier="pro" />)
    expect(screen.getByText('PRO')).toBeDefined()
  })

  it('renders PRO+ for pro_plus tier', () => {
    render(<ProBadge tier="pro_plus" />)
    expect(screen.getByText('PRO+')).toBeDefined()
  })

  it('subtle: 20px de alto y letra de 12px (piso de DESIGN.md §4)', () => {
    const { container } = render(<ProBadge tier="pro" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.height).toBe('20px')
    expect(el.style.fontSize).toBe('12px')
  })

  it('filled: 12px por defecto', () => {
    const { container } = render(<ProBadge tier="pro" variant="filled" />)
    expect((container.firstElementChild as HTMLElement).style.fontSize).toBe('12px')
  })

  it('filled: un size menor a 12 sube a 12 (el chip "Neto" del wizard de torneo pedía 10)', () => {
    const { container } = render(<ProBadge tier="pro" variant="filled" size={10} />)
    expect((container.firstElementChild as HTMLElement).style.fontSize).toBe('12px')
  })

  it('filled: un size mayor se respeta', () => {
    const { container } = render(<ProBadge tier="pro" variant="filled" size={14} />)
    expect((container.firstElementChild as HTMLElement).style.fontSize).toBe('14px')
  })

  it('applies custom className', () => {
    const { container } = render(<ProBadge tier="pro" className="custom" />)
    expect(container.firstElementChild?.classList.contains('custom')).toBe(true)
  })
})
