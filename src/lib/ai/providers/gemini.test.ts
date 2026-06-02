import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del SDK para inspeccionar la config que el adapter le pasa SIN pegar a la red.
const { getGenerativeModel } = vi.hoisted(() => ({ getGenerativeModel: vi.fn() }))
vi.mock('@google/generative-ai', () => ({
  // class (no arrow) porque el adapter hace `new GoogleGenerativeAI(key)`.
  GoogleGenerativeAI: class {
    getGenerativeModel = getGenerativeModel
  },
}))

import { geminiAdapter } from './gemini'

describe('geminiAdapter — thinking desactivado (anti-truncación)', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key'
    getGenerativeModel.mockReset()
    getGenerativeModel.mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => 'respuesta completa',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        },
      }),
    })
  })

  it('pasa thinkingBudget:0 para que el thinking no consuma maxOutputTokens y trunque la respuesta', async () => {
    const r = await geminiAdapter.generate({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hola' }],
      maxTokens: 300,
      temperature: 0,
      responseJson: false,
    })

    expect(r.text).toBe('respuesta completa')
    expect(r.tokensIn).toBe(10)
    expect(r.tokensOut).toBe(20)

    expect(getGenerativeModel).toHaveBeenCalledTimes(1)
    const params = getGenerativeModel.mock.calls[0][0] as {
      generationConfig: { thinkingConfig?: { thinkingBudget?: number }; maxOutputTokens?: number }
    }
    // El guard de regresión: si alguien borra thinkingConfig, este test falla.
    expect(params.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
    expect(params.generationConfig.maxOutputTokens).toBe(300)
  })

  it('mantiene responseMimeType JSON cuando responseJson=true, junto al thinkingBudget:0', async () => {
    await geminiAdapter.generate({
      model: 'gemini-2.5-flash-lite',
      messages: [{ role: 'user', content: 'dame json' }],
      maxTokens: 200,
      temperature: 0,
      responseJson: true,
    })
    const params = getGenerativeModel.mock.calls[0][0] as {
      generationConfig: {
        thinkingConfig?: { thinkingBudget?: number }
        responseMimeType?: string
      }
    }
    expect(params.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
    expect(params.generationConfig.responseMimeType).toBe('application/json')
  })
})
