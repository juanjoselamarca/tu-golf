// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { guardarRonda, rondasPorGuardar, reportarFallaDelHistorial } from './historial-del-cierre-pasos'
import { guardarRondaDeTorneoEnHistorial } from './historial-torneo'
import { captureError } from '@/lib/error-tracking'
import { RetryableError } from 'workflow'

const lectura = { data: null as unknown, error: null as unknown }
const filtros: Array<[string, unknown]> = []
const cliente = {
  from: vi.fn(() => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (columna: string, valor: unknown) => { filtros.push([columna, valor]); return b },
      is: (columna: string, valor: unknown) => { filtros.push([columna, valor]); return b },
      then: (ok: (v: unknown) => unknown) => Promise.resolve(lectura).then(ok),
    }
    return b
  }),
}

vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => cliente }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => undefined) }))
vi.mock('./historial-torneo', () => ({ guardarRondaDeTorneoEnHistorial: vi.fn(async () => undefined) }))

beforeEach(() => {
  filtros.length = 0
  lectura.data = null
  lectura.error = null
  cliente.from.mockClear()
})

describe('rondasPorGuardar', () => {
  it('suma a las que cerró el cierre las cerradas sin finalizar del torneo, sin repetir', async () => {
    lectura.data = [{ id: 'a' }, { id: 'c' }]
    expect(await rondasPorGuardar('t1', ['a', 'b'])).toEqual(['a', 'b', 'c'])
    expect(cliente.from).toHaveBeenCalledWith('rounds')
    expect(filtros).toEqual([['tournament_id', 't1'], ['status', 'closed'], ['closed_at', null]])
  })

  it('si la lectura falla, lanza un Error con el mensaje de Supabase para que el paso se reintente', async () => {
    lectura.error = { message: 'FetchError: timeout', code: '' }
    const error = await rondasPorGuardar('t1', ['a']).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ message: 'FetchError: timeout' })
  })
})

describe('guardarRonda', () => {
  it('guarda la ronda esperando su índice', async () => {
    await guardarRonda('r1')
    expect(guardarRondaDeTorneoEnHistorial).toHaveBeenCalledWith(cliente, 'r1', { esperarElIndice: true })
  })

  it('si el guardado falla, lanza para que el paso se reintente en un minuto', async () => {
    vi.mocked(guardarRondaDeTorneoEnHistorial).mockRejectedValueOnce({ message: 'lectura fallida', code: '57014' })
    const antes = Date.now()
    const error = await guardarRonda('r1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RetryableError)
    expect(error).toMatchObject({ message: '57014: lectura fallida' })
    expect((error as RetryableError).retryAfter.getTime() - antes).toBeGreaterThanOrEqual(60_000)
    expect(guardarRonda.maxRetries).toBe(10)
  })
})

describe('reportarFallaDelHistorial', () => {
  it('reporta el mensaje con el contexto del cierre', async () => {
    await reportarFallaDelHistorial('Error: timeout', { roundId: 'r1' })
    expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Error: timeout' }), { context: 'torneo.historial-cierre', meta: { roundId: 'r1' } })
  })
})
