import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// Regresión: POST /api/admin/e2e/runs pasaba `base_url` y `branch` del body tal cual al workflow
// `e2e-trigger.yml`, que corre Playwright con las credenciales del usuario E2E contra esa URL.

const getUser = vi.fn()
const insert = vi.fn()
const countActive = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({ in: countActive }),
      insert: (row: unknown) => {
        insert(row)
        return { select: () => ({ single: async () => ({ data: { id: 'run-1' }, error: null }) }) }
      },
    }),
  })),
}))

const isAdmin = vi.fn()
vi.mock('@/lib/admin', () => ({ isAdmin: (...a: unknown[]) => isAdmin(...a) }))
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({}) }) }) }),
}))

import { POST } from '@/app/api/admin/e2e/runs/route'

const fetchMock = vi.fn()
let n = 0

function req(body: unknown): NextRequest {
  return new Request('http://x/api/admin/e2e/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  // Un admin distinto por test: el rate limit (5/h) es por usuario y vive en memoria.
  getUser.mockResolvedValue({ data: { user: { id: `admin-${++n}` } } })
  isAdmin.mockResolvedValue(true)
  countActive.mockResolvedValue({ count: 0 })
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GITHUB_PAT', 'pat-de-prueba')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('POST /api/admin/e2e/runs — entrada del workflow', () => {
  it('rechaza un base_url ajeno sin crear la corrida ni disparar el workflow', async () => {
    const res = await POST(req({ base_url: 'https://atacante.example' }))
    expect(res.status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rechaza una rama con forma rara', async () => {
    const res = await POST(req({ branch: '../main' }))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con body vacío (lo que manda el panel) dispara contra prod y main', async () => {
    const res = await POST(req({}))
    expect(res.status).toBeLessThan(300)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ base_url: 'https://golfersplus.vercel.app', branch: 'main' }))
    const enviado = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(enviado).toEqual({ ref: 'main', inputs: { run_id: 'run-1', base_url: 'https://golfersplus.vercel.app' } })
  })
})
