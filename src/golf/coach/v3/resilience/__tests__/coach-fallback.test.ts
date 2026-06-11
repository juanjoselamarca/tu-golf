import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ai', () => ({
  callLLM: vi.fn(),
}))

import { callLLM } from '@/lib/ai'
import {
  isRetryableLLMError,
  toPlainMessages,
  coachDegradedFallback,
} from '../coach-fallback'

describe('isRetryableLLMError', () => {
  it('detecta rate-limit / overload / 5xx por status', () => {
    expect(isRetryableLLMError({ status: 429 })).toBe(true)
    expect(isRetryableLLMError({ status: 529 })).toBe(true)
    expect(isRetryableLLMError({ status: 503 })).toBe(true)
    expect(isRetryableLLMError({ statusCode: 500 })).toBe(true)
  })

  it('detecta por mensaje', () => {
    expect(isRetryableLLMError(new Error('Overloaded'))).toBe(true)
    expect(isRetryableLLMError(new Error('rate_limit_error'))).toBe(true)
    expect(isRetryableLLMError(new Error('429 too many requests'))).toBe(true)
  })

  it('NO reintenta errores de input ni nulos', () => {
    expect(isRetryableLLMError({ status: 400 })).toBe(false)
    expect(isRetryableLLMError(new Error('invalid_request: bad tool input'))).toBe(false)
    expect(isRetryableLLMError(null)).toBe(false)
    expect(isRetryableLLMError(undefined)).toBe(false)
  })

  it('reintenta credit-out / billing (cruza a Gemini en vez de caer el coach)', () => {
    // Anthropic devuelve 400 + este mensaje cuando se agota el saldo (prod 10-jun).
    // El status es 400 (input error genérico) pero el mensaje lo identifica.
    expect(
      isRetryableLLMError({ status: 400, message: 'Your credit balance is too low to access the Anthropic API.' }),
    ).toBe(true)
    expect(isRetryableLLMError(new Error('billing: payment required'))).toBe(true)
    expect(isRetryableLLMError({ status: 402 })).toBe(true)
    // Un 400 SIN mensaje de billing sigue siendo no-retryable (no romper input-errors).
    expect(isRetryableLLMError({ status: 400, message: 'invalid tool schema' })).toBe(false)
  })
})

describe('toPlainMessages', () => {
  it('mantiene mensajes de texto plano user/assistant', () => {
    expect(
      toPlainMessages([
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'qué tal' },
      ]),
    ).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'qué tal' },
    ])
  })

  it('aplana bloques: conserva texto, descarta tool_use/tool_result', () => {
    const out = toPlainMessages([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'pensando' },
          { type: 'tool_use', id: 't1', name: 'search', input: {} },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: '...' }],
      },
    ])
    // El assistant queda con su texto; el user (solo tool_result) se descarta por vacío.
    expect(out).toEqual([{ role: 'assistant', content: 'pensando' }])
  })

  it('descarta roles inválidos y mensajes vacíos', () => {
    const out = toPlainMessages([
      { role: 'system', content: 'x' },
      { role: 'user', content: '   ' },
      { role: 'user', content: 'válido' },
    ])
    expect(out).toEqual([{ role: 'user', content: 'válido' }])
  })
})

describe('coachDegradedFallback', () => {
  beforeEach(() => {
    vi.mocked(callLLM).mockReset()
  })

  it('llama al gateway con rol primary_chat y devuelve el texto', async () => {
    vi.mocked(callLLM).mockResolvedValue({
      text: 'respuesta degradada',
      provider: 'google',
      model: 'gemini-2.5-flash',
      fallbackUsed: true,
      tokensIn: 10,
      tokensOut: 20,
      latencyMs: 300,
    } as Awaited<ReturnType<typeof callLLM>>)

    const r = await coachDegradedFallback({
      system: 'sos tAIger',
      messages: [{ role: 'user', content: 'dame un tip' }],
    })

    expect(callLLM).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'primary_chat', system: 'sos tAIger', maxTokens: 2048 }),
    )
    expect(r).toEqual({
      text: 'respuesta degradada',
      provider: 'google',
      model: 'gemini-2.5-flash',
      fallbackUsed: true,
    })
  })

  it('propaga el error si el gateway agota todos los proveedores', async () => {
    vi.mocked(callLLM).mockRejectedValue(new Error('AllProvidersFailedError'))
    await expect(
      coachDegradedFallback({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow('AllProvidersFailedError')
  })
})
