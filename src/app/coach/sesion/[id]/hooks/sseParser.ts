import type { AssignedPlan } from '@/components/coach/PlanAssignedCard'
import type { RoundSummary } from '@/components/coach/RoundMiniChart'
import type { ScoreProjection } from '@/components/coach/ScoreProjectionCard'

/**
 * Parsing PURO del protocolo SSE del coach (extraído de page.tsx para poder
 * testearlo — antes del refactor NO tenía test, ver enmienda E3 del plan).
 *
 * CRÍTICO — protocolo con fix P0 del 11-may (buffer de frames partidos).
 * El consumidor (useTaigerChat) es dueño del loop de bytes y DEBE preservar
 * exactamente:
 *   - `decoder.decode(value, { stream: true })` entre cada `reader.read()`,
 *   - el split por `\n\n` (separador SSE real),
 *   - dejar el último frame parcial en el buffer hasta el próximo read,
 *   - el flush final con `decoder.decode()`.
 * Este módulo NO toca bytes: solo interpreta una línea ya completa.
 */

/** Evento decodificado de una línea SSE `data: {...}`. */
export type SseEvent =
  | { kind: 'text'; text: string }
  | { kind: 'tool_start'; label: string }
  | { kind: 'tool_done'; round?: RoundSummary }
  | { kind: 'plan_assigned'; plan: AssignedPlan }
  | { kind: 'score_projection'; projection: ScoreProjection }
  | { kind: 'done'; sessionId: string }
  | { kind: 'error'; message: string }

/**
 * Convierte UNA línea SSE en cero o más eventos estructurados.
 *
 * Devuelve un array para preservar EXACTAMENTE el comportamiento original de
 * `handleSseLine`: en el código previo los chequeos eran `if` independientes
 * (no `else if`), así que un mismo objeto JSON podía disparar varias acciones
 * (p. ej. `text` + `done` en el mismo frame). Mantenemos ese orden y esa
 * semántica multi-evento.
 *
 * Líneas que no aportan nada (keepalive `: keepalive`, líneas sin `data: `,
 * o JSON malformado por un frame partido que cayó al catch) devuelven `[]`.
 * No lanza: una línea malformada es ruido del server si el buffer está bien
 * armado (mismo catch silencioso del original).
 */
export function parseSseLine(line: string): SseEvent[] {
  if (!line.startsWith('data: ')) return []
  let data: Record<string, unknown>
  try {
    data = JSON.parse(line.slice(6))
  } catch {
    return []
  }

  const events: SseEvent[] = []

  // Orden idéntico al handleSseLine original (chequeos independientes).
  if (data.text) {
    events.push({ kind: 'text', text: String(data.text) })
  }
  if (data.event === 'tool_start') {
    events.push({ kind: 'tool_start', label: (data.label as string) ?? 'Pensando…' })
  }
  if (data.event === 'tool_done') {
    events.push({ kind: 'tool_done', round: data.round_summary as RoundSummary | undefined })
  }
  if (data.event === 'plan_assigned' && data.plan) {
    events.push({ kind: 'plan_assigned', plan: data.plan as AssignedPlan })
  }
  if (data.event === 'score_projection' && data.projection) {
    events.push({ kind: 'score_projection', projection: data.projection as ScoreProjection })
  }
  if (data.done && data.session_id) {
    events.push({ kind: 'done', sessionId: String(data.session_id) })
  }
  if (data.error) {
    events.push({ kind: 'error', message: String(data.error) })
  }

  return events
}

/**
 * Decoder con ESTADO del stream SSE byte-a-byte. ÚNICA fuente del loop de bytes
 * — antes estaba duplicado entre `useTaigerChat` y `decodeSseStream` (follow-up
 * técnico de PR1). Encapsula EXACTAMENTE el protocolo con fix P0 del 11-may:
 *   - buffer de bytes entre cada `push()` (= cada `reader.read()`),
 *   - `decoder.decode(value, { stream: true })` (acumula multi-byte UTF-8),
 *   - split por `\n\n` (separador SSE real), dejando el último parcial en buffer,
 *   - `flush()` final con `decoder.decode()` para vaciar bytes pendientes.
 *
 * Tanto el runtime (useTaigerChat) como el test (decodeSseStream) consumen ESTE
 * decoder, así el camino de bytes testeado es el MISMO que corre en producción.
 */
export function createSseDecoder() {
  const decoder = new TextDecoder()
  let buffer = ''

  const drain = (): SseEvent[] => {
    const events: SseEvent[] = []
    const frames = buffer.split('\n\n')
    // En push() el último frame puede estar parcial → queda en el buffer.
    // En flush() ya no hay más bytes, así que no reservamos parcial.
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        for (const ev of parseSseLine(line)) events.push(ev)
      }
    }
    return events
  }

  return {
    /** Procesa un chunk crudo del reader; devuelve los eventos de frames completos. */
    push(chunk: Uint8Array): SseEvent[] {
      buffer += decoder.decode(chunk, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? '' // el parcial vuelve al buffer hasta el próximo push
      const events: SseEvent[] = []
      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          for (const ev of parseSseLine(line)) events.push(ev)
        }
      }
      return events
    },
    /** Flush final: aplica el resto del buffer + bytes multi-byte pendientes. */
    flush(): SseEvent[] {
      buffer += decoder.decode()
      const events = drain()
      buffer = ''
      return events
    },
  }
}

/**
 * Driver puro del stream SSE byte-a-byte, para test (E3). Wrapper delgado sobre
 * `createSseDecoder` — corre el MISMO loop que useTaigerChat. Permite testear el
 * fix P0 del 11-may (frames partidos + multi-byte UTF-8 cortado) sin servidor.
 */
export function decodeSseStream(chunks: Uint8Array[]): SseEvent[] {
  const sse = createSseDecoder()
  const events: SseEvent[] = []
  for (const chunk of chunks) events.push(...sse.push(chunk))
  events.push(...sse.flush())
  return events
}
