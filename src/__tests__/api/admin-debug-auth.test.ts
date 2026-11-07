/**
 * GET /api/admin/debug-auth: sin sesión responde 401, no 200.
 *
 * Era la única ruta bajo api/admin/ que contestaba 200 al anónimo (con `{ user: null }`). No
 * filtraba nada, pero una sonda sin sesión la leía como abierta y el panel la trataba igual que
 * una respuesta buena. Con sesión sin rol admin sigue 403; con admin, 200 y el perfil.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Usuario = { id: string; email: string } | null
let usuario: Usuario = null
let esAdmin = false

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario }, error: usuario ? null : { message: 'Auth session missing!' } }) } }),
}))
vi.mock('@/lib/admin', () => ({ isAdmin: async () => esAdmin }))
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { id: 'admin-1', email: 'a@b.cl', role: 'admin' }, error: null }) }),
      }),
    }),
  }),
}))

import { GET } from '@/app/api/admin/debug-auth/route'

beforeEach(() => {
  usuario = null
  esAdmin = false
})

describe('GET /api/admin/debug-auth', () => {
  it('sin sesión responde 401 con el motivo y user null (antes: 200)', async () => {
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ step: 'auth', error: 'Auth session missing!', user: null })
  })

  it('con sesión pero sin rol admin responde 403', async () => {
    usuario = { id: 'u-1', email: 'u@b.cl' }
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('con admin responde 200 con el perfil', async () => {
    usuario = { id: 'admin-1', email: 'a@b.cl' }
    esAdmin = true
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.step).toBe('complete')
    expect(body.isAdmin).toBe(true)
    expect(body.profile).toEqual({ id: 'admin-1', email: 'a@b.cl', role: 'admin' })
  })
})
