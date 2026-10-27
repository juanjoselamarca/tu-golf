import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import { BASELINE, functionDefinition, readMigration, stripSqlComments } from '@/__tests__/helpers/migration-sql'

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

  it('si la transacción falla: 500, se reporta y el mensaje dice que no se borró nada', async () => {
    const err = { code: '23503', message: 'violates foreign key constraint' }
    rpc.mockResolvedValue({ data: null, error: err })
    const res = await DELETE()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('no se borró nada')
    expect(captureError).toHaveBeenCalledWith(err, expect.objectContaining({ context: 'profile.delete-account', userId: UID }))
  })

  it('si la llamada revienta (red, service role sin configurar): 500 ordenado, se reporta y no se borró nada', async () => {
    const err = new TypeError('fetch failed')
    rpc.mockRejectedValue(err)
    const res = await DELETE()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('no se borró nada')
    expect(captureError).toHaveBeenCalledWith(err, expect.objectContaining({ context: 'profile.delete-account' }))
  })

  it('una respuesta que no se entiende es un error, no una cuenta eliminada', async () => {
    rpc.mockResolvedValue({ data: { ok: false, bloqueos: ['algo_nuevo'] }, error: null })
    expect((await DELETE()).status).toBe(500)
    rpc.mockResolvedValue({ data: null, error: null })
    expect((await DELETE()).status).toBe(500)
  })
})

describe('migración eliminar_cuenta', () => {
  const baseline = stripSqlComments(readMigration(BASELINE))
  const sql = functionDefinition(baseline, 'eliminar_cuenta')!

  it('nadie más que service role puede llamarla', () => {
    expect(baseline).toMatch(/revoke all on function public\.eliminar_cuenta\(uuid\) from public, anon, authenticated\b/)
    expect(baseline).not.toMatch(/grant [^;]*\bon function public\.eliminar_cuenta\([^)]*\) to (public|anon|authenticated)\b/i)
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

  // score_audit_log se escribe en cada guardado de score: si bloqueara, casi nadie podría borrar su cuenta.
  it('las correcciones de score no bloquean: la auditoría queda y el autor pasa a NULL', () => {
    expect(sql).not.toMatch(/score_audit_log WHERE changed_by/)
    expect(baseline).toMatch(/create table public\."score_audit_log" \([^;]*\n  "changed_by" uuid,\n/)
    expect(baseline).toMatch(/"score_audit_log_changed_by_fkey" FOREIGN KEY \(changed_by\) REFERENCES public\.profiles\(id\) ON DELETE SET NULL/)
  })

  it('evalúa todos los bloqueos antes de la primera escritura', () => {
    expect(primeraEscritura).toBeGreaterThan(-1)
    for (const b of ['organiza_torneos_con_otros', 'creo_rondas_con_otros']) {
      expect(sql.indexOf(`'${b}'`)).toBeGreaterThan(-1)
      expect(sql.indexOf(`'${b}'`)).toBeLessThan(primeraEscritura)
    }
    expect(sql.indexOf("'ok', false")).toBeLessThan(primeraEscritura)
  })

  it('sus tarjetas en rondas y torneos ajenos se desvinculan y anonimizan, no se borran', () => {
    expect(sql).not.toMatch(/DELETE FROM (ronda_libre_jugadores|players|tournament_group_players|rounds|hole_scores)\b/)
    const setRlj = sql.match(/UPDATE ronda_libre_jugadores j\s+SET([\s\S]*?)WHERE([\s\S]*?);/)
    expect(setRlj).not.toBeNull()
    for (const col of [/(^|[\s,])user_id = NULL/, /pending_user_id = NULL/, /nombre = c_anonimo/, /nombre_invitado = NULL/, /telefono_invitado = NULL/]) {
      expect(setRlj![1]).toMatch(col)
    }
    // Solo en rondas ajenas: sus filas en rondas propias se van con la ronda, no quedan anonimizadas.
    expect(setRlj![2]).toMatch(/NOT EXISTS \(SELECT 1 FROM rondas_libres r WHERE r\.id = j\.ronda_id AND r\.creador_id = p_user_id\)/)

    // players exige user_id XOR pending_user_id (players_identity_check): dejar ambos en NULL abortaría la transacción.
    const setPlayers = sql.match(/UPDATE players\s+SET([\s\S]*?)WHERE/)
    expect(setPlayers).not.toBeNull()
    for (const col of [/(^|[\s,])user_id = NULL/, /pending_user_id = gen_random_uuid\(\)/, /player_name = c_anonimo/]) {
      expect(setPlayers![1]).toMatch(col)
    }
    expect(sql).toMatch(/c_anonimo\s+(CONSTANT\s+)?text\s*:=\s*'Jugador eliminado'/)
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
