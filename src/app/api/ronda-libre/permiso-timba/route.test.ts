import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET /api/ronda-libre/permiso-timba: la UI pregunta si puede ofrecer Timba libre. La regla vive en UNA función
// (`puedeCrearJuegoPersonalizado`), la misma que usa `POST /create`.

let sub: string | null = 'u-admin'
const puede = vi.fn<(id: string | null | undefined) => Promise<boolean>>()
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) } }),
}))
vi.mock('@/lib/auth/juego-personalizado', () => ({ puedeCrearJuegoPersonalizado: (id: string | null | undefined) => puede(id) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { GET } from './route'

describe('GET /api/ronda-libre/permiso-timba', () => {
  beforeEach(() => { sub = 'u-admin'; puede.mockReset() })

  it('responde lo que dice la regla única, con el usuario de la sesión', async () => {
    puede.mockResolvedValue(true)
    const res = await GET()
    expect(await res.json()).toEqual({ puedeCrear: true })
    expect(puede).toHaveBeenCalledWith('u-admin')
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/)
  })

  it('no admin → false', async () => {
    puede.mockResolvedValue(false)
    expect(await (await GET()).json()).toEqual({ puedeCrear: false })
  })

  it('sin sesión → false sin consultar', async () => {
    sub = null
    expect(await (await GET()).json()).toEqual({ puedeCrear: false })
    expect(puede).not.toHaveBeenCalled()
  })

  it('si algo falla, falla cerrado', async () => {
    puede.mockRejectedValue(new Error('boom'))
    expect(await (await GET()).json()).toEqual({ puedeCrear: false })
  })
})
