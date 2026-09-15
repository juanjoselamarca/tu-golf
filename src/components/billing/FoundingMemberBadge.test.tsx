import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FoundingMemberBadge } from './FoundingMemberBadge'

describe('FoundingMemberBadge', () => {
  it('renders the badge text', () => {
    render(<FoundingMemberBadge />)
    expect(screen.getByText('Socio Fundador')).toBeDefined()
  })

  it('shows locked price when provided', () => {
    render(<FoundingMemberBadge lockedPrice="$4.990/mes de por vida" />)
    expect(screen.getByText('$4.990/mes de por vida')).toBeDefined()
  })

  it('does not show price text when lockedPrice is omitted', () => {
    const { container } = render(<FoundingMemberBadge />)
    // Only the badge text span should exist
    const spans = container.querySelectorAll('span > span')
    expect(spans.length).toBe(1)
  })

  it('applies custom className', () => {
    const { container } = render(<FoundingMemberBadge className="test-class" />)
    expect(container.firstElementChild?.classList.contains('test-class')).toBe(true)
  })
})
