// Ventana de historial del coach: fuente ÚNICA de cómo se recorta la conversación
// que viaja al LLM. Antes esto vivía DUPLICADO y divergente: el cliente
// (useTaigerChat.ts) hacía slice(-30) + truncado a 2000 chars, y el server
// (route.ts) hacía slice(-20) + schema max 2000. Resultado (auditoría 2026-06-27,
// H-07/H-08): el coach perdía el hilo pasados ~10 turnos y sus PROPIOS planes
// largos (un plan semanal ~2700 chars > 2000) llegaban mutilados como historial,
// así que "no releía sus planes". H-03 ya persiste el historial completo, así que
// acá solo se decide QUÉ tramo reciente se manda al modelo.
//
// La regla nueva: ventana por PRESUPUESTO DE TOKENS (mantener los mensajes más
// recientes que quepan en `COACH_HISTORY_TOKEN_BUDGET`, SIN cortar ninguno por la
// mitad), con dos guardas anti-abuso: tope de mensajes y tope de chars por mensaje.

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

/** Presupuesto de tokens del historial que viaja al LLM (aprox). Techo de costo. */
export const COACH_HISTORY_TOKEN_BUDGET = 30_000

/** Tope duro de mensajes en el array (guarda anti-payload gigante). */
export const COACH_HISTORY_MAX_MESSAGES = 100

/**
 * Tope de chars por mensaje. 8000 chars ≈ 2000 tokens: entra un plan semanal
 * completo del coach (~450 palabras ≈ 2700 chars) con holgura, y aún así frena
 * un mensaje patológico. Debe coincidir con el `.max()` del schema en el route.
 */
export const COACH_MSG_MAX_CHARS = 8_000

/**
 * Estima tokens de un texto con la heurística chars/4 (conservadora para español).
 * No necesita ser exacta: solo acota el presupuesto del historial.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function capContent(content: string): string {
  return content.length > COACH_MSG_MAX_CHARS ? content.slice(0, COACH_MSG_MAX_CHARS) : content
}

/**
 * Mantiene los mensajes MÁS RECIENTES cuya suma estimada de tokens no exceda
 * `budgetTokens`, sin cortar ningún mensaje por la mitad. Siempre conserva al
 * menos el último mensaje (aunque por sí solo exceda el presupuesto) para no
 * dejar la conversación vacía. Preserva el orden original.
 */
export function windowByTokenBudget<T extends { content: string }>(
  messages: T[],
  budgetTokens: number,
): T[] {
  if (messages.length === 0) return []
  const kept: T[] = []
  let total = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateTokens(messages[i].content)
    if (kept.length > 0 && total + t > budgetTokens) break
    kept.unshift(messages[i])
    total += t
  }
  return kept
}

/**
 * Prepara el historial para enviar al LLM. Fuente única usada por el cliente
 * (antes del POST) y el server (defensa idempotente):
 *   1. filtra mensajes vacíos,
 *   2. recorta cada uno a COACH_MSG_MAX_CHARS,
 *   3. limita a los últimos COACH_HISTORY_MAX_MESSAGES,
 *   4. aplica la ventana por presupuesto de tokens.
 * NO filtra por rol ni impone "primero/último = user" (eso es responsabilidad del
 * server, que además lo exige Anthropic).
 */
export function prepareCoachHistory(messages: ChatMsg[]): ChatMsg[] {
  const cleaned = messages
    .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-COACH_HISTORY_MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: capContent(m.content) }))
  return windowByTokenBudget(cleaned, COACH_HISTORY_TOKEN_BUDGET)
}
