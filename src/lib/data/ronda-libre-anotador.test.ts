import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const triggerRoundUpdatePush = vi.hoisted(() => vi.fn())
vi.mock('@/lib/round-notifications', () => ({ triggerRoundUpdatePush }))

import { reclamarEquipoDeRonda, liberarEquipoDeRonda, terminarEquipoDeRonda, reabrirEquipoDeRonda, mensajeEquipoTomado, MENSAJE_YA_NO_ANOTAS, MENSAJE_EQUIPO_YA_NO_ES_TUYO, MENSAJE_EQUIPO_SIN_SESION } from './ronda-libre-anotador'

const cliente = (r: { data?: unknown; error?: { code: string } | null } | Error) => ({
  rpc: vi.fn(() => (r instanceof Error ? Promise.reject(r) : Promise.resolve({ data: r.data ?? null, error: r.error ?? null }))),
}) as unknown as Parameters<typeof reclamarEquipoDeRonda>[0]

describe('reclamarEquipoDeRonda', () => {
  it('llama la RPC con código y equipo', async () => {
    const c = cliente({ data: { estado: 'ok' } })
    expect(await reclamarEquipoDeRonda(c, 'ABC123', 'e1')).toEqual({ estado: 'ok' })
    expect((c as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('reclamar_equipo_de_ronda', { p_codigo: 'ABC123', p_equipo_id: 'e1' })
  })
  it('tomado: el copy con el nombre de quien lo anota, o «otro celular»', async () => {
    expect(await reclamarEquipoDeRonda(cliente({ data: { estado: 'tomado', anotador_nombre: 'Pedro' } }), 'X', 'e1'))
      .toEqual({ estado: 'tomado', mensaje: 'Ese equipo ya lo anota Pedro. Elige otro.' })
    expect(await reclamarEquipoDeRonda(cliente({ data: { estado: 'tomado', anotador_nombre: null } }), 'X', 'e1'))
      .toEqual({ estado: 'tomado', mensaje: 'Ese equipo ya lo anota otro celular. Elige otro.' })
  })
  it('ya_tienes_equipo trae el equipo', async () => {
    expect(await reclamarEquipoDeRonda(cliente({ data: { estado: 'ya_tienes_equipo', equipo_id: 'e2' } }), 'X', 'e1'))
      .toEqual({ estado: 'ya_tienes_equipo', equipoId: 'e2' })
  })
  it('errores SQL a copy (contrato de pruebas-sql/equipos-de-club.sql)', async () => {
    expect(await reclamarEquipoDeRonda(cliente({ error: { code: 'P0002' } }), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'cerrada', mensaje: 'La ronda ya terminó.' })
    expect(await reclamarEquipoDeRonda(cliente({ error: { code: 'P0001' } }), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'viva' })
    expect(await reclamarEquipoDeRonda(cliente({ error: { code: 'P0003' } }), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'sin_permiso' })
  })
  it('sin red: nunca lanza', async () => {
    expect(await reclamarEquipoDeRonda(cliente(new Error('fetch failed')), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'sin_respuesta' })
  })
})

describe('liberarEquipoDeRonda', () => {
  it('ok y rechazo de quien no es creador ni anotador', async () => {
    expect(await liberarEquipoDeRonda(cliente({ data: { estado: 'ok' } }), 'X', 'e1')).toEqual({ estado: 'ok' })
    expect(await liberarEquipoDeRonda(cliente({ error: { code: 'P0003' } }), 'X', 'e1')).toEqual({
      estado: 'error', mensaje: 'Solo quien creó la ronda o quien anota ese equipo puede liberarlo.',
    })
  })
})

describe('copy', () => {
  it('ya no anotas', () => {
    expect(MENSAJE_YA_NO_ANOTAS).toBe('Ya no anotas este equipo.')
    expect(mensajeEquipoTomado('Ana')).toBe('Ese equipo ya lo anota Ana. Elige otro.')
  })
})

describe('terminarEquipoDeRonda (contrato de pruebas-sql/terminar-equipo.sql)', () => {
  beforeEach(() => triggerRoundUpdatePush.mockClear())
  it('llama la RPC con código y equipo; ok sin cerrar avisa sin forzar', async () => {
    const c = cliente({ data: { estado: 'ok', ronda_cerrada: false } })
    expect(await terminarEquipoDeRonda(c, 'ABC', 'e1')).toEqual({ estado: 'ok', rondaCerrada: false })
    expect((c as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('terminar_equipo_de_ronda', { p_codigo: 'ABC', p_equipo_id: 'e1' })
    expect(triggerRoundUpdatePush).toHaveBeenCalledWith('ABC', {})
  })
  it('el último equipo cierra la ronda: aviso FORZADO (el «Resultado final» no se pierde)', async () => {
    expect(await terminarEquipoDeRonda(cliente({ data: { estado: 'ok', ronda_cerrada: true } }), 'ABC', 'e1')).toEqual({ estado: 'ok', rondaCerrada: true })
    expect(triggerRoundUpdatePush).toHaveBeenCalledWith('ABC', { force: true })
  })
  it('incompleto: sin aviso a nadie', async () => {
    expect(await terminarEquipoDeRonda(cliente({ data: { estado: 'incompleto' } }), 'ABC', 'e1')).toEqual({ estado: 'incompleto' })
    expect(triggerRoundUpdatePush).not.toHaveBeenCalled()
  })
  it('P0003 y P0001: el equipo ya no es de este celular', async () => {
    for (const code of ['P0003', 'P0001']) {
      expect(await terminarEquipoDeRonda(cliente({ error: { code } }), 'X', 'e1')).toEqual({ estado: 'error', ronda: 'sin_permiso', mensaje: MENSAJE_EQUIPO_YA_NO_ES_TUYO })
    }
    expect(triggerRoundUpdatePush).not.toHaveBeenCalled()
  })
  it('sesión cerrada (P0003 «sin sesión» con uid NULL, o 42501 de anon): aviso de sesión, no de cambio de anotador', async () => {
    const sinSesion = { estado: 'error', ronda: 'sin_sesion', mensaje: MENSAJE_EQUIPO_SIN_SESION }
    expect(await terminarEquipoDeRonda(cliente({ error: { code: 'P0003', details: 'sin sesión' } }), 'X', 'e1')).toEqual(sinSesion)
    expect(await terminarEquipoDeRonda(cliente({ error: { code: '42501', details: null } }), 'X', 'e1')).toEqual(sinSesion)
    expect(await reabrirEquipoDeRonda(cliente({ error: { code: 'P0003', details: 'sin sesión' } }), 'X', 'e1')).toEqual(sinSesion)
    expect(await reabrirEquipoDeRonda(cliente({ error: { code: '42501' } }), 'X', 'e1')).toEqual(sinSesion)
    // Otro P0003 (lo anota otro celular) sigue siendo cambio de anotador.
    expect(await reabrirEquipoDeRonda(cliente({ error: { code: 'P0003', details: 'equipo_de_otro_anotador' } }), 'X', 'e1')).toMatchObject({ ronda: 'sin_permiso', mensaje: MENSAJE_EQUIPO_YA_NO_ES_TUYO })
    expect(triggerRoundUpdatePush).not.toHaveBeenCalled()
  })
  it('sin red: nunca lanza; se empuja forzado por si cerró y la respuesta se perdió', async () => {
    expect(await terminarEquipoDeRonda(cliente(new Error('fetch failed')), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'sin_respuesta' })
    expect(triggerRoundUpdatePush).toHaveBeenCalledWith('X', { force: true })
  })
  it('respuesta desconocida: como sin respuesta (reintentar es idempotente)', async () => {
    expect(await terminarEquipoDeRonda(cliente({ data: { estado: 'raro' } }), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'sin_respuesta' })
  })
})

describe('reabrirEquipoDeRonda', () => {
  it('ok llama la RPC y avisa', async () => {
    const c = cliente({ data: { estado: 'ok' } })
    expect(await reabrirEquipoDeRonda(c, 'ABC', 'e1')).toEqual({ estado: 'ok' })
    expect((c as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('reabrir_equipo_de_ronda', { p_codigo: 'ABC', p_equipo_id: 'e1' })
  })
  it('ronda cerrada (P0002), sin permiso y sin red', async () => {
    expect(await reabrirEquipoDeRonda(cliente({ error: { code: 'P0002' } }), 'X', 'e1')).toEqual({ estado: 'error', ronda: 'cerrada', mensaje: 'La ronda ya terminó.' })
    expect(await reabrirEquipoDeRonda(cliente({ error: { code: 'P0003' } }), 'X', 'e1')).toMatchObject({ ronda: 'sin_permiso' })
    expect(await reabrirEquipoDeRonda(cliente(new Error('x')), 'X', 'e1')).toMatchObject({ ronda: 'sin_respuesta' })
  })
})
