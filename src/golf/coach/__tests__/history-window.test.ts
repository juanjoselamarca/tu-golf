import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  windowByTokenBudget,
  prepareCoachHistory,
  COACH_HISTORY_TOKEN_BUDGET,
  COACH_HISTORY_MAX_MESSAGES,
  COACH_MSG_MAX_CHARS,
  type ChatMsg,
} from '../history-window'

const msg = (role: 'user' | 'assistant', content: string): ChatMsg => ({ role, content })

describe('estimateTokens', () => {
  it('usa la heurística chars/4 redondeada hacia arriba', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2) // 5/4 → 2
    expect(estimateTokens('a'.repeat(4000))).toBe(1000)
  })
})

describe('windowByTokenBudget', () => {
  it('devuelve [] para historial vacío', () => {
    expect(windowByTokenBudget([], 30_000)).toEqual([])
  })

  it('mantiene todo si cabe en el presupuesto', () => {
    const conv = [msg('user', 'hola'), msg('assistant', 'qué tal'), msg('user', 'bien')]
    expect(windowByTokenBudget(conv, 30_000)).toEqual(conv)
  })

  it('descarta los mensajes MÁS VIEJOS cuando excede el presupuesto', () => {
    // cada mensaje = 400 chars = 100 tokens. Presupuesto 250 → entran 2 (los 2 últimos).
    const conv = [
      msg('user', 'A'.repeat(400)),
      msg('assistant', 'B'.repeat(400)),
      msg('user', 'C'.repeat(400)),
    ]
    const out = windowByTokenBudget(conv, 250)
    expect(out).toHaveLength(2)
    expect(out[0].content[0]).toBe('B')
    expect(out[1].content[0]).toBe('C')
  })

  it('NO corta ningún mensaje por la mitad (mantiene mensajes enteros)', () => {
    const conv = [msg('user', 'A'.repeat(400)), msg('user', 'B'.repeat(400))]
    const out = windowByTokenBudget(conv, 150) // solo entra 1 entero (100 tokens)
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe('B'.repeat(400)) // entero, no recortado
  })

  it('siempre conserva al menos el último mensaje aunque exceda el presupuesto', () => {
    const conv = [msg('user', 'viejo'), msg('user', 'X'.repeat(400))] // último = 100 tokens
    const out = windowByTokenBudget(conv, 10) // presupuesto ridículo
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe('X'.repeat(400))
  })

  it('preserva el orden cronológico original', () => {
    const conv = [msg('user', '1'), msg('assistant', '2'), msg('user', '3')]
    expect(windowByTokenBudget(conv, 30_000).map((m) => m.content)).toEqual(['1', '2', '3'])
  })
})

describe('prepareCoachHistory', () => {
  it('filtra mensajes vacíos o solo-espacios', () => {
    const conv = [msg('user', 'hola'), msg('assistant', '   '), msg('user', 'chau')]
    const out = prepareCoachHistory(conv)
    expect(out.map((m) => m.content)).toEqual(['hola', 'chau'])
  })

  it('recorta cada mensaje a COACH_MSG_MAX_CHARS (fix H-08: no rompe con planes largos)', () => {
    const largo = 'P'.repeat(COACH_MSG_MAX_CHARS + 5000)
    const out = prepareCoachHistory([msg('user', 'hola'), msg('assistant', largo)])
    const plan = out.find((m) => m.role === 'assistant')!
    expect(plan.content).toHaveLength(COACH_MSG_MAX_CHARS)
  })

  it('un plan semanal típico (~2700 chars) sobrevive ENTERO (regresión H-08)', () => {
    const plan = 'Plan semanal detallado. '.repeat(115) // ~2760 chars, < 8000
    expect(plan.length).toBeGreaterThan(2000)
    expect(plan.length).toBeLessThan(COACH_MSG_MAX_CHARS)
    const out = prepareCoachHistory([msg('user', 'dame plan'), msg('assistant', plan)])
    expect(out.find((m) => m.role === 'assistant')!.content).toBe(plan)
  })

  it('limita a los últimos COACH_HISTORY_MAX_MESSAGES mensajes cortos', () => {
    const many = Array.from({ length: COACH_HISTORY_MAX_MESSAGES + 40 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`),
    )
    const out = prepareCoachHistory(many)
    expect(out.length).toBeLessThanOrEqual(COACH_HISTORY_MAX_MESSAGES)
    // conserva los más recientes
    expect(out[out.length - 1].content).toBe(`m${COACH_HISTORY_MAX_MESSAGES + 40 - 1}`)
  })

  it('da MÁS memoria que el viejo slice(-20): 30 turnos cortos entran completos', () => {
    const conv = Array.from({ length: 30 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `turno ${i} con algo de texto real`),
    )
    const out = prepareCoachHistory(conv)
    expect(out).toHaveLength(30) // el viejo tope de 20 los habría cortado
  })

  it('respeta el presupuesto de tokens con mensajes largos', () => {
    // 20 mensajes de ~8000 chars (~2000 tokens c/u) = ~40k tokens > 30k presupuesto.
    const conv = Array.from({ length: 20 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', 'Z'.repeat(COACH_MSG_MAX_CHARS)),
    )
    const out = prepareCoachHistory(conv)
    const totalTokens = out.reduce((s, m) => s + estimateTokens(m.content), 0)
    expect(totalTokens).toBeLessThanOrEqual(COACH_HISTORY_TOKEN_BUDGET)
    expect(out.length).toBeLessThan(20) // dropeó los más viejos
    expect(out.length).toBeGreaterThan(0)
  })
})
