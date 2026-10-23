// El gate Pro de invitados es una sola fuente para guest-join (responde con él) y join-info (lo adelanta a la
// pantalla). Antes solo guest-join lo aplicaba: el invitado llenaba el formulario y recién al enviar veía el 403.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const billing = vi.hoisted(() => ({ checkFeatureAccess: vi.fn() }))
vi.mock('@/golf/billing/require-feature', async () => ({
  ...(await vi.importActual<typeof import('@/golf/billing/require-feature')>('@/golf/billing/require-feature')),
  checkFeatureAccess: billing.checkFeatureAccess,
}))

import { condicionesInscripcionPublica, invitadosDesdeRechazo, rechazoInvitados, MENSAJES_GATE_INVITADOS } from '../joinFlow'

/** Admin mínimo para `tournamentCapacity`: max_players y conteo de approved. */
function admin(maxPlayers: number | null, approved: number): SupabaseClient {
  return {
    from: (tabla: string) => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.single = () => Promise.resolve({ data: { max_players: maxPlayers }, error: null })
      b.then = (resolve: (v: unknown) => void) => resolve({ count: approved, data: null, error: null })
      if (tabla !== 'tournaments' && tabla !== 'players') throw new Error(`tabla inesperada ${tabla}`)
      return b
    },
  } as unknown as SupabaseClient
}

beforeEach(() => vi.clearAllMocks())

describe('rechazoInvitados / invitadosDesdeRechazo', () => {
  it('organizador free → 403 pro_required con el mismo texto que responde guest-join', async () => {
    billing.checkFeatureAccess.mockResolvedValueOnce({ allowed: false, tier: 'free', requiredTier: 'pro' })
    const rechazo = await rechazoInvitados(admin(null, 0), 'o1')
    expect(billing.checkFeatureAccess).toHaveBeenCalledWith(expect.anything(), 'o1', 'guest-tournament')
    expect(rechazo?.status).toBe(403)
    expect(rechazo?.body.message).toBe(MENSAJES_GATE_INVITADOS.proRequerido)
    expect(invitadosDesdeRechazo(rechazo)).toEqual({
      permitido: false, motivo: 'pro_required', mensaje: MENSAJES_GATE_INVITADOS.proRequerido,
    })
  })

  it('plan ilegible → 503 plan_unavailable (reintentable), no un "no"', async () => {
    billing.checkFeatureAccess.mockResolvedValueOnce({ allowed: false, tier: 'free', requiredTier: 'pro', planNoVerificado: true })
    const rechazo = await rechazoInvitados(admin(null, 0), 'o1')
    expect(rechazo?.status).toBe(503)
    expect(invitadosDesdeRechazo(rechazo)).toEqual({
      permitido: false, motivo: 'plan_unavailable', mensaje: MENSAJES_GATE_INVITADOS.planNoVerificado,
    })
  })

  it('organizador Pro → sin rechazo → permitido', async () => {
    billing.checkFeatureAccess.mockResolvedValueOnce({ allowed: true, tier: 'pro', requiredTier: 'pro' })
    expect(await rechazoInvitados(admin(null, 0), 'o1')).toBeNull()
    expect(invitadosDesdeRechazo(null)).toEqual({ permitido: true })
  })
})

describe('condicionesInscripcionPublica', () => {
  it('trae cupo real e invitados en una sola llamada para el visitante sin sesión', async () => {
    billing.checkFeatureAccess.mockResolvedValueOnce({ allowed: false, tier: 'free', requiredTier: 'pro' })
    const c = await condicionesInscripcionPublica(admin(24, 24), { id: 't1', organizer_id: 'o1' })
    expect(c.capacity).toEqual({ full: true, maxPlayers: 24, approved: 24 })
    expect(c.invitados.permitido).toBe(false)
  })
})
