/**
 * Adaptador Anthropic → forma común del gateway.
 * Cliente perezoso + seam de test (_setAnthropicForTests).
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ProviderAdapter, ProviderGenerateArgs, ProviderResult } from '../types'

let _client: Anthropic | null = null
let _override: ProviderAdapter | null = null

/** Inyecta un adaptador mock en tests (evita pegar a la red). */
export function _setAnthropicForTests(adapter: ProviderAdapter | null): void {
  _override = adapter
}

function client(): Anthropic {
  if (_client) return _client
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

export const anthropicAdapter: ProviderAdapter = {
  async generate(args: ProviderGenerateArgs): Promise<ProviderResult> {
    if (_override) return _override.generate(args)
    const resp = await client().messages.create(
      {
        model: args.model,
        max_tokens: args.maxTokens,
        temperature: args.temperature,
        ...(args.system ? { system: args.system } : {}),
        messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
      },
      args.signal ? { signal: args.signal } : undefined,
    )
    const text = resp.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    return {
      text,
      tokensIn: resp.usage?.input_tokens ?? 0,
      tokensOut: resp.usage?.output_tokens ?? 0,
    }
  },
}
