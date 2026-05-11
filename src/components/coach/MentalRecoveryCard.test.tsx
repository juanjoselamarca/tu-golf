import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MentalRecoveryCard } from './MentalRecoveryCard'

describe('MentalRecoveryCard', () => {
  it('renders score and band high', () => {
    render(
      <MentalRecoveryCard
        score={85}
        band="high"
        delta={3}
        title="Tu cabeza está equilibrada"
        description="Sin patrones activos, plan al 100%."
      />
    )
    // screen.getByText throws if element not found — assertion is implicit
    expect(screen.getByText('85')).toBeTruthy()
    expect(screen.getByText(/Tu cabeza está equilibrada/)).toBeTruthy()
    expect(screen.getByText(/↑ 3 sem/)).toBeTruthy()
  })

  it('renders score and band low without delta when null', () => {
    render(
      <MentalRecoveryCard
        score={28}
        band="low"
        delta={null}
        title="Tu cabeza necesita reset"
        description="3 espirales detectadas."
      />
    )
    expect(screen.getByText('28')).toBeTruthy()
    expect(screen.queryByText(/sem/)).toBeNull()
  })
})
