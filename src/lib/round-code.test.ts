/**
 * Tests para src/lib/round-code.ts — generador de códigos de ronda.
 *
 * Directiva CERO FALLOS: el código se lee en cancha, se dicta por voz, se
 * copia desde WhatsApp. Chars ambiguos (I/1, O/0, L/1, B/8) causan que
 * jugadores se pierdan la ronda → churn inmediato.
 *
 * Cobertura previa: 0%.
 */
import { describe, it, expect } from 'vitest'
import {
  generateRoundCode,
  isValidRoundCode,
  normalizeRoundCode,
  formatRoundCodeForDisplay,
} from './round-code'

const UNAMBIGUOUS_ALPHABET = 'ACDEFGHJKMNPQRSTVWXYZ2345679'
const AMBIGUOUS_CHARS = ['0', '1', 'B', '8', 'I', 'L', 'O', 'U']

describe('generateRoundCode', () => {
  it('devuelve string de 6 caracteres', () => {
    const code = generateRoundCode()
    expect(code).toHaveLength(6)
  })

  it('solo usa caracteres del alfabeto no-ambiguo', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoundCode()
      for (const ch of code) {
        expect(UNAMBIGUOUS_ALPHABET).toContain(ch)
      }
    }
  })

  it('nunca incluye chars ambiguos (0, 1, B, 8, I, L, O, U)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoundCode()
      for (const bad of AMBIGUOUS_CHARS) {
        expect(code).not.toContain(bad)
      }
    }
  })

  it('genera códigos distintos (no colisiona fácilmente)', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i++) codes.add(generateRoundCode())
    // En 100 runs, >= 95 deben ser distintos (probabilidad de colisión es ~0 con 22^6=113M)
    expect(codes.size).toBeGreaterThanOrEqual(95)
  })
})

describe('isValidRoundCode', () => {
  it('código válido de 6 chars → true', () => {
    expect(isValidRoundCode('ACDEFG')).toBe(true)
    expect(isValidRoundCode('2345SZ')).toBe(true)
  })

  it('código generado pasa validación', () => {
    for (let i = 0; i < 20; i++) {
      expect(isValidRoundCode(generateRoundCode())).toBe(true)
    }
  })

  it('lowercase normalizado → true', () => {
    expect(isValidRoundCode('acdefg')).toBe(true)
  })

  it('código vacío o null → false', () => {
    expect(isValidRoundCode('')).toBe(false)
  })

  it('longitud incorrecta → false', () => {
    expect(isValidRoundCode('ACD')).toBe(false)
    expect(isValidRoundCode('ACDEFGH')).toBe(false)
  })

  it('contiene char ambiguo → false', () => {
    expect(isValidRoundCode('ACDEF0')).toBe(false) // 0
    expect(isValidRoundCode('ACDEF1')).toBe(false) // 1
    expect(isValidRoundCode('ACDEFI')).toBe(false) // I
    expect(isValidRoundCode('ACDEFL')).toBe(false) // L
    expect(isValidRoundCode('ACDEFO')).toBe(false) // O
    expect(isValidRoundCode('ACDEFB')).toBe(false) // B
    expect(isValidRoundCode('ACDEF8')).toBe(false) // 8
  })

  it('contiene espacio o guion → false', () => {
    expect(isValidRoundCode('ACD-FG')).toBe(false)
    expect(isValidRoundCode('ACD FG')).toBe(false)
  })
})

describe('normalizeRoundCode', () => {
  it('uppercase + trim espacios/guiones/underscore', () => {
    expect(normalizeRoundCode('acd-efg')).toBe('ACDEFG')
    expect(normalizeRoundCode('acd efg')).toBe('ACDEFG')
    expect(normalizeRoundCode('acd_efg')).toBe('ACDEFG')
  })

  it('input vacío → ""', () => {
    expect(normalizeRoundCode('')).toBe('')
  })

  it('no-modifica si ya está normalizado', () => {
    expect(normalizeRoundCode('ACDEFG')).toBe('ACDEFG')
  })

  it('acepta chars ambiguos pero retorna el string (caller decide con isValidRoundCode)', () => {
    // normalize no filtra chars ambiguos — es responsabilidad de isValidRoundCode
    const result = normalizeRoundCode('ACDEF0')
    expect(result).toBe('ACDEF0')
    expect(isValidRoundCode(result)).toBe(false)
  })

  it('maneja múltiples separadores combinados', () => {
    expect(normalizeRoundCode('a-b c_d-e f')).toBe('ABCDEF')
  })
})

describe('formatRoundCodeForDisplay', () => {
  it('código de 6 chars → "XXX YYY"', () => {
    expect(formatRoundCodeForDisplay('ACDEFG')).toBe('ACD EFG')
  })

  it('lowercase → uppercase en display', () => {
    expect(formatRoundCodeForDisplay('acdefg')).toBe('ACD EFG')
  })

  it('código vacío → ""', () => {
    expect(formatRoundCodeForDisplay('')).toBe('')
  })

  it('longitud ≠ 6 → devuelve uppercase sin formatear', () => {
    expect(formatRoundCodeForDisplay('ABC')).toBe('ABC')
    expect(formatRoundCodeForDisplay('ABCDEFGH')).toBe('ABCDEFGH')
  })
})
