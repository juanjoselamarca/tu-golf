import { describe, it, expect, vi, afterEach } from 'vitest'
import { asegurarTarjetaVigente, esFuncionInexistente, pedirTarjetaVigente } from './tarjeta-vigente'

const admin = (r: { data: unknown; error: unknown }) =>
  ({ rpc: vi.fn(async () => r) }) as unknown as Parameters<typeof asegurarTarjetaVigente>[0]

describe('asegurarTarjetaVigente (servidor)', () => {
  it('ok → la tarjeta de la ronda vigente', async () => {
    const r = await asegurarTarjetaVigente(admin({ data: { ok: true, round_id: 'r1', round_number: 2, creada: false }, error: null }), 't', 'p')
    expect(r).toEqual({ tipo: 'ok', roundId: 'r1', roundNumber: 2, creada: false })
  })
  it('la función se niega → rechazo con el motivo', async () => {
    const r = await asegurarTarjetaVigente(admin({ data: { ok: false, reason: 'round_not_in_play' }, error: null }), 't', 'p')
    expect(r).toEqual({ tipo: 'rechazo', motivo: 'round_not_in_play' })
  })
  it('función inexistente (deploy antes de la migración) → sin_soporte, no lanza', async () => {
    expect(await asegurarTarjetaVigente(admin({ data: null, error: { code: 'PGRST202' } }), 't', 'p')).toEqual({ tipo: 'sin_soporte' })
    expect(esFuncionInexistente({ code: '42883' })).toBe(true)
    expect(esFuncionInexistente({ code: '57014' })).toBe(false)
    expect(esFuncionInexistente(null)).toBe(false)
  })
  it('otra falla de la base o forma inesperada → lanza (la ruta responde 503)', async () => {
    await expect(asegurarTarjetaVigente(admin({ data: null, error: { code: '57014' } }), 't', 'p')).rejects.toBeTruthy()
    await expect(asegurarTarjetaVigente(admin({ data: { raro: 1 }, error: null }), 't', 'p')).rejects.toThrow(/inesperada/)
  })
})

describe('pedirTarjetaVigente (cliente)', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const responde = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

  it('manda el jugador y, si es invitado, sus headers', async () => {
    responde(200, { ok: true })
    expect(await pedirTarjetaVigente({ slug: 'copa x', playerId: 'p1', guestId: 'g', guestToken: 'tok' })).toBe('respondio')
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('/api/torneos/copa%20x/tarjeta')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ player_id: 'p1' })
    expect((init.headers as Record<string, string>)['x-guest-id']).toBe('g')
  })
  it.each([[403, { code: 'card_not_yours' }], [409, { reason: 'tournament_closed' }], [503, { code: 'sin_soporte' }]])(
    '%i es una respuesta (no "sin conexión")',
    async (status, body) => {
      responde(status, body)
      expect(await pedirTarjetaVigente({ slug: 's', playerId: 'p' })).toBe('respondio')
    },
  )
  it('401 → sin_sesion (no "Todavía no aparece": la sesión se cerró)', async () => {
    responde(401, { error: 'x' })
    expect(await pedirTarjetaVigente({ slug: 's', playerId: 'p' })).toBe('sin_sesion')
  })
  it('5xx sin sin_soporte, HTML de error o corte de red → sin_conexion', async () => {
    responde(503, { error: 'x' })
    expect(await pedirTarjetaVigente({ slug: 's', playerId: 'p' })).toBe('sin_conexion')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })))
    expect(await pedirTarjetaVigente({ slug: 's', playerId: 'p' })).toBe('sin_conexion')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await pedirTarjetaVigente({ slug: 's', playerId: 'p' })).toBe('sin_conexion')
  })
})
