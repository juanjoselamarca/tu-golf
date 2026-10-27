import { describe, it, expect, beforeEach } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import { hayMarcasPendientes, marcarPuntitoConRespaldo, marcasPendientes, reenviarPuntitosPendientes } from './puntitos-pendientes'
import { hayPendientes, limpiarCopiaLocalDelGrupo } from './score-storage'
import { ERRCODE_SIN_RESPUESTA, type RondaLibreWriteClient } from '@/lib/data/ronda-libre-scores'

const COD = 'ABC123'
type Llamada = { fn: string; args: Record<string, unknown> }

/** Cliente simulado: `modo` decide la respuesta de cada RPC. */
function cliente(modo: () => 'ok' | 'sin_red' | 'rechazo') {
  const llamadas: Llamada[] = []
  const c: RondaLibreWriteClient = {
    rpc: (fn, args) => {
      llamadas.push({ fn, args })
      const m = modo()
      const error = m === 'ok' ? null
        : ({ code: m === 'sin_red' ? ERRCODE_SIN_RESPUESTA : '22023', message: m } as PostgrestError)
      return Promise.resolve({ data: m === 'ok' ? { aplicada: true } : null, error })
    },
  }
  return { c, llamadas }
}

const greenie = (jugadorId: string, marcar = true) => ({ jugadorId, puntitoId: 'greenie', hoyo: 3, marcar, esGreenie: true })

beforeEach(() => localStorage.clear())

describe('marcas de Timba con respaldo offline', () => {
  it('con señal: se envía y no queda pendiente', async () => {
    const { c, llamadas } = cliente(() => 'ok')
    await marcarPuntitoConRespaldo(c, COD, greenie('pedro'))
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].fn).toBe('marcar_puntito_ronda_libre')
    expect(llamadas[0].args).toMatchObject({ p_codigo: COD, p_jugador_id: 'pedro', p_hoyo: 3, p_puntito_id: 'greenie', p_marcar: true })
    expect(hayMarcasPendientes(COD)).toBe(false)
  })

  it('sin señal: queda pendiente y se reenvía al volver', async () => {
    let red: 'ok' | 'sin_red' = 'sin_red'
    const { c, llamadas } = cliente(() => red)
    await marcarPuntitoConRespaldo(c, COD, { jugadorId: 'juan', puntitoId: 'sandy', hoyo: 5, marcar: true, esGreenie: false })
    expect(marcasPendientes(COD)).toMatchObject([{ jugadorId: 'juan', puntitoId: 'sandy', hoyo: 5, marcar: true }])
    red = 'ok'
    expect(await reenviarPuntitosPendientes(c, COD)).toEqual({ enviadas: 1, pendientes: 0 })
    expect(llamadas.at(-1)?.args).toMatchObject({ p_jugador_id: 'juan', p_puntito_id: 'sandy', p_hoyo: 5, p_marcar: true })
  })

  it('greenie sin señal Pedro → Juan → Pedro: al volver se envía solo el último (gana Pedro)', async () => {
    let red: 'ok' | 'sin_red' = 'sin_red'
    const { c, llamadas } = cliente(() => red)
    await marcarPuntitoConRespaldo(c, COD, greenie('pedro'))
    await marcarPuntitoConRespaldo(c, COD, greenie('juan'))
    await marcarPuntitoConRespaldo(c, COD, greenie('pedro'))
    expect(marcasPendientes(COD).map(m => m.jugadorId)).toEqual(['pedro'])
    red = 'ok'
    const antes = llamadas.length
    await reenviarPuntitosPendientes(c, COD)
    expect(llamadas.slice(antes).map(l => [l.args.p_jugador_id, l.args.p_marcar])).toEqual([['pedro', true]])
  })

  it('marcar y quitar sin señal: lo que se reenvía es el quitar', async () => {
    let red: 'ok' | 'sin_red' = 'sin_red'
    const { c, llamadas } = cliente(() => red)
    await marcarPuntitoConRespaldo(c, COD, greenie('pedro'))
    await marcarPuntitoConRespaldo(c, COD, greenie('pedro', false))
    red = 'ok'
    const antes = llamadas.length
    await reenviarPuntitosPendientes(c, COD)
    expect(llamadas.slice(antes).map(l => l.args.p_marcar)).toEqual([false])
  })

  it('los pendientes se reenvían en el orden en que se marcaron', async () => {
    let red: 'ok' | 'sin_red' = 'sin_red'
    const { c, llamadas } = cliente(() => red)
    await marcarPuntitoConRespaldo(c, COD, { jugadorId: 'juan', puntitoId: 'sandy', hoyo: 7, marcar: true, esGreenie: false })
    await marcarPuntitoConRespaldo(c, COD, { jugadorId: 'diego', puntitoId: 'sandy', hoyo: 2, marcar: true, esGreenie: false })
    await marcarPuntitoConRespaldo(c, COD, { jugadorId: 'juan', puntitoId: 'sandy', hoyo: 1, marcar: true, esGreenie: false })
    red = 'ok'
    const antes = llamadas.length
    await reenviarPuntitosPendientes(c, COD)
    expect(llamadas.slice(antes).map(l => [l.args.p_jugador_id, l.args.p_hoyo])).toEqual([['juan', 7], ['diego', 2], ['juan', 1]])
  })

  it('un rechazo del servidor no se reintenta para siempre: se descarta', async () => {
    const { c } = cliente(() => 'rechazo')
    const r = await marcarPuntitoConRespaldo(c, COD, greenie('pedro'))
    expect(r.error?.code).toBe('22023')
    expect(hayMarcasPendientes(COD)).toBe(false)
  })

  it('el reenvío se detiene en la primera sin respuesta y conserva el resto', async () => {
    let red: 'ok' | 'sin_red' = 'sin_red'
    const { c } = cliente(() => red)
    await marcarPuntitoConRespaldo(c, COD, { jugadorId: 'juan', puntitoId: 'sandy', hoyo: 1, marcar: true, esGreenie: false })
    await marcarPuntitoConRespaldo(c, COD, { jugadorId: 'juan', puntitoId: 'sandy', hoyo: 2, marcar: true, esGreenie: false })
    expect(await reenviarPuntitosPendientes(c, COD)).toEqual({ enviadas: 0, pendientes: 2 })
  })

  it('las marcas no se mezclan con los golpes pendientes, y limpiar la copia del grupo borra ambas', async () => {
    const { c } = cliente(() => 'sin_red')
    await marcarPuntitoConRespaldo(c, COD, greenie('pedro'))
    expect(hayPendientes(COD)).toBe(false)
    expect(hayMarcasPendientes(COD)).toBe(true)
    limpiarCopiaLocalDelGrupo(COD)
    expect(hayMarcasPendientes(COD)).toBe(false)
  })
})
