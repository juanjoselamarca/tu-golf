/**
 * Generador de códigos de ronda sin caracteres ambiguos.
 *
 * Regla CERO FALLOS: el código se lee en cancha, se dicta por voz, se copia
 * desde WhatsApp. Chars ambiguos (I/1, O/0, L/1, B/8) causan que jugadores
 * se pierdan la ronda → churn inmediato.
 *
 * Alfabeto: Crockford base32 sin I, L, O, U (26 chars). Excluimos también 0, 1, B, 8
 * para evitar confusión visual incluso en mono font.
 *
 * Resultado: 6 chars → 22^6 = 113M combinaciones, suficiente para no colisionar.
 */

const UNAMBIGUOUS_ALPHABET = 'ACDEFGHJKMNPQRSTVWXYZ2345679'

const CODE_LENGTH = 6

export function generateRoundCode(): string {
  let code = ''
  const alphabet = UNAMBIGUOUS_ALPHABET
  const len = alphabet.length

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(CODE_LENGTH)
    crypto.getRandomValues(buf)
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += alphabet[buf[i] % len]
    }
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += alphabet[Math.floor(Math.random() * len)]
    }
  }

  return code
}

export function isValidRoundCode(code: string): boolean {
  if (!code || code.length !== CODE_LENGTH) return false
  const normalized = code.toUpperCase()
  for (const ch of normalized) {
    if (!UNAMBIGUOUS_ALPHABET.includes(ch)) return false
  }
  return true
}

export function normalizeRoundCode(input: string): string {
  if (!input) return ''
  const substitutions: Record<string, string> = {
    '0': 'O_INVALID',
    '1': 'I_INVALID',
    'I': 'I_INVALID',
    'L': 'L_INVALID',
    'O': 'O_INVALID',
    'B': '8_INVALID',
    '8': '8_INVALID',
  }
  const upper = input.toUpperCase().replace(/\s|-|_/g, '')
  for (const [bad, replacement] of Object.entries(substitutions)) {
    if (upper.includes(bad)) {
      return upper
    }
  }
  return upper
}

export function formatRoundCodeForDisplay(code: string): string {
  if (!code) return ''
  const normalized = code.toUpperCase()
  if (normalized.length === 6) {
    return `${normalized.slice(0, 3)} ${normalized.slice(3)}`
  }
  return normalized
}
