import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MentalRecoveryCard } from './MentalRecoveryCard'

const umbrales = { media: 50, alta: 60 }

describe('MentalRecoveryCard', () => {
  it('renders score and band high', () => {
    render(
      <MentalRecoveryCard
        score={85}
        band="high"
        delta={3}
        title="Cortas la mayoría de tus malos hoyos"
        description="Cortaste 30 de tus 35 bogeys en el hoyo siguiente."
        umbrales={umbrales}
      />
    )
    // screen.getByText throws if element not found — assertion is implicit
    expect(screen.getByText('85')).toBeTruthy()
    expect(screen.getByText(/Cortas la mayoría/)).toBeTruthy()
    expect(screen.getByText(/↑ 3 sem/)).toBeTruthy()
  })

  it('renders score and band low without delta when null', () => {
    render(
      <MentalRecoveryCard
        score={28}
        band="low"
        delta={null}
        title="Más de la mitad de tus bogeys traen otro detrás"
        description="Cortaste 4 de tus 14 bogeys en el hoyo siguiente."
        umbrales={umbrales}
      />
    )
    expect(screen.getByText('28')).toBeTruthy()
    expect(screen.queryByText(/sem/)).toBeNull()
  })

  // Vuelta 1: la barra mide las bandas reales (0–49, 50–59, 60–100), no tercios.
  it('la barra reparte la escala según los cortes reales de banda', () => {
    const { container } = render(
      <MentalRecoveryCard score={55} band="mid" delta={null} title="t" description="d" umbrales={umbrales} />
    )
    const ancho = (b: string) => (container.querySelector(`[data-banda="${b}"]`) as HTMLElement).style.width
    expect([ancho('low'), ancho('mid'), ancho('high')]).toEqual(['50%', '10%', '40%'])
    expect((container.querySelector('[data-banda="mid"]') as HTMLElement).style.opacity).toBe('1')
  })
})

// Vuelta 1: con rondas pero sin bogeys suficientes la home no queda muda.
describe('MentalRecoveryCard — sin datos suficientes', () => {
  it('dice qué falta, sin número, sin "/ 100" y sin barra', () => {
    const { container } = render(
      <MentalRecoveryCard score={null} description="Necesitamos tarjetas hoyo a hoyo con par para medir tu recuperación" />
    )
    expect(screen.getByText('Mental Index')).toBeTruthy()
    expect(screen.getByText(/Necesitamos tarjetas hoyo a hoyo con par/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/\d/)
    expect(container.querySelector('[data-banda]')).toBeNull()
  })
})
