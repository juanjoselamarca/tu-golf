/**
 * Resiliencia del coach (P0, 2026-06-02) — fallback degradado.
 *
 * Si la llamada principal (Anthropic streaming + tools) falla por rate-limit /
 * overload / 5xx ANTES de emitir contenido, el coach responde una vez en modo
 * DEGRADADO: una sola respuesta no-streaming vía el AI Gateway (`callLLM`), cuya
 * cadena `primary_chat` cruza a Gemini cuando Anthropic está caído. Pierde
 * streaming y tools (RAG) ese turno, pero el coach NO se cae.
 *
 * No se rehace el streaming-gateway (Fase 3 rechazada `98e6a3f`). Esto es el
 * camino mínimo que cumple CERO FALLOS reusando infra existente.
 *
 * Wiring: consumido por src/app/api/taiger/chat/route.ts en el catch del stream.
 */
import { callLLM, type LLMMessage } from '@/lib/ai'

/** Errores donde reintentar en otro proveedor tiene sentido (no errores de input). */
export function isRetryableLLMError(err: unknown): boolean {
  if (!err) return false
  const anyErr = err as { status?: number; statusCode?: number; message?: unknown }
  const status = typeof anyErr.status === 'number' ? anyErr.status
    : typeof anyErr.statusCode === 'number' ? anyErr.statusCode
    : undefined
  if (status === 429 || status === 529 || status === 503 || status === 500 || status === 502 || status === 401 || status === 402) {
    return true
  }
  const msg = typeof anyErr.message === 'string' ? anyErr.message : String(err)
  // Credit-out / billing del proveedor primario: Anthropic devuelve 400 con
  // type invalid_request_error y este mensaje cuando se acaba el saldo. NO es un
  // error de input NUESTRO → conviene cruzar a Gemini en vez de caer el coach.
  // (Visto en prod 2026-06-10: saldo agotado dejó el coach sin responder.)
  if (/credit balance|insufficient (credits?|quota|funds|balance)|billing|payment required|quota.*exceeded/i.test(msg)) {
    return true
  }
  return /overloaded|rate.?limit|429|529|too many requests|service unavailable|timeout/i.test(msg)
}

type RawMsg = { role: string; content: unknown }

/**
 * Aplana el historial del coach (que puede tener bloques tool_use/tool_result)
 * a mensajes de texto plano user/assistant, válidos para una llamada sin tools.
 * Descarta bloques no-texto y mensajes que quedan vacíos.
 */
export function toPlainMessages(conversation: RawMsg[]): LLMMessage[] {
  const out: LLMMessage[] = []
  for (const m of conversation) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    let text = ''
    if (typeof m.content === 'string') {
      text = m.content
    } else if (Array.isArray(m.content)) {
      text = m.content
        .filter((b): b is { type: string; text: string } =>
          !!b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' &&
          typeof (b as { text?: unknown }).text === 'string')
        .map((b) => b.text)
        .join('\n')
    }
    text = text.trim()
    if (text) out.push({ role: m.role, content: text })
  }
  return out
}

export interface CoachFallbackResult {
  text: string
  provider: string
  model: string
  fallbackUsed: boolean
}

/**
 * Respuesta degradada del coach vía gateway. Lanza si TODOS los proveedores de
 * la cadena fallan (AllProvidersFailedError) — el caller muestra el mensaje
 * amable y cierra.
 */
export async function coachDegradedFallback(args: {
  system: string
  messages: LLMMessage[]
  maxTokens?: number
}): Promise<CoachFallbackResult> {
  const r = await callLLM({
    role: 'primary_chat',
    system: args.system,
    messages: args.messages,
    maxTokens: args.maxTokens ?? 2048,
  })
  return { text: r.text, provider: r.provider, model: r.model, fallbackUsed: r.fallbackUsed }
}
