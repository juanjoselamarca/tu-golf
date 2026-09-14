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

  it('has 18px height', () => {
    const { container } = render(<ProBadge tier="pro" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.height).toBe('18px')
  })

  it('applies custom className', () => {
    const { container } = render(<ProBadge tier="pro" className="custom" />)
    expect(container.firstElementChild?.classList.contains('custom')).toBe(true)
  })
})
