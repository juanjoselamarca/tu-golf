/**
 * Adaptador Gemini → forma común del gateway.
 * Mismo patrón que src/golf/coach/v3/retrieval/contextual-rerank.ts.
 * Cliente perezoso + seam de test (_setGeminiForTests).
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ProviderAdapter, ProviderGenerateArgs, ProviderResult } from '../types'

let _override: ProviderAdapter | null = null

/** Inyecta un adaptador mock en tests (evita pegar a la red). */
export function _setGeminiForTests(adapter: ProviderAdapter | null): void {
  _override = adapter
}

export const geminiAdapter: ProviderAdapter = {
  async generate(args: ProviderGenerateArgs): Promise<ProviderResult> {
    if (_override) return _override.generate(args)
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY
    if (!key) throw new Error('gemini: falta GEMINI_API_KEY')

    const genAI = new GoogleGenerativeAI(key)
    // thinkingBudget: 0 DESACTIVA el "pensamiento" de los modelos Gemini 2.5
    // (flash / flash-lite). Sin esto el thinking consume maxOutputTokens y la
    // respuesta visible sale TRUNCADA — verificado en vivo: 285 tokens de thinking
    // dejaban solo 11 de respuesta ("Juan muestra un..."). Con thinkingBudget:0 la
    // respuesta sale completa. Para estas llamadas cortas (insights, fallback del
    // asistente) no queremos chain-of-thought: gasta presupuesto y latencia.
    // El SDK @google/generative-ai 0.24.1 (deprecado) no tipa `thinkingConfig`,
    // pero la API REST sí lo respeta; va por variable para no gatillar el
    // excess-property check del literal (no necesita cast).
    const generationConfig = {
      maxOutputTokens: args.maxTokens,
      temperature: args.temperature,
      thinkingConfig: { thinkingBudget: 0 },
      ...(args.responseJson ? { responseMimeType: 'application/json' } : {}),
    }
    const model = genAI.getGenerativeModel({
      model: args.model,
      ...(args.system ? { systemInstruction: args.system } : {}),
      generationConfig,
    })

    // Gemini usa role 'model' para el asistente; 'user' se mantiene.
    const contents = args.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const result = await model.generateContent({ contents })
    const text = result.response.text()
    const usage = result.response.usageMetadata
    return {
      text,
      tokensIn: usage?.promptTokenCount ?? 0,
      tokensOut: usage?.candidatesTokenCount ?? 0,
    }
  },
}
