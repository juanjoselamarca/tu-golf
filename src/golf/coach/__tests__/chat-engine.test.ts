import { describe, it, expect } from 'vitest'
import { runChatStream, enforceFinalText, runWithContinuation, buildContinuationRequest, joinContinuation } from '../chat-engine'

// PR1 (refactor puro): el seguro real es el smoke byte-idéntico del coach.
// Este unit solo asegura que la firma pública existe tras la extracción.
describe('chat-engine (refactor puro)', () => {
  it('exporta runChatStream como función', () => {
    expect(typeof runChatStream).toBe('function')
  })
})

describe('enforceFinalText (buffer + bloqueo del turno final)', () => {
  it('deja pasar prosa cuyo absoluto coincide con salida de tool', () => {
    const r = enforceFinalText('Tu objetivo es 79 (+7 sobre par).', { authorized: ['79', '+7'] })
    expect(r.blocked).toBe(false)
    expect(r.text).toContain('79')
  })

  it('bloquea un absoluto fabricado que no salió de la tool', () => {
    const r = enforceFinalText('Si seguís el plan terminás en 81.', { authorized: ['79', '+7'] })
    expect(r.blocked).toBe(true)
    // el texto bloqueado NO se entrega tal cual
    expect(r.text).not.toContain('terminás en 81')
  })

  it('relativo +7 pasa si está autorizado', () => {
    const r = enforceFinalText('Apuntá a +7 sobre par.', { authorized: ['79', '+7'] })
    expect(r.blocked).toBe(false)
  })

  it('prosa sin números de score pasa intacta', () => {
    const r = enforceFinalText('Trabajá la salida de búnker esta semana.', { authorized: [] })
    expect(r.blocked).toBe(false)
    expect(r.text).toContain('búnker')
  })

  it('al bloquear con relativeHint, la prosa segura cita el "+N sobre par" (auto-contenida)', () => {
    const r = enforceFinalText('Si seguís el plan terminás en 81.', { authorized: ['79', '+7'], relativeHint: '+7' })
    expect(r.blocked).toBe(true)
    expect(r.text).toContain('+7 sobre par')
    expect(r.text).not.toContain('81')
  })

  it('al bloquear sin relativeHint, la prosa segura NO promete una tarjeta inexistente', () => {
    const r = enforceFinalText('Terminás en 81.', { authorized: ['79'], relativeHint: null })
    expect(r.blocked).toBe(true)
    expect(r.text).not.toContain('tarjeta')
    expect(r.text).not.toContain('81')
  })
})

describe('runWithContinuation (auto-continuación ante truncación por max_tokens)', () => {
  it('NO continúa si el primer segmento ya cerró (end_turn)', async () => {
    let calls = 0
    const cont = async () => {
      calls++
      return { text: ' NO DEBERÍA', stopReason: 'end_turn' }
    }
    const r = await runWithContinuation(
      { text: 'Respuesta completa.', stopReason: 'end_turn' },
      cont,
      3,
    )
    expect(calls).toBe(0)
    expect(r.text).toBe('Respuesta completa.')
    expect(r.truncated).toBe(false)
    expect(r.continuations).toBe(0)
  })

  it('continúa una vez y completa cuando el modelo cierra (mid-word, sin costura)', async () => {
    const cont = async (prefill: string) => {
      // El modelo continúa desde el prefill exacto: "…con más p" → "otencia…"
      expect(prefill).toBe('El swing suave al 80% te da más control y con más p')
      return { text: 'otencia y confianza.', stopReason: 'end_turn' }
    }
    const r = await runWithContinuation(
      { text: 'El swing suave al 80% te da más control y con más p', stopReason: 'max_tokens' },
      cont,
      3,
    )
    expect(r.text).toBe('El swing suave al 80% te da más control y con más potencia y confianza.')
    expect(r.truncated).toBe(false)
    expect(r.continuations).toBe(1)
  })

  it('pasa como prefill el texto acumulado recortado en cada continuación', async () => {
    const prefills: string[] = []
    let n = 0
    const cont = async (prefill: string) => {
      prefills.push(prefill)
      n++
      if (n === 1) return { text: 'B', stopReason: 'max_tokens' }
      return { text: 'C', stopReason: 'end_turn' }
    }
    const r = await runWithContinuation({ text: 'A ', stopReason: 'max_tokens' }, cont, 3)
    // El prefill que ve el modelo va recortado ('A', luego 'A B'); el acumulado
    // conserva el texto crudo ('A ' + 'B' + 'C') para coincidir con lo mostrado en vivo.
    expect(prefills).toEqual(['A', 'A B'])
    expect(r.text).toBe('A BC')
    expect(r.continuations).toBe(2)
  })

  it('no intenta continuar un assistant vacío (prefill quedaría vacío)', async () => {
    let calls = 0
    const cont = async () => {
      calls++
      return { text: 'x', stopReason: 'end_turn' }
    }
    const r = await runWithContinuation({ text: '   ', stopReason: 'max_tokens' }, cont, 3)
    expect(calls).toBe(0)
    expect(r.continuations).toBe(0)
    expect(r.truncated).toBe(true)
  })

  it('corta en el tope de continuaciones y marca truncated=true', async () => {
    let calls = 0
    const cont = async () => {
      calls++
      return { text: 'x', stopReason: 'max_tokens' }
    }
    const r = await runWithContinuation({ text: 'inicio', stopReason: 'max_tokens' }, cont, 2)
    expect(calls).toBe(2)
    expect(r.continuations).toBe(2)
    expect(r.truncated).toBe(true)
    expect(r.text).toBe('inicioxx')
  })
})

