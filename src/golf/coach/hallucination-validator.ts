/**
 * Hallucination Validator — corre DESPUES del stream del LLM y verifica que:
 *  (a) cualquier número con pinta de score (2-3 digitos cerca de palabras
 *      "score", "ronda", "hoyo", "putt", "fairway", "GIR", "vsPar", "+", "-")
 *      aparezca en el contexto inyectado al modelo o en el resultado de
 *      una tool call previa de esta sesion;
 *  (b) cualquier nombre de cancha citado aparezca en las rondas conocidas
 *      del jugador.
 *
 * Modo enforcement light (D6.1, 2026-05-25): el flag se expone al cliente
 * vía SSE pero NO bloquea ni degrada el response. Frontend decide si muestra
 * disclaimer. Medición previa: 7.7% flagged en prod, ~2-3 de 3 eran falsos
 * positivos (libros/duraciones). Esta rev incluye whitelist de términos
 * no-cancha y skip de números en contexto de duración + rangos.
 *
 * D6.2 pendiente: enforcement hard (degradar respuesta + retry) cuando el
 * false_positive_rate medido baje a <3% sostenido.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.8
 * Set de regresion: tests/regression/taiger-hallucination-set.json
 */

const SCORE_KEYWORDS = [
  'score', 'ronda', 'hoyo', 'putt', 'fairway', 'gir', 'vspar', 'birdie', 'bogey', 'eagle', 'doble', 'triple', 'over par', 'under par',
]

// Contextos de duración: skip números que claramente describen tiempo de práctica.
const DURATION_PATTERN = /\b(min|minuto|minutos|hr|hrs|hora|horas|seg|segundo|segundos|sem|semana|semanas|dia|día|dias|días|mes|meses)\b/

// Whitelist de términos que parecen canchas pero NO lo son. Libros de coaching,
// federaciones, marcas. Cuando aparecen tras "en X" el regex de canchas los matchea.
// Usamos `includes` (no exact match) para que entradas compuestas como
// "augusta national" matcheen aunque el regex capture solo "Augusta".
const NON_COURSE_TERMS = [
  'vision54', 'rotella', 'hogan', 'nilsson', 'marriott', 'usga', 'r&a', 'pga', 'lpga',
  'fedegolf', 'trackman', 'shotscope', 'arccos', 'garmin', 'augusta',
  'masters', 'open championship', 'us open',
]

export type HallucinationKind = 'unknown_number' | 'unknown_course'

export interface HallucinationWarning {
  kind: HallucinationKind
  evidence: string
  context_snippet: string
}

export interface ValidatorInput {
  response: string
  contextString: string
  toolResultsConcat: string
  knownCourseNames: string[]
}

export interface ValidatorOutput {
  flagged: boolean
  warnings: HallucinationWarning[]
  total_numbers_checked: number
  total_courses_checked: number
}

export function validateResponse(input: ValidatorInput): ValidatorOutput {
  const { response, contextString, toolResultsConcat, knownCourseNames } = input
  const warnings: HallucinationWarning[] = []

  const haystack = (contextString + '\n' + toolResultsConcat).toLowerCase()
  const respLower = response.toLowerCase()

  // 1) Numeros sospechosos: 2-3 digitos cerca de palabras clave de scoring
  const numberRegex = /(\b\d{2,3}\b)/g
  let totalNumbers = 0
  const checkedNumbers = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = numberRegex.exec(respLower)) !== null) {
    const num = m[1]
    if (checkedNumbers.has(num)) continue
    checkedNumbers.add(num)

    // Ventana ±25 chars alrededor del match para detectar contexto
    const start = Math.max(0, m.index - 25)
    const end = Math.min(respLower.length, m.index + num.length + 25)
    const window = respLower.slice(start, end)

    const isScoreContext = SCORE_KEYWORDS.some(k => window.includes(k))
    if (!isScoreContext) continue

    // Skip si el contexto es duración de práctica (ej: "45-60 min", "30 minutos").
    if (DURATION_PATTERN.test(window)) continue

    // Skip si el número está dentro de un rango "X-Y" o "X–Y" (range, no score puntual).
    const rangeRegex = new RegExp(`\\d+\\s*[-–]\\s*${num}\\b|\\b${num}\\s*[-–]\\s*\\d+`)
    if (rangeRegex.test(window)) continue

    totalNumbers++

    // Numeros < 30 son comúnmente referencia a hoyo (1-18) o handicaps (0-30)
    // y dan demasiados FPs. Solo flagueamos numeros >= 30 (más probables score).
    if (parseInt(num, 10) < 30) continue

    // Si el número aparece textualmente en el haystack (contexto + tool results), OK
    if (haystack.includes(num)) continue

    warnings.push({
      kind: 'unknown_number',
      evidence: num,
      context_snippet: window.slice(0, 80),
    })
  }

  // 2) Nombres de canchas citadas que no estan en las rondas conocidas
  let totalCourses = 0
  for (const name of knownCourseNames) {
    void name // referencia, ya estan en haystack
  }
  // Detectar menciones tipo "en {cancha}" o "jugaste {cancha}". Heuristica simple:
  // buscar patrones "en (Cap. inicial seguido de palabras)" — sin LLM, esto es
  // limitado. Lo mantenemos minimo: si aparece "club" o "cancha" + nombre y ese
  // nombre no esta en knownCourseNames lower-cased, flag.
  const knownLower = knownCourseNames.map(s => s.toLowerCase())
  const courseHints = /\b(en|jugaste(?: en)?|cancha|club)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+(?:de|del|la|los|las|el)\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/g
  let cm: RegExpExecArray | null
  while ((cm = courseHints.exec(response)) !== null) {
    const cited = cm[2].trim()
    if (!cited) continue
    const citedLower = cited.toLowerCase()

    // Skip términos famosos no-cancha (libros de coaching, federaciones, marcas).
    if (NON_COURSE_TERMS.some(t => citedLower.includes(t) || t.includes(citedLower))) continue

    totalCourses++

    // Match suave: si alguna conocida contiene la citada o viceversa, OK.
    const known = knownLower.some(k => k.includes(citedLower) || citedLower.includes(k))
    if (known) continue

    // Si la cancha citada NO aparece en haystack (que incluye el contexto
    // donde van todas las rondas) → flag.
    if (haystack.includes(citedLower)) continue

    warnings.push({
      kind: 'unknown_course',
      evidence: cited,
      context_snippet: cm[0].slice(0, 80),
    })
  }

  return {
    flagged: warnings.length > 0,
    warnings,
    total_numbers_checked: totalNumbers,
    total_courses_checked: totalCourses,
  }
}
