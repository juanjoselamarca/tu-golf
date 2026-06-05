// src/golf/coach/number-guard.ts
// Guard de PROCEDENCIA (no de comprensión). No interpreta la frase: solo verifica
// que cada número con pinta de score salga de una fuente determinista (allowedNumbers
// = contexto inyectado + resultados de tools, incl. compute_score_projection).
// Ante la duda: bloquea. NUNCA adivina una corrección.

const SCORE_KEYWORDS = [
  'score', 'ronda', 'hoyo', 'putt', 'par', 'bogey', 'birdie', 'eagle', 'doble', 'triple',
  'objetivo', 'terminás', 'terminas', 'terminar', 'sobre par', 'bajo par', 'tirar', 'tirás',
  'tiras', 'bajar a', 'bajás a', 'bajas a', 'cerrar en', 'hacés', 'haces', 'anotar', 'apuntá',
  'apunta',
]
const DURATION = /\b(min|minuto|minutos|hr|hora|horas|seg|segundo|sem|semana|semanas|dia|día|dias|días|mes|meses)\b/

export interface GuardInput {
  text: string
  /** Números (como string, incl. relativos "+12") presentes en contexto + tool results. */
  allowedNumbers: string[]
}
export interface GuardResult {
  blocked: boolean
  offending: string[]
}

export function guardNumbers(input: GuardInput): GuardResult {
  const allowed = new Set(input.allowedNumbers.map((s) => s.replace(/\s/g, '')))
  const lower = input.text.toLowerCase()
  const offending: string[] = []
  const re = /([+-]?\b\d{2,3}\b)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input.text)) !== null) {
    const num = m[1].replace(/\s/g, '')
    const at = m.index
    const window = lower.slice(Math.max(0, at - 25), Math.min(lower.length, at + num.length + 25))
    if (!SCORE_KEYWORDS.some((k) => window.includes(k))) continue // no es claim de score
    if (DURATION.test(window)) continue // duración de práctica
    const n = parseInt(num.replace('+', ''), 10)
    if (n < 30 && !num.startsWith('+') && !num.startsWith('-')) continue // hoyos/handicaps chicos
    if (allowed.has(num) || allowed.has(num.replace('+', ''))) continue // trazable
    offending.push(num)
  }
  return { blocked: offending.length > 0, offending }
}

/** Números autorizados para prosa: salidas de la tool de este turno + valores exactos del contexto. */
export function collectAuthorizedNumbers(toolResults: string[], contextString: string): string[] {
  const out = new Set<string>()
  const grab = (s: string) => {
    const m = s.match(/[+-]?\b\d{2,3}\b/g)
    ;(m ?? []).forEach((n) => out.add(n.replace(/\s/g, '')))
  }
  toolResults.forEach(grab) // incluye absolute/over/relativeLabel de compute_score_projection
  grab(contextString)
  return Array.from(out)
}
