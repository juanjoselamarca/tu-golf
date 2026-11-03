import { describe, it, expect } from 'vitest'
import { NOMBRE_DE_PLAN, esPlanPago, tierDePerfil } from './nombre-de-plan'
import { TIERS } from './plans'

describe('nombre-de-plan', () => {
  it('cada tier tiene su nombre en la UI', () => {
    for (const t of TIERS) expect(NOMBRE_DE_PLAN[t]).toBeTruthy()
  })

  it('free no es plan de pago; pro y pro_plus sí', () => {
    expect(esPlanPago('free')).toBe(false)
    expect(esPlanPago('pro')).toBe(true)
    expect(esPlanPago('pro_plus')).toBe(true)
  })

  it('free se escribe "Gratis" y nunca "PRO"', () => {
    expect(NOMBRE_DE_PLAN.free).toBe('Gratis')
    expect(NOMBRE_DE_PLAN.free).not.toContain('PRO')
  })

  describe('tierDePerfil — lo que viene de la base', () => {
    it('devuelve el tier cuando es válido', () => {
      for (const t of TIERS) expect(tierDePerfil(t)).toBe(t)
    })

    it('sin valor → free', () => {
      expect(tierDePerfil(null)).toBe('free')
      expect(tierDePerfil(undefined)).toBe('free')
      expect(tierDePerfil('')).toBe('free')
    })

    it('un valor basura NO se cuela como plan de pago', () => {
      for (const basura of ['PRO', 'premium', 'pro ', 'Pro', 0, 1, true, {}, []]) {
        expect(tierDePerfil(basura)).toBe('free')
        expect(esPlanPago(tierDePerfil(basura))).toBe(false)
      }
    })
  })
})
