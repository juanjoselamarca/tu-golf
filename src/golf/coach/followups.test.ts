import { describe, it, expect } from 'vitest'
import { buildFollowupsRequest, parseFollowups, FOLLOWUPS_MAX } from './followups'

describe('buildFollowupsRequest', () => {
  it('incluye pregunta y respuesta en el mensaje de usuario', () => {
    const r = buildFollowupsRequest('¿Cómo bajo el back nine?', 'Tu back nine se cae por...')
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0].role).toBe('user')
    expect(r.messages[0].content).toContain('¿Cómo bajo el back nine?')
    expect(r.messages[0].content).toContain('Tu back nine se cae por')
    expect(r.system).toContain('tAIger+')
  })

  it('trunca respuestas largas para acotar costo (<500 tokens/turno)', () => {
    const longA = 'x'.repeat(5000)
    const r = buildFollowupsRequest('p', longA)
    // 1200 chars de answer + el resto del template, nunca los 5000 crudos
    expect(r.messages[0].content.length).toBeLessThan(2000)
  })

  it('tolera strings vacíos sin romper', () => {
    const r = buildFollowupsRequest('', '')
    expect(r.messages[0].content).toBeTypeOf('string')
  })
})

describe('parseFollowups', () => {
  it('parsea {questions: [...]}', () => {
    const raw = JSON.stringify({ questions: ['¿Cómo entreno el putt?', '¿Qué wedge uso de 50m?'] })
    expect(parseFollowups(raw)).toEqual(['¿Cómo entreno el putt?', '¿Qué wedge uso de 50m?'])
  })

  it('acepta también un array crudo', () => {
    expect(parseFollowups(JSON.stringify(['A?', 'B?']))).toEqual(['A?', 'B?'])
  })

  it('JSON envuelto en fence markdown ```json (lo que Haiku devuelve en prod)', () => {
    const raw = '```json\n{\n  "questions": [\n    "¿Cómo identifico cuándo jugar al bogey?",\n    "¿Qué ritual de reset me recomiendas?"\n  ]\n}\n```'
    expect(parseFollowups(raw)).toEqual([
      '¿Cómo identifico cuándo jugar al bogey?',
      '¿Qué ritual de reset me recomiendas?',
    ])
  })

  it('JSON con fence sin etiqueta y con texto alrededor', () => {
    expect(parseFollowups('```\n{"questions":["¿A?"]}\n```')).toEqual(['¿A?'])
    expect(parseFollowups('Claro, acá van:\n{"questions": ["¿B?"]}\n¡Suerte!')).toEqual(['¿B?'])
  })

  it('JSON malformado → [] (no rompe el chat)', () => {
    expect(parseFollowups('no soy json {')).toEqual([])
    expect(parseFollowups('')).toEqual([])
    expect(parseFollowups(null)).toEqual([])
    expect(parseFollowups(undefined)).toEqual([])
  })

  it('forma inesperada → []', () => {
    expect(parseFollowups(JSON.stringify({ foo: 'bar' }))).toEqual([])
    expect(parseFollowups(JSON.stringify(42))).toEqual([])
  })

  it('descarta vacíos, no-strings y preguntas demasiado largas; normaliza espacios', () => {
    const raw = JSON.stringify({ questions: ['  ¿Hola   mundo?  ', '', 42, 'x'.repeat(130), null] })
    expect(parseFollowups(raw)).toEqual(['¿Hola mundo?'])
  })

  it('acepta preguntas naturales en español de ~110 chars (Haiku no las cortaba en prod)', () => {
    const q = '¿Cómo puedo practicar este enfoque de jugar al bogey en mi próxima ronda sin perder del todo la agresividad?'
    expect(q.length).toBeGreaterThan(90)
    expect(q.length).toBeLessThanOrEqual(120)
    expect(parseFollowups(JSON.stringify({ questions: [q] }))).toEqual([q])
  })

  it('deduplica (case-insensitive) y corta en FOLLOWUPS_MAX', () => {
    const raw = JSON.stringify({ questions: ['¿Y?', '¿y?', '¿A?', '¿B?', '¿C?'] })
    const out = parseFollowups(raw)
    expect(out).toEqual(['¿Y?', '¿A?', '¿B?']) // '¿y?' es dup de '¿Y?'; corta en 3
    expect(out.length).toBeLessThanOrEqual(FOLLOWUPS_MAX)
  })
})
