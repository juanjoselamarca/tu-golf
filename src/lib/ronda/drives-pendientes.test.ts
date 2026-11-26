import { describe, it, expect, beforeEach } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import { drivesPendientes, hayDrivesPendientes, marcarDriveConRespaldo, reenviarDrivesPendientes, SIN_DRIVE } from './drives-pendientes'
import { hayPendientes, limpiarCopiaLocalDeRonda, marcarPendientes } from './score-storage'
import { ERRCODE_SIN_RESPUESTA, type RondaLibreWriteClient } from '@/lib/data/ronda-libre-scores'

const COD = 'DRV123'
type Llamada = { fn: string; args: Record<string, unknown> }
type Modo = 'ok' | 'sin_red' | 'sin_senal' | 'finalizada' | 'prohibido' | 'invalido'
const ERRORES: Record<Exclude<Modo, 'ok'>, string> = {
  sin_red: ERRCODE_SIN_RESPUESTA,
  sin_senal: '',
  finalizada: 'P0002',
  prohibido: 'P0003',
  invalido: 'P0004',
}

/** Cliente simulado con una "base" en memoria: aplica cada drive como la RPC y devuelve los drives del equipo. */
function cliente(modo: () => Modo, demora?: (n: number) => number) {
  const llamadas: Llamada[] = []
  const servidor: Record<string, Record<string, number>> = {}
  const c: RondaLibreWriteClient = {
    rpc: (fn, args) => {
      const n = llamadas.length
      llamadas.push({ fn, args })
      const m = modo()
      const responder = () => {
        if (m !== 'ok') return { data: null, error: { code: ERRORES[m], message: m } as PostgrestError }
        const eq = (servidor[args.p_equipo_id as string] ??= {})
        if (args.p_jugador == null) delete eq[String(args.p_hoyo)]
        else eq[String(args.p_hoyo)] = args.p_jugador as number
        return { data: { ...eq }, error: null }
      }
      const ms = demora?.(n) ?? 0
      return ms > 0 ? new Promise(r => setTimeout(() => r(responder()), ms)) : Promise.resolve(responder())
    },
  }
  return { c, llamadas, servidor }
}

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

beforeEach(() => localStorage.clear())

