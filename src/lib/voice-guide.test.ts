/**
 * Tests para src/lib/voice-guide.ts — guardrails de voz del producto.
 *
 * Regla ADR-007: cero emojis, cero "!", cero "ups/oops", cero diminutivos,
 * español LatAm neutro. Estos tests EVITAN que se cuelen contra la
 * referencia establecida.
 */
import { describe, it, expect } from 'vitest'
import { EMPTY_STATES, ERROR_MESSAGES, LABELS } from './voice-guide'

const allStrings = [
  ...Object.values(EMPTY_STATES),
  ...Object.values(ERROR_MESSAGES),
  ...Object.values(LABELS),
]

describe('voice-guide — shape de los exports', () => {
  it('EMPTY_STATES tiene los 7 estados esperados', () => {
    expect(Object.keys(EMPTY_STATES)).toEqual([
      'noRounds', 'noStats', 'noTournaments',
      'noCoach', 'noLeaderboard', 'noConnection', 'noImports',
    ])
  })

  it('ERROR_MESSAGES tiene los 7 mensajes esperados', () => {
    expect(Object.keys(ERROR_MESSAGES)).toEqual([
      'saveFailed', 'roundFinalized', 'tournamentInactive',
      'noPermission', 'sessionExpired', 'notFound', 'generic',
    ])
  })

  it('LABELS tiene los 10 labels esperados', () => {
    expect(Object.keys(LABELS).length).toBe(10)
    expect(LABELS.createRound).toBeTruthy()
    expect(LABELS.confirm).toBeTruthy()
  })
})

describe('voice-guide — guardrails de voz (ADR-007)', () => {
  it('ningún string contiene "!"', () => {
    for (const s of allStrings) {
      expect(s, `"${s}" no debe contener signo de exclamación`).not.toContain('!')
    }
  })

  it('ningún string contiene emoji (rango Unicode)', () => {
    // codePointAt evita el flag /u que requiere target ES6+ en tsconfig
    function hasEmoji(s: string): boolean {
      for (let i = 0; i < s.length; i++) {
        const cp = s.codePointAt(i)
        if (cp === undefined) continue
        if ((cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF)) return true
      }
      return false
    }
    for (const s of allStrings) {
      expect(hasEmoji(s), `"${s}" contiene emoji`).toBe(false)
    }
  })

  it('ningún string empieza con "Ups" u "Oops" (voz derrotista)', () => {
    for (const s of allStrings) {
      const lower = s.toLowerCase()
      expect(lower.startsWith('ups')).toBe(false)
      expect(lower.startsWith('oops')).toBe(false)
    }
  })

  it('ningún string usa "vos" (voseo argentino — ver ADR-007)', () => {
    // Regla: siempre "tú", nunca "vos"
    for (const s of allStrings) {
      // Buscamos "vos" como palabra entera, no como substring (evita "nosotros")
      const hasVos = /\bvos\b/i.test(s)
      expect(hasVos, `"${s}" usa "vos" — debe ser "tú"`).toBe(false)
    }
  })

  it('todos los strings tienen longitud mínima razonable (>3 chars)', () => {
    for (const s of allStrings) {
      expect(s.length).toBeGreaterThan(3)
    }
  })

  it('todos los strings son strings no vacíos', () => {
    for (const s of allStrings) {
      expect(typeof s).toBe('string')
      expect(s.length).toBeGreaterThan(0)
    }
  })
})

describe('voice-guide — contenido específico', () => {
  it('noRounds habla del comienzo ("primera ronda")', () => {
    expect(EMPTY_STATES.noRounds).toContain('primera ronda')
  })

  it('noConnection menciona offline sync ("se guardaran")', () => {
    expect(EMPTY_STATES.noConnection).toContain('guardaran')
  })

  it('saveFailed incluye acción (Reintentar)', () => {
    expect(ERROR_MESSAGES.saveFailed).toContain('Reintentar')
  })

  it('LABELS.cancel es "Cancelar" (no "Cancel")', () => {
    expect(LABELS.cancel).toBe('Cancelar')
  })

  it('LABELS.save es "Guardar" (español)', () => {
    expect(LABELS.save).toBe('Guardar')
  })
})
