import { describe, it, expect } from 'vitest'
import { parseSseLine, decodeSseStream, type SseEvent } from './sseParser'

const enc = new TextEncoder()

/** Concatena un texto SSE completo y lo parte en chunks en los offsets de byte dados. */
function chunkAt(text: string, ...offsets: number[]): Uint8Array[] {
  const bytes = enc.encode(text)
  const cuts = [0, ...offsets, bytes.length]
  const out: Uint8Array[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    out.push(bytes.slice(cuts[i], cuts[i + 1]))
  }
  return out
}

/** Solo el texto concatenado de los eventos 'text'. */
function textOf(events: SseEvent[]): string {
  return events.filter(e => e.kind === 'text').map(e => (e as { text: string }).text).join('')
}

describe('parseSseLine — interpretación de una línea', () => {
  it('decodifica un token de texto', () => {
    expect(parseSseLine('data: {"text":"hola"}')).toEqual([{ kind: 'text', text: 'hola' }])
  })

  it('ignora líneas sin prefijo data:', () => {
    expect(parseSseLine(': keepalive')).toEqual([])
    expect(parseSseLine('')).toEqual([])
    expect(parseSseLine('event: ping')).toEqual([])
  })

  it('ignora JSON malformado sin lanzar (catch silencioso)', () => {
    expect(parseSseLine('data: {"text":"ho')).toEqual([])
    expect(parseSseLine('data: no-es-json')).toEqual([])
  })

  it('texto vacío no genera evento (truthiness del original)', () => {
    expect(parseSseLine('data: {"text":""}')).toEqual([])
  })

  it('decodifica tool_start con label y default', () => {
    expect(parseSseLine('data: {"event":"tool_start","label":"Buscando tus rondas…"}'))
      .toEqual([{ kind: 'tool_start', label: 'Buscando tus rondas…' }])
    expect(parseSseLine('data: {"event":"tool_start"}'))
      .toEqual([{ kind: 'tool_start', label: 'Pensando…' }])
  })

  it('decodifica done y error', () => {
    expect(parseSseLine('data: {"done":true,"session_id":"abc-123"}'))
      .toEqual([{ kind: 'done', sessionId: 'abc-123' }])
    expect(parseSseLine('data: {"error":"se cortó"}'))
      .toEqual([{ kind: 'error', message: 'se cortó' }])
  })

  it('done sin session_id no genera evento done (truthiness del original)', () => {
    expect(parseSseLine('data: {"done":true}')).toEqual([])
  })

  it('un mismo frame con text + done dispara AMBOS (semántica multi-if del original)', () => {
    expect(parseSseLine('data: {"text":"fin","done":true,"session_id":"s1"}'))
      .toEqual([{ kind: 'text', text: 'fin' }, { kind: 'done', sessionId: 's1' }])
  })
})

describe('decodeSseStream — buffer de frames partidos (fix P0 11-may)', () => {
  it('reconstruye texto a partir de varios frames completos', () => {
    const sse = 'data: {"text":"Hola "}\n\ndata: {"text":"Juanjo"}\n\n'
    const events = decodeSseStream([enc.encode(sse)])
    expect(textOf(events)).toBe('Hola Juanjo')
  })

  it('frame partido a mitad del JSON entre dos chunks NO pierde tokens', () => {
    const sse = 'data: {"text":"primero"}\n\ndata: {"text":"segundo"}\n\n'
    // Cortar dentro del segundo objeto JSON (a mitad de "segundo").
    const cut = sse.indexOf('segundo') + 3
    const events = decodeSseStream(chunkAt(sse, cut))
    expect(textOf(events)).toBe('primerosegundo')
  })

  it('separador \\n\\n partido entre chunks no duplica ni pierde frames', () => {
    const sse = 'data: {"text":"a"}\n\ndata: {"text":"b"}\n\n'
    // Cortar justo en medio del primer separador \n\n.
    const cut = sse.indexOf('\n\n') + 1
    const events = decodeSseStream(chunkAt(sse, cut))
    expect(textOf(events)).toBe('ab')
    expect(events.filter(e => e.kind === 'text')).toHaveLength(2)
  })

  it('byte multi-byte UTF-8 cortado entre chunks NO corrompe acentos/emoji', () => {
    const sse = 'data: {"text":"birdie en el hoyo 7 ⛳ pará el green"}\n\n'
    const bytes = enc.encode(sse)
    // Cortar a mitad del emoji ⛳ (4 bytes) y de un acento (á, 2 bytes).
    const emojiByteStart = enc.encode('data: {"text":"birdie en el hoyo 7 ').length
    const chunks = chunkAt(sse, emojiByteStart + 1, emojiByteStart + 6, bytes.length - 3)
    const events = decodeSseStream(chunks)
    expect(textOf(events)).toBe('birdie en el hoyo 7 ⛳ pará el green')
  })

  it('línea : keepalive intercalada se ignora sin romper el stream', () => {
    const sse = 'data: {"text":"uno"}\n\n: keepalive\n\ndata: {"text":"dos"}\n\n'
    const events = decodeSseStream(chunkAt(sse, 5, 25))
    expect(textOf(events)).toBe('unodos')
  })

  it('eventos done/error mezclados con texto en el orden correcto', () => {
    const sse =
      'data: {"text":"respuesta"}\n\n' +
      'data: {"event":"tool_start","label":"Buscando…"}\n\n' +
      'data: {"error":"red caída"}\n\n' +
      'data: {"done":true,"session_id":"uuid-9"}\n\n'
    const events = decodeSseStream(chunkAt(sse, 10, 60, 110))
    expect(events).toEqual([
      { kind: 'text', text: 'respuesta' },
      { kind: 'tool_start', label: 'Buscando…' },
      { kind: 'error', message: 'red caída' },
      { kind: 'done', sessionId: 'uuid-9' },
    ])
  })

  it('flush final aplica el último frame sin \\n\\n de cierre', () => {
    // Algunos servers no cierran con \n\n final; el flush debe recogerlo igual.
    const sse = 'data: {"text":"sin cierre"}'
    const events = decodeSseStream([enc.encode(sse)])
    expect(textOf(events)).toBe('sin cierre')
  })

  it('round_summary llega en tool_done', () => {
    const sse = 'data: {"event":"tool_done","round_summary":{"id":"r1"}}\n\n'
    const events = decodeSseStream([enc.encode(sse)])
    expect(events).toEqual([{ kind: 'tool_done', round: { id: 'r1' } }])
  })
})
