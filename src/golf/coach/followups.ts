// Follow-up chips (estilo Perplexity): tras una respuesta del coach tAIger+,
// sugiere 2-3 preguntas de seguimiento que el jugador podría querer hacer.
//
// La GENERACIÓN vive en un endpoint AISLADO (/api/taiger/followups) con Haiku,
// llamado por el cliente DESPUÉS de que el stream SSE cierra (enmienda E1): así es
// IMPOSIBLE que rompa la respuesta principal — está fuera del path del stream. Si
// falla o viene vacío, no se muestran chips (ausencia elegante — CERO FALLOS).
//
// Acá vive la lógica PURA y testeable: armar el request y parsear/validar la
// salida JSON. El handler solo orquesta auth + rate-limit + callLLM.

export const FOLLOWUPS_MAX = 3
/** Largo máximo de una pregunta sugerida (se descartan las más largas). */
export const FOLLOWUP_MAX_LEN = 90
const MAX_QUESTION_CHARS = 600
const MAX_ANSWER_CHARS = 1200

export interface FollowupsRequest {
  system: string
  messages: { role: 'user'; content: string }[]
}

const SYSTEM = `Eres el motor de "preguntas de seguimiento" del coach de golf tAIger+.
Dado el último intercambio entre el jugador y el coach, propón 2 o 3 preguntas CORTAS
que el jugador podría querer hacerle al coach a continuación, en su voz (primera
persona) y en español chileno de TÚ — nunca voseo (escribe "¿Cómo entreno…?", jamás
"¿Cómo entrenás…?").
Reglas:
- Cada pregunta < 90 caracteres, accionable y específica al tema del intercambio.
- NO repitas lo que el coach ya respondió; abre un siguiente paso natural.
- Si no hay un seguimiento útil y honesto, devuelve la lista vacía. No inventes.
Responde SOLO con JSON válido, sin texto extra: {"questions": ["…", "…"]}`

/**
 * Arma el request para el LLM a partir del último intercambio (pregunta del
 * jugador + respuesta del coach). Trunca defensivamente para acotar el costo
 * (presupuesto <500 tokens/turno).
 */
export function buildFollowupsRequest(userText: string, assistantText: string): FollowupsRequest {
  const q = (userText ?? '').trim().slice(0, MAX_QUESTION_CHARS)
  const a = (assistantText ?? '').trim().slice(0, MAX_ANSWER_CHARS)
  return {
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Jugador preguntó:\n${q}\n\nCoach respondió:\n${a}\n\nDevuelve el JSON con 2-3 preguntas de seguimiento.`,
    }],
  }
}

/**
 * Parsea la salida del LLM a una lista limpia de preguntas. Robusto a JSON
 * malformado, forma inesperada, vacíos, duplicados y preguntas demasiado largas.
 * Acepta tanto `{"questions": [...]}` como un array crudo `[...]`. Devuelve a lo
 * sumo FOLLOWUPS_MAX. Si algo no encaja, devuelve [] (no rompe el chat).
 */
export function parseFollowups(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  const arr: unknown[] = Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && Array.isArray((data as { questions?: unknown }).questions))
      ? (data as { questions: unknown[] }).questions
      : []

  const seen = new Set<string>()
  const out: string[] = []
  for (const item of arr) {
    if (typeof item !== 'string') continue
    const s = item.trim().replace(/\s+/g, ' ')
    if (!s || s.length > FOLLOWUP_MAX_LEN) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= FOLLOWUPS_MAX) break
  }
  return out
}
