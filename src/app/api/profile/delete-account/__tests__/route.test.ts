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
import { SOPORTE_EMAIL } from '@/lib/constants'

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
    expect(body.error).toContain('no borramos nada')
    expect(body.error).toContain(SOPORTE_EMAIL)
  })

  it('las correcciones de score firmadas también bloquean, con su propio motivo', async () => {
    rpc.mockResolvedValue({ data: { ok: false, bloqueos: ['firmo_correcciones_de_score'] }, error: null })
    const res = await DELETE()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('correcciones de score que hiciste en torneos')
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

  // Primera escritura real (UPDATE o DELETE al inicio de una sentencia; no cuenta el "FOR UPDATE" del lock).
  const primeraEscritura = sql.search(/^\s*(UPDATE|DELETE FROM)\s/m)

  it('bloquea las filas propias antes de chequear (nadie se inscribe entre el chequeo y el borrado)', () => {
    const lock = sql.indexOf('FROM tournaments WHERE organizer_id = p_user_id FOR UPDATE')
    expect(lock).toBeGreaterThan(-1)
    expect(sql.indexOf('FROM rondas_libres WHERE creador_id = p_user_id FOR UPDATE')).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(sql.indexOf("'organiza_torneos_con_otros'"))
  })

  it('evalúa todos los bloqueos antes de la primera escritura', () => {
    expect(primeraEscritura).toBeGreaterThan(-1)
    for (const b of ['organiza_torneos_con_otros', 'creo_rondas_con_otros', 'firmo_correcciones_de_score']) {
      expect(sql.indexOf(`'${b}'`)).toBeGreaterThan(-1)
      expect(sql.indexOf(`'${b}'`)).toBeLessThan(primeraEscritura)
    }
    expect(sql.indexOf("'ok', false")).toBeLessThan(primeraEscritura)
  })

  it('sus tarjetas en rondas y torneos ajenos se desvinculan y anonimizan, no se borran', () => {
    expect(sql).not.toMatch(/DELETE FROM (ronda_libre_jugadores|players|tournament_group_players|rounds|hole_scores)\b/)
    expect(sql).toMatch(/UPDATE ronda_libre_jugadores j\s+SET\s+user_id = NULL/)
    // players exige user_id XOR pending_user_id (players_identity_check): dejar ambos en NULL abortaría la transacción.
    expect(sql).toMatch(/UPDATE players\s+SET\s+user_id = NULL, pending_user_id = gen_random_uuid\(\)/)
  })

  it('suelta cada referencia NO ACTION antes de borrar auth.users, en orden de dependencia', () => {
    // NO ACTION en prod (pg_constraint, 18-oct-2026): taiger_sessions.{tournament_id, ronda_libre_id} →
    // tournaments/rondas_libres · ronda_libre_jugadores.user_id, rondas_libres.{creador_id, admin_user_id} →
    // profiles/auth.users.
    const orden = [
      'DELETE FROM taiger_sessions',
      'DELETE FROM tournaments',
      'UPDATE ronda_libre_jugadores',
      'UPDATE players',
      'UPDATE rondas_libres',
      'DELETE FROM rondas_libres',
      'DELETE FROM auth.users',
    ].map(s => sql.indexOf(s))
    expect(orden.every(i => i >= 0)).toBe(true)
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
  })
})
