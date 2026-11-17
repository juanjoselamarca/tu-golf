import { describe, it, expect } from 'vitest'
import { textoCountdown } from './TournamentCountdown'

// Mediodía de Chile del 17-nov-2026.
const AHORA = new Date('2026-11-17T15:00:00Z')
const abierto = (dateStart: string | null, dateEnd: string | null = null) => ({ status: 'open', dateStart, dateEnd })

describe('textoCountdown', () => {
  it('cuenta días calendario de Chile', () => {
    expect(textoCountdown(abierto('2026-11-17'), AHORA)).toBe('Hoy')
    expect(textoCountdown(abierto('2026-11-18'), AHORA)).toBe('Mañana')
    expect(textoCountdown(abierto('2026-11-27'), AHORA)).toBe('Faltan 10 días')
    expect(textoCountdown(abierto('2028-03-01'), AHORA)).toMatch(/^Faltan \d+ días$/)
  })

  it('23:00 de Chile del 17 (02:00 UTC del 18): el torneo del 18 es "Mañana", no desaparece', () => {
    expect(textoCountdown(abierto('2026-11-18'), new Date('2026-11-18T02:00:00Z'))).toBe('Mañana')
  })

  it('no se muestra si la fecha pasó, sin fecha, o si no está con inscripciones abiertas', () => {
    expect(textoCountdown(abierto('2026-11-16'), AHORA)).toBeNull()
    expect(textoCountdown(abierto('2026-10-30'), AHORA)).toBeNull()
    expect(textoCountdown(abierto(null), AHORA)).toBeNull()
    expect(textoCountdown({ status: 'in_progress', dateStart: '2026-11-20', dateEnd: null }, AHORA)).toBeNull()
    expect(textoCountdown({ status: 'draft', dateStart: '2026-11-20', dateEnd: null }, AHORA)).toBeNull()
  })
})
