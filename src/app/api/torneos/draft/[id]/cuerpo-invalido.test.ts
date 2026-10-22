import { describe, it, expect, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// Rutas de escritura del borrador de torneo: un cuerpo que no es JSON (o que es
// `null`) responde 400 con el motivo, no un 500 sin capturar al desestructurar.

const OWNER = '11111111-1111-4111-8111-111111111111'
const DRAFT = '22222222-2222-4222-8222-222222222222'
const from = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: OWNER } } }) },
    from: (...a: unknown[]) => from(...a),
  }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/draft/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/ai', () => ({ callLLM: vi.fn(), AllProvidersFailedError: class extends Error {} }))
vi.mock('@/golf/billing/require-feature', () => ({
  checkFeatureAccess: async () => ({ allowed: true }),
  rechazoDeFeature: () => null,
}))

import { PATCH } from './route'
import { POST as invitar } from './collaborators/route'
import { POST as asistente } from './assistant/route'

const ctx = { params: Promise.resolve({ id: DRAFT }) }
const pedido = (body: string, method = 'POST') =>
  new Request('http://localhost/x', { method, body, headers: { 'Content-Type': 'application/json' } }) as unknown as NextRequest

describe('borrador de torneo — cuerpo inválido', () => {
  for (const cuerpo of ['{no es json', 'null']) {
    it(`PATCH /draft/[id] con ${cuerpo} → 400 sin tocar la base`, async () => {
      const res = await PATCH(pedido(cuerpo, 'PATCH'), ctx)
      expect(res.status).toBe(400)
      expect(from).not.toHaveBeenCalled()
    })

    it(`POST /collaborators con ${cuerpo} → 400 sin tocar la base`, async () => {
      const res = await invitar(pedido(cuerpo), ctx)
      expect(res.status).toBe(400)
      expect(from).not.toHaveBeenCalled()
    })

    it(`POST /assistant con ${cuerpo} → 400 sin llamar a la IA`, async () => {
      const res = await asistente(pedido(cuerpo), ctx)
      expect(res.status).toBe(400)
      expect(from).not.toHaveBeenCalled()
    })
  }

  it('POST /collaborators con un id que no es UUID → 400', async () => {
    const res = await invitar(pedido(JSON.stringify({ user_id_to_add: 'abc' })), ctx)
    expect(res.status).toBe(400)
  })

  it('PATCH /draft/[id] con un id de borrador que no es UUID → 400', async () => {
    const res = await PATCH(pedido('{}', 'PATCH'), { params: Promise.resolve({ id: 'no-uuid' }) })
    expect(res.status).toBe(400)
  })
})
