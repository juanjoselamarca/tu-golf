import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const getUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

const rpc = vi.fn()
const from = vi.fn()
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ rpc, from }),
}))

const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

const allowed = vi.fn(() => ({ allowed: true, remaining: 2, resetAt: 0 }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => allowed(),
  rateLimitHeaders: () => ({}),
}))

import { DELETE } from '../route'

const UID = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: UID } } })
  allowed.mockReturnValue({ allowed: true, remaining: 2, resetAt: 0 })
})

describe('DELETE /api/profile/delete-account', () => {
  it('sin sesión: 401 y no borra nada', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE()
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('con el rate limit agotado: 429 y no borra nada', async () => {
    allowed.mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 })
    const res = await DELETE()
    expect(res.status).toBe(429)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('borra con UNA llamada a la RPC transaccional, con el id de la sesión y nunca tabla por tabla', async () => {
    rpc.mockResolvedValue({ data: { ok: true, bloqueos: [] }, error: null })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('eliminar_cuenta', { p_user_id: UID })
    expect(from).not.toHaveBeenCalled()
  })

  it('si borrarla destruiría tarjetas de otros: 409 con el motivo', async () => {
    rpc.mockResolvedValue({ data: { ok: false, bloqueos: ['organiza_torneos_con_otros', 'creo_rondas_con_otros'] }, error: null })
    const res = await DELETE()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.bloqueos).toEqual(['organiza_torneos_con_otros', 'creo_rondas_con_otros'])
    expect(body.error).toContain('torneos que organizas con otros jugadores y rondas que creaste')
    expect(body.error).toContain('No borramos nada')
  })

  it('si la transacción falla: 500, se reporta y el mensaje dice que no se borró nada', async () => {
    const err = { code: '23503', message: 'violates foreign key constraint' }
    rpc.mockResolvedValue({ data: null, error: err })
    const res = await DELETE()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('no se borró nada')
    expect(captureError).toHaveBeenCalledWith(err, expect.objectContaining({ context: 'profile.delete-account', userId: UID }))
  })

  it('una respuesta que no se entiende es un error, no una cuenta eliminada', async () => {
    rpc.mockResolvedValue({ data: { ok: false, bloqueos: ['algo_nuevo'] }, error: null })
    expect((await DELETE()).status).toBe(500)
    rpc.mockResolvedValue({ data: null, error: null })
    expect((await DELETE()).status).toBe(500)
  })
})

describe('migración eliminar_cuenta', () => {
  const sql = readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261018060000_eliminar_cuenta_atomica.sql'),
    'utf8',
  ).replace(/--.*$/gm, '')

  it('nadie más que service role puede llamarla', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.eliminar_cuenta\(uuid\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/auth\.role\(\), ''\) = 'service_role'/)
  })

  it('evalúa los bloqueos antes del primer DELETE', () => {
    const primerDelete = sql.indexOf('DELETE FROM')
    expect(sql.indexOf("'organiza_torneos_con_otros'")).toBeLessThan(primerDelete)
    expect(sql.indexOf("'creo_rondas_con_otros'")).toBeLessThan(primerDelete)
    expect(sql.indexOf("'ok', false")).toBeLessThan(primerDelete)
  })

  it('suelta cada referencia NO ACTION antes de borrar auth.users, en orden de dependencia', () => {
    // NO ACTION en prod (pg_constraint, 18-oct-2026): tournament_group_players.jugador_ronda_id →
    // ronda_libre_jugadores · taiger_sessions.{tournament_id, ronda_libre_id} → tournaments/rondas_libres ·
    // ronda_libre_jugadores.user_id y rondas_libres.creador_id → profiles.
    const orden = [
      'DELETE FROM tournament_group_players',
      'DELETE FROM taiger_sessions',
      'DELETE FROM tournaments',
      'DELETE FROM ronda_libre_jugadores',
      'DELETE FROM rondas_libres',
      'DELETE FROM auth.users',
    ].map(s => sql.indexOf(s))
    expect(orden.every(i => i >= 0)).toBe(true)
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
  })
})
