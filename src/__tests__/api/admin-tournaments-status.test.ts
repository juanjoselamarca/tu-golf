/**
 * PATCH /api/admin/tournaments/[id]: los estados que acepta son los de la base.
 *
 * La API aceptaba 'active' y 'cancelled' (la base los rechaza: 500) y rechazaba 'open' y
 * 'published' (400). El panel manda siempre el estado actual junto al nombre, así que ningún
 * torneo abierto o publicado se podía editar (ni renombrar). La referencia es el CHECK de la base.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { TOURNAMENT_STATUSES } from '@/lib/data/tournaments/status'

const update = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }),
}))
vi.mock('@/lib/admin', () => ({ isAdmin: async () => true }))
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (valores: Record<string, unknown>) => {
        update(valores)
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 't1', ...valores }, error: null }) }) }) }
      },
      insert: async () => ({ error: null }),
    }),
  }),
}))

import { PATCH } from '@/app/api/admin/tournaments/[id]/route'

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')
const lineaDelCheck = leer('supabase/schema.sql').split('\n').find(l => l.includes('"tournaments_status_check"')) ?? ''
const ESTADOS_DE_LA_BASE = [...lineaDelCheck.matchAll(/'([a-z_]+)'::text/g)].map(m => m[1])

const patch = (body: string) => PATCH(
  new NextRequest('http://localhost/api/admin/tournaments/t1', { method: 'PATCH', body, headers: { 'content-type': 'application/json' } }),
  { params: Promise.resolve({ id: 't1' }) },
)

beforeEach(() => update.mockClear())

describe('estados de torneo en el panel de admin', () => {
  it('la lista canónica es exactamente la del CHECK tournaments_status_check', () => {
    expect(ESTADOS_DE_LA_BASE.length).toBeGreaterThanOrEqual(5)
    expect([...TOURNAMENT_STATUSES].sort()).toEqual([...ESTADOS_DE_LA_BASE].sort())
  })

  it.each(['draft', 'open', 'in_progress', 'closed', 'published'])('guarda el nombre de un torneo en estado %s', async (status) => {
    const res = await patch(JSON.stringify({ name: 'Copa de prueba', status }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ name: 'Copa de prueba', status })
  })

  it.each(['active', 'cancelled', 'finished'])('rechaza %s con 400 sin llegar a la base', async (status) => {
    const res = await patch(JSON.stringify({ status }))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('un body que no es JSON responde 400, no una excepción', async () => {
    const res = await patch('esto no es json')
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
})
