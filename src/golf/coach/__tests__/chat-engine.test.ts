import { describe, it, expect } from 'vitest'
import { runChatStream, enforceFinalText, runWithContinuation } from '../chat-engine'

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
    // 1ª continuación recibe 'A' (trailing space recortado); 2ª recibe 'AB'
    expect(prefills).toEqual(['A', 'AB'])
    expect(r.text).toBe('ABC')
    expect(r.continuations).toBe(2)
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
