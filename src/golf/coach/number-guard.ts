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
// Unidad de duración/tiempo INMEDIATAMENTE pegada al número ("45 minutos", "90 días").
// Se chequea la adyacencia, NO la mera co-ocurrencia en la ventana: si no, frases
// normales como "el objetivo del día es 80" o "esta semana apuntá a 80" dejarían
// pasar un absoluto fabricado (P0 detectado en review 2026-06-05).
const DURATION_UNIT_AFTER = /^\s*(min|minutos?|hr|horas?|seg|segundos?|sem|semanas?|d[ií]as?|mes(es)?|a[nñ]os?)\b/i
// Unidad de DISTANCIA pegada al número ("150 metros", "200 yardas") → no es un score.
const DISTANCE_UNIT_AFTER = /^\s*(m|mts?|metros?|yd|yardas?)\b/i
// El número viene inmediatamente DESPUÉS de "par" ("par 72", "par 71", "par 36") → es
// el PAR de la cancha/nine, no un score fabricado. Un score fabricado nunca dice "par 85".
const PAR_VALUE_BEFORE = /\bpar\s*$/i

// ¿hay un keyword de score en la ventana? 'par' se chequea como PALABRA COMPLETA
// (\bpar\b) para que NO matchee "para", "comparar", "separado", "preparar" — el falso
// positivo que secuestraba turnos no-score (H-01). El resto va por substring (las
// acentuadas como "apuntá" rompen \b en JS; no son propensas a falsos positivos).
function windowHasScoreKeyword(win: string): boolean {
  // \bpar(es)?\b matchea "par" y "pares" (plural de golf legítimo) pero NO
  // "para"/"comparar"/"separado"/"preparar".
  return SCORE_KEYWORDS.some((k) => (k === 'par' ? /\bpar(es)?\b/.test(win) : win.includes(k)))
}

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
    if (!windowHasScoreKeyword(window)) continue // no es claim de score
    // Exención de duración / distancia: SOLO si la unidad está pegada ("45 minutos", "150 metros").
    const after = input.text.slice(at + m[1].length, at + m[1].length + 16)
    if (DURATION_UNIT_AFTER.test(after)) continue // es una duración, no un score
    if (DISTANCE_UNIT_AFTER.test(after)) continue // es una distancia, no un score
    const n = parseInt(num.replace('+', ''), 10)
    // Exención de PAR: el número es el par de la cancha ("par 72"), no un score. CON
    // TOPE DE MAGNITUD (≤73): un par real es ~70-73 (18h) o ~36 (9h); jamás 85/95. Sin
    // el tope, un score fabricado disfrazado de "par 85" se colaría (BLOCKER del review).
    const before = lower.slice(Math.max(0, at - 8), at)
    if (PAR_VALUE_BEFORE.test(before) && n <= 73) continue
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
