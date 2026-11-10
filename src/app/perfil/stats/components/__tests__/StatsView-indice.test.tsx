// /perfil/stats: el par de índices muestra los plus con "+" y el umbral del Índice Golfers+ sale de la
// tabla WHS ("rondas válidas"), no de un "3+ rondas" que contaba todas las rondas.
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/components/billing/ProGate', () => ({ ProGate: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))

import { StatsView } from '../StatsView'
import { MIN_DIFERENCIALES_INDICE } from '@/golf/core/whs-index'

describe('StatsView — índices', () => {
  it('los plus llevan "+"', () => {
    const { container } = render(<StatsView allRounds={[]} profileIndex={{ indice: -0.4, indice_golfers: -1 }} />)
    expect(container.textContent).toContain('+0.4')
    expect(container.textContent).toContain('+1.0')
  })

  it('sin Índice Golfers+: pide rondas válidas con el mínimo WHS', () => {
    const { container } = render(<StatsView allRounds={[]} profileIndex={{ indice: 12, indice_golfers: null }} />)
    expect(container.textContent).toContain('12.0')
    expect(container.textContent).toContain(`${MIN_DIFERENCIALES_INDICE} rondas válidas para activar`)
    expect(container.textContent).not.toContain('3+ rondas')
  })
})
