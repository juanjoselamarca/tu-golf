// Contrato del join-info SIN sesión: además del torneo público, la respuesta trae el cupo y el gate
// de invitados (`capacity`, `invitados`). Si alguno desaparece, la pantalla `/unirse` vuelve a ofrecer
// un formulario que el backend va a rechazar (403 "necesita plan Pro" / 409 "amplía el cupo").
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

let user: { id: string } | null = null
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({ admin: true }) }))

const TORNEO = { id: 't1', name: 'Copa', slug: 'copa', status: 'open', organizer_id: 'o1' }
const joinFlow = vi.hoisted(() => ({
  fetchJoinInfoPublica: vi.fn(),
  condicionesInscripcionPublica: vi.fn(),
  fetchJoinInfo: vi.fn(),
}))
vi.mock('@/lib/data/tournaments/joinFlow', () => joinFlow)

import { GET } from '../route'

const params = { params: Promise.resolve({ slug: 'copa' }) }
const req = () => new NextRequest('https://golfersplus.vercel.app/api/torneos/copa/join-info')

describe('GET /api/torneos/[slug]/join-info sin sesión', () => {
  it('adelanta cupo y gate de invitados junto al torneo público', async () => {
    joinFlow.fetchJoinInfoPublica.mockResolvedValueOnce(TORNEO)
    joinFlow.condicionesInscripcionPublica.mockResolvedValueOnce({
      capacity: { full: false, maxPlayers: 24, approved: 3 },
      invitados: { permitido: false, motivo: 'pro_required' },
    })

    const res = await GET(req(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      tournament: TORNEO,
      profile: null,
      alreadyRegistered: false,
      authenticated: false,
      capacity: { full: false, maxPlayers: 24, approved: 3 },
      invitados: { permitido: false, motivo: 'pro_required' },
    })
    // Las condiciones se calculan sobre el torneo recién leído (incluye `status` para no consultar
    // el plan del organizador en torneos cerrados).
    expect(joinFlow.condicionesInscripcionPublica).toHaveBeenCalledWith({ admin: true }, TORNEO)
    expect(joinFlow.fetchJoinInfo).not.toHaveBeenCalled()
  })

  it('torneo inexistente → 404 sin consultar cupo ni plan', async () => {
    joinFlow.fetchJoinInfoPublica.mockResolvedValueOnce(null)
    const res = await GET(req(), params)
    expect(res.status).toBe(404)
    expect(joinFlow.condicionesInscripcionPublica).not.toHaveBeenCalled()
  })

  it('con sesión sigue el camino completo (perfil + alreadyRegistered), sin el gate anónimo', async () => {
    user = { id: 'u1' }
    joinFlow.fetchJoinInfo.mockResolvedValueOnce({ tournament: TORNEO, profile: { id: 'u1' }, alreadyRegistered: true })
    const res = await GET(req(), params)
    user = null
    expect(await res.json()).toEqual({
      tournament: TORNEO, profile: { id: 'u1' }, alreadyRegistered: true, authenticated: true,
    })
    expect(joinFlow.condicionesInscripcionPublica).not.toHaveBeenCalled()
  })
})