describe('buildContinuationRequest (request válido aun con tool-context)', () => {
  const loopMessages = [
    { role: 'user', content: 'dame mi plan del Norte-Este' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'get_latest_round', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' }] },
  ]
  const activeTools = [{ name: 'get_latest_round' }, { name: 'compute_score_projection' }]

  it('incluye tools y tool_choice:none (Anthropic exige tools si hay tool_use/tool_result)', () => {
    const req = buildContinuationRequest({
      model: 'claude-x', systemFinal: 'SYS', loopMessages, activeTools, partial: 'El swing al 80% te da más p',
    })
    // C1: sin `tools`, un request con bloques tool_use/tool_result tira 400 → se pierde la respuesta.
    expect(req.tools).toBe(activeTools)
    expect(req.tool_choice).toEqual({ type: 'none' })
  })

  it('la conversación TERMINA en un mensaje de usuario (el modelo no soporta assistant prefill)', () => {
    const req = buildContinuationRequest({
      model: 'claude-x', systemFinal: 'SYS', loopMessages, activeTools, partial: 'El swing al 80% te da más p',
    })
    const msgs = req.messages as Array<{ role: string; content: unknown }>
    // 3 de loopMessages + el parcial del coach (assistant) + el turno de usuario que pide continuar
    expect(msgs.length).toBe(5)
    // El parcial va como mensaje assistant normal…
    expect(msgs[3]).toEqual({ role: 'assistant', content: 'El swing al 80% te da más p' })
    // …y la conversación CIERRA con un turno de usuario (si cerrara en assistant → 400 "does not support assistant prefill").
    expect(msgs[4].role).toBe('user')
    expect(typeof msgs[4].content).toBe('string')
  })
})

describe('joinContinuation (costura determinista de la continuación)', () => {
  it('concatena tal cual cuando no hay muletilla ni repetición', () => {
    expect(joinContinuation('Apuntá al centro del', ' green, siempre.')).toBe('Apuntá al centro del green, siempre.')
  })

  it('costura a media palabra exacta (el caso real)', () => {
    expect(joinContinuation('no lo hag', 'as. Jugá la esquina')).toBe('no lo hagas. Jugá la esquina')
  })

  it('deduplica repetición verbatim del final (≥12 chars) que a veces emite el modelo', () => {
    const acc = 'Bogey es tu par en este hoyo.'
    const seg = 'Bogey es tu par en este hoyo. Hoyo 3: jugá conservador.'
    expect(joinContinuation(acc, seg)).toBe('Bogey es tu par en este hoyo. Hoyo 3: jugá conservador.')
  })

  it('NO deduplica coincidencias cortas (<12 chars) — serían falsos positivos', () => {
    expect(joinContinuation('abc', 'cde')).toBe('abccde')
  })

  it('quita muletillas de reintroducción ([CONTINUACIÓN], "Continúo:", "Sigo:")', () => {
    expect(joinContinuation('El plan va así. ', '[CONTINUACIÓN] Hoyo 3: respira.')).toBe('El plan va así. Hoyo 3: respira.')
    expect(joinContinuation('El plan va así. ', 'Continúo: Hoyo 3: respira.')).toBe('El plan va así. Hoyo 3: respira.')
  })
})
