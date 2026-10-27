import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorState } from '../ErrorState'

describe('ErrorState', () => {
  it('el botón Reintentar mide al menos 44px de alto (objetivo táctil en cancha; antes ~38px)', () => {
    render(<ErrorState message="No pudimos cargar." onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: 'Reintentar' }).style.minHeight).toBe('44px')
  })
})
