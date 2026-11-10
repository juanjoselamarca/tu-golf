import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

import { OnboardingWizard } from './OnboardingWizard'

// Regresión del 10-nov-2026: el botón principal del onboarding ("Siguiente") era
// el único botón dorado sólido de la app con texto blanco: #fff sobre #C4992A da
// ~2,6:1 y reprueba WCAG AA. DESIGN.md §5: `commit` = dorado sólido, texto negro.
// La fuente canónica es var(--brand-dark) (#070D18, ~7,4:1), la que usan los otros
// ~50 botones `background: var(--brand)`.

describe('OnboardingWizard · CTA dorado legible', () => {
  it('"Siguiente" usa texto navy (--brand-dark) sobre el dorado, no blanco', () => {
    render(<OnboardingWizard userId="u1" userName="Ana" />)
    const cta = screen.getByRole('button', { name: 'Siguiente' })
    expect(cta.style.background).toBe('var(--brand)')
    expect(cta.style.color).toBe('var(--brand-dark)')
  })
})