describe('drives del scramble con respaldo offline', () => {
  it('con señal: llama a marcar_drive_equipo, no queda pendiente y devuelve los drives del servidor', async () => {
    const { c, llamadas } = cliente(() => 'ok')
    const r = await marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 3, jugador: 2 })
    expect(llamadas).toEqual([{ fn: 'marcar_drive_equipo', args: { p_equipo_id: 'e1', p_codigo: COD, p_hoyo: 3, p_jugador: 2 } }])
    expect(r.confirmados).toEqual([{ equipoId: 'e1', hoyo: 3, valor: 2, drives: { '3': 2 } }])
    expect(hayDrivesPendientes(COD)).toBe(false)
  })

  it('desmarcar manda p_jugador null', async () => {
    const { c, llamadas } = cliente(() => 'ok')
    await marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 3, jugador: 1 })
    await marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 3, jugador: null })
    expect(llamadas[1].args.p_jugador).toBeNull()
    expect(hayDrivesPendientes(COD)).toBe(false)
  })

  it('sin señal (los dos tipos de error de red): queda pendiente y sube al volver la señal', async () => {
    for (const sinRed of ['sin_red', 'sin_senal'] as const) {
      localStorage.clear()
      let red: Modo = sinRed
      const { c, servidor } = cliente(() => red)
      const r = await marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 5, jugador: 0 })
      expect(r.pendientes).toBe(1)
      expect(drivesPendientes(COD)).toEqual([{ equipoId: 'e1', hoyo: 5, valor: 0 }])
      red = 'ok'
      expect(await reenviarDrivesPendientes(c, COD)).toMatchObject({ pendientes: 0, rechazados: [] })
      expect(servidor.e1).toEqual({ '5': 0 })
    }
  })

  it('desmarcado sin señal queda como SIN_DRIVE y al volver borra el drive en el servidor', async () => {
    let red: Modo = 'ok'
    const { c, servidor } = cliente(() => red)
    await marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 5, jugador: 3 })
    red = 'sin_red'
    await marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 5, jugador: null })
    expect(drivesPendientes(COD)).toEqual([{ equipoId: 'e1', hoyo: 5, valor: SIN_DRIVE }])
    red = 'ok'
    await reenviarDrivesPendientes(c, COD)
    expect(servidor.e1).toEqual({})
  })

  it('en serie: dos toques seguidos en el mismo hoyo terminan con el último, aunque el primero tarde más', async () => {
    // El primer envío tarda 30 ms y el segundo 0: en paralelo el viejo llegaría al final y pisaría al nuevo.
    const { c, servidor, llamadas } = cliente(() => 'ok', n => (n === 0 ? 30 : 0))
    const a = marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 7, jugador: 0 })
    await esperar(5) // el primero ya salió
    const b = marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 7, jugador: 1 })
    await Promise.all([a, b])
    expect(servidor.e1).toEqual({ '7': 1 })
    expect(llamadas.map(l => l.args.p_jugador)).toEqual([0, 1])
    expect(hayDrivesPendientes(COD)).toBe(false)
  })

  it('un toque que cambió el valor mientras viajaba el anterior sigue pendiente hasta mandarse', async () => {
    const { c, servidor } = cliente(() => 'ok', n => (n === 0 ? 20 : 0))
    const a = marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 2, jugador: 0 })
    await esperar(5)
    const b = marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 2, jugador: 2 })
    const ra = await a
    // Al confirmar el 0, la cola tenía el 2: no se borra por el 0.
    expect(ra.confirmados.map(x => x.valor)).toEqual([0])
    await b
    expect(servidor.e1).toEqual({ '2': 2 })
    expect(hayDrivesPendientes(COD)).toBe(false)
  })

  it('dos toques antes de que salga el primero: se manda una sola vez, el último', async () => {
    const { c, llamadas, servidor } = cliente(() => 'ok')
    await Promise.all([
      marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 4, jugador: 0 }),
      marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 4, jugador: 3 }),
    ])
    expect(llamadas.map(l => l.args.p_jugador)).toEqual([3])
    expect(servidor.e1).toEqual({ '4': 3 })
  })

  it('rechazo definitivo (P0003 / P0004): sale de la cola y se informa', async () => {
    for (const modo of ['prohibido', 'invalido'] as const) {
      localStorage.clear()
      const { c } = cliente(() => modo)
      const r = await marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 1, jugador: 0 })
      expect(r.rechazados).toEqual([{ drive: { equipoId: 'e1', hoyo: 1, valor: 0 }, code: modo === 'prohibido' ? 'P0003' : 'P0004' }])
      expect(hayDrivesPendientes(COD)).toBe(false)
    }
  })

  it('ronda cerrada (P0002): queda pendiente (la ronda se puede reabrir)', async () => {
    const { c } = cliente(() => 'finalizada')
    const r = await marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 1, jugador: 0 })
    expect(r.pendientes).toBe(1)
  })

  it('cola propia: no se mezcla con los golpes y se borra con la copia local de la ronda', async () => {
    const { c } = cliente(() => 'sin_red')
    await marcarDriveConRespaldo(c, COD, { equipoId: 'e1', hoyo: 1, jugador: 0 })
    expect(hayPendientes(COD)).toBe(false)
    marcarPendientes(COD, 'jugador', { 1: 4 })
    expect(drivesPendientes(COD)).toEqual([{ equipoId: 'e1', hoyo: 1, valor: 0 }])
    limpiarCopiaLocalDeRonda(COD)
    expect(hayDrivesPendientes(COD)).toBe(false)
  })
})
