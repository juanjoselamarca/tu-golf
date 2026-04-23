/**
 * Tests para src/lib/constants.ts — constantes de negocio.
 *
 * Usadas en todo el proyecto. Cambios deben ser intencionales.
 */
import { describe, it, expect } from 'vitest'
import {
  TAIGER_FREE_MONTHLY_LIMIT,
  WHATSAPP_URL,
  WHATSAPP_TAIGER_PREMIUM_URL,
  VAPID_CONTACT,
} from './constants'

describe('constants', () => {
  it('TAIGER_FREE_MONTHLY_LIMIT es número positivo', () => {
    expect(typeof TAIGER_FREE_MONTHLY_LIMIT).toBe('number')
    expect(TAIGER_FREE_MONTHLY_LIMIT).toBeGreaterThan(0)
    expect(Number.isInteger(TAIGER_FREE_MONTHLY_LIMIT)).toBe(true)
  })

  it('WHATSAPP_URL es URL válida', () => {
    expect(WHATSAPP_URL).toMatch(/^https:\/\/wa\.me\//)
  })

  it('WHATSAPP_TAIGER_PREMIUM_URL compone sobre WHATSAPP_URL con ?text=', () => {
    expect(WHATSAPP_TAIGER_PREMIUM_URL).toContain(WHATSAPP_URL)
    expect(WHATSAPP_TAIGER_PREMIUM_URL).toContain('?text=')
    expect(WHATSAPP_TAIGER_PREMIUM_URL).toContain('tAIger')
  })

  it('WHATSAPP_TAIGER_PREMIUM_URL menciona Premium en el texto', () => {
    // URL-encoded "Premium" o literal
    const decoded = decodeURIComponent(WHATSAPP_TAIGER_PREMIUM_URL)
    expect(decoded).toContain('Premium')
  })

  it('VAPID_CONTACT tiene formato mailto:', () => {
    expect(VAPID_CONTACT).toMatch(/^mailto:/)
    expect(VAPID_CONTACT).toContain('@')
  })
})
