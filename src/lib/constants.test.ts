/**
 * Tests para src/lib/constants.ts — constantes de negocio.
 *
 * Usadas en todo el proyecto. Cambios deben ser intencionales.
 */
import { describe, it, expect } from 'vitest'
import {
  WHATSAPP_URL,
  VAPID_CONTACT,
} from './constants'

describe('constants', () => {
  it('WHATSAPP_URL es URL válida', () => {
    expect(WHATSAPP_URL).toMatch(/^https:\/\/wa\.me\//)
  })

  it('VAPID_CONTACT tiene formato mailto:', () => {
    expect(VAPID_CONTACT).toMatch(/^mailto:/)
    expect(VAPID_CONTACT).toContain('@')
  })
})
