import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { callLLM, isTransient, _setBackoffBaseForTests } from './gateway'
import { _setAnthropicForTests } from './providers/anthropic'
import { _setGeminiForTests } from './providers/gemini'
import { _setUsageLogEnabledForTests } from './usage-log'
import { AllProvidersFailedError, type ProviderAdapter } from './types'

/** Adaptador mock: responde según un guion de funciones por invocación. */
function scripted(steps: Array<() => Promise<{ text: string; tokensIn: number; tokensOut: number }>>): {
  adapter: ProviderAdapter
  calls: () => number
} {
  let i = 0
  return {
    calls: () => i,
    adapter: {
      async generate() {
        const step = steps[Math.min(i, steps.length - 1)]
        i++
        return step()
      },
    },
  }
}

const ok = (text: string) => async () => ({ text, tokensIn: 10, tokensOut: 5 })
const fail = (status: number, message = 'boom') => async () => {
  const e = new Error(message) as Error & { status: number }
  e.status = status
  throw e
}

const baseParams = {
  role: 'evaluator' as const,
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'hola' }],
  aiEnv: 'prod' as const,
}

beforeEach(() => {
  _setBackoffBaseForTests(0) // sin esperas reales en test
  _setUsageLogEnabledForTests(false) // no escribir a ai_usage desde tests
})

afterEach(() => {
  _setAnthropicForTests(null)
  _setGeminiForTests(null)
  _setBackoffBaseForTests(400)
  _setUsageLogEnabledForTests(true)
  vi.unstubAllEnvs()
})

describe('isTransient', () => {
  it('clasifica 429/529/5xx como transitorios', () => {
    expect(isTransient({ status: 429 })).toBe(true)
    expect(isTransient({ status: 529 })).toBe(true)
    expect(isTransient({ status: 503 })).toBe(true)
  })
  it('clasifica 400/401/422 como NO transitorios', () => {
    expect(isTransient({ status: 400 })).toBe(false)
    expect(isTransient({ status: 401 })).toBe(false)
    expect(isTransient({ status: 422 })).toBe(false)
  })
  it('detecta overload/rate-limit/timeout por mensaje', () => {
    expect(isTransient(new Error('Overloaded'))).toBe(true)
    expect(isTransient(new Error('gateway: timeout'))).toBe(true)
    expect(isTransient(new Error('rate limit exceeded'))).toBe(true)
    expect(isTransient(new Error('algo raro'))).toBe(false)
  })
})

describe('callLLM — happy path', () => {
  it('usa el primer proveedor (Anthropic) sin fallback', async () => {
    const a = scripted([ok('respuesta-anthropic')])
    _setAnthropicForTests(a.adapter)
    const r = await callLLM(baseParams)
    expect(r.text).toBe('respuesta-anthropic')
    expect(r.provider).toBe('anthropic')
    expect(r.model).toBe('claude-haiku-4-5')
    expect(r.fallbackUsed).toBe(false)
    expect(r.attempts).toBe(1)
  })
})

describe('callLLM — fallback multi-proveedor', () => {
  it('cae a Gemini cuando Anthropic da 429 persistente', async () => {
    _setAnthropicForTests(scripted([fail(429), fail(429), fail(429)]).adapter)
    const g = scripted([ok('respuesta-gemini')])
    _setGeminiForTests(g.adapter)

    const r = await callLLM(baseParams)
    expect(r.text).toBe('respuesta-gemini')
    expect(r.provider).toBe('google')
    expect(r.model).toBe('gemini-2.5-flash-lite')
    expect(r.fallbackUsed).toBe(true)
    expect(g.calls()).toBe(1)
  })

  it('cae a Gemini cuando Anthropic da 529 Overloaded (el caso del incidente)', async () => {
    _setAnthropicForTests(scripted([fail(529), fail(529), fail(529)]).adapter)
    _setGeminiForTests(scripted([ok('gemini-rescata')]).adapter)
    const r = await callLLM(baseParams)
    expect(r.provider).toBe('google')
    expect(r.text).toBe('gemini-rescata')
  })
})

describe('callLLM — retry dentro del mismo proveedor', () => {
  it('reintenta un 429 transitorio y luego tiene éxito en Anthropic', async () => {
    const a = scripted([fail(429), ok('exito-tras-retry')])
    _setAnthropicForTests(a.adapter)
    const r = await callLLM(baseParams)
    expect(r.text).toBe('exito-tras-retry')
    expect(r.provider).toBe('anthropic')
    expect(r.fallbackUsed).toBe(false)
    expect(r.attempts).toBe(2)
  })
})

describe('callLLM — error NO transitorio', () => {
  it('no reintenta un 400 y salta directo al siguiente proveedor', async () => {
    const a = scripted([fail(400), ok('no-deberia-usarse')])
    _setAnthropicForTests(a.adapter)
    _setGeminiForTests(scripted([ok('gemini-tras-400')]).adapter)

    const r = await callLLM(baseParams)
    expect(r.provider).toBe('google')
    expect(r.text).toBe('gemini-tras-400')
    // Anthropic se llamó UNA sola vez (sin reintentos por ser 400).
    expect(a.calls()).toBe(1)
  })
})

describe('callLLM — separación prod/dev', () => {
  it('en dev EXCLUYE Anthropic y usa Gemini directo (protege la llave de prod)', async () => {
    // Si tocara Anthropic, este mock haría fallar el test.
    _setAnthropicForTests({
      generate: async () => {
        throw new Error('NO se debe llamar a Anthropic en dev')
      },
    })
    _setGeminiForTests(scripted([ok('gemini-dev')]).adapter)

    const r = await callLLM({ ...baseParams, aiEnv: 'dev' })
    expect(r.provider).toBe('google')
    expect(r.fallbackUsed).toBe(false) // Gemini es el primero de la cadena en dev
    expect(r.text).toBe('gemini-dev')
  })
})

describe('callLLM — toda la cadena falla', () => {
  it('lanza AllProvidersFailedError cuando ambos proveedores fallan', async () => {
    _setAnthropicForTests(scripted([fail(429), fail(429), fail(429)]).adapter)
    _setGeminiForTests(scripted([fail(503), fail(503), fail(503)]).adapter)

    await expect(callLLM(baseParams)).rejects.toBeInstanceOf(AllProvidersFailedError)
  })
})

describe('callLLM — override de cadena', () => {
  it('respeta una cadena explícita', async () => {
    _setGeminiForTests(scripted([ok('solo-gemini')]).adapter)
    const r = await callLLM({ ...baseParams, chain: ['google/gemini-2.5-flash'] })
    expect(r.provider).toBe('google')
    expect(r.model).toBe('gemini-2.5-flash')
  })
})
