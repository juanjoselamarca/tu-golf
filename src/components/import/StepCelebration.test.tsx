/**
 * Regresión inbox ccadf3c4 (08-jun-2026): tras importar exitosamente, la pantalla
 * quedaba EN BLANCO para usuarios con <3 rondas históricas.
 *
 * Causa raíz: el CPI solo se calcula con ≥3 rondas (api/import/confirm), así que
 * un usuario nuevo recibía `cpiResult: null` en 200 OK. ImportWizard guardaba la
 * celebración con `state.step === 'celebration' && state.cpiResult`, que con null
 * evaluaba a false → no renderizaba nada → pantalla en blanco pese a import OK.
 *
 * Estos tests fijan el contrato: StepCelebration renderiza el éxito SIN depender
 * de cpiResult. Si alguien vuelve a acoplar la celebración al CPI, esto se rompe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import StepCelebration from './StepCelebration'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// El effect hace createClient().from('historical_rounds').select(..., {count}).
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ count: 1, error: null }),
    }),
  }),
}))

describe('StepCelebration — resiliente a cpiResult null (inbox ccadf3c4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renderiza el éxito aunque cpiResult sea null (usuario nuevo, <3 rondas)', () => {
    render(<StepCelebration cpiResult={null} insights={[]} roundCount={1} />)
    expect(screen.getByText('Tarjeta guardada')).toBeTruthy()
  })

  it('renderiza el resumen en plural con cpiResult null y varias tarjetas', () => {
    render(<StepCelebration cpiResult={null} insights={[]} roundCount={3} />)
    expect(screen.getByText('3 tarjetas guardadas')).toBeTruthy()
  })
})
