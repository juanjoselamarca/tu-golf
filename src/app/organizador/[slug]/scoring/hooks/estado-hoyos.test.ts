import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearEstadoHoyos, type RespuestaSobre, type Sobre } from './estado-hoyos'

const R = 'ronda-a'
const PAR = { par: 4 }
const STAT = { par: 4, esperaMs: 600 }
const OK: RespuestaSobre = { lectura: 'ok', totales: { totalGross: 9, totalNet: 8, totalPoints: 3 } }
const CORTE: RespuestaSobre = { lectura: 'sin_respuesta' }
const PROHIBIDO: RespuestaSobre = { lectura: { rechazo: 'sin_permiso' } }

function montar(auto?: RespuestaSobre) {
  const envios: Array<{ sobre: Sobre; responder: (r: RespuestaSobre) => Promise<void> }> = []
  const confirmados: Array<{ roundId: string; totales: unknown }> = []
  const s = crearEstadoHoyos({
    enviar: (sobre) => new Promise<RespuestaSobre>((res) => {
      if (auto) return res(auto)
      envios.push({ sobre, responder: async (r) => { res(r); await vi.advanceTimersByTimeAsync(0) } })
    }),
    alConfirmar: (roundId, totales) => confirmados.push({ roundId, totales }),
  })
  return { s, envios, confirmados }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('estado-hoyos: un documento por hoyo, reenvío del vigente', () => {
  it('1. corte y reintento OK → limpio, sin leer la base', async () => {
    const { s, envios } = montar()
    s.editar(R, 3, { gross: 4 }, PAR)
    await envios[0].responder(CORTE)
    expect(s.vista(R)[3].estado).toBe('guardando')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(envios).toHaveLength(2)
    expect(envios[1].sobre.gross).toBe(4)
    expect(envios[1].sobre.seq).toBeGreaterThan(envios[0].sobre.seq)
    await envios[1].responder(OK)
    expect(s.vista(R)[3]).toMatchObject({ gross: 4, estado: 'limpio', quizaAplicado: false })
  })

  it('2. tres cortes → sin_confirmar; Reintentar + OK → limpio', async () => {
    const { s, envios } = montar()
    s.editar(R, 5, { gross: 6 }, PAR)
    await envios[0].responder(CORTE)
    await vi.advanceTimersByTimeAsync(1_000)
    await envios[1].responder(CORTE)
    await vi.advanceTimersByTimeAsync(2_000)
    await envios[2].responder(CORTE)
    expect(s.vista(R)[5].estado).toBe('sin_confirmar')
    s.reintentar({ limpiarRechazo: true })
    expect(envios).toHaveLength(4)
    await envios[3].responder(OK)
    expect(s.vista(R)[5].estado).toBe('limpio')
  })

  it('3. un 403 del rev 1 que llega después de editar el rev 2 no deja el hoyo rechazado', async () => {
    const { s, envios } = montar()
    s.editar(R, 7, { gross: 7 }, PAR)
    s.editar(R, 7, { gross: 5 }, PAR)
    expect(envios).toHaveLength(1)
    await envios[0].responder(PROHIBIDO)
    expect(envios).toHaveLength(2)
    expect(envios[1].sobre.gross).toBe(5)
    await envios[1].responder(OK)
    expect(s.vista(R)[7].estado).toBe('limpio')
    expect(s.sinGuardar(R)).toEqual([])
  })

  it('4. un 500 del hoyo 18 en vuelo → sinGuardar lo incluye en el mismo tick', async () => {
    const { s, envios } = montar()
    s.editar(R, 18, { gross: 4 }, PAR)
    expect(s.sinGuardar(R)).toEqual([18])
    await envios[0].responder(CORTE)
    expect(s.sinGuardar(R)).toEqual([18])
  })

  it('5. asentar no resuelve limpio con un reintento agendado; resuelve pendiente a los 20 s', async () => {
    const { s } = montar(CORTE)
    s.editar(R, 2, { gross: 3 }, PAR)
    await vi.advanceTimersByTimeAsync(0)
    let r: string | null = null
    void s.asentar(R, 20_000).then((x) => { r = x })
    await vi.advanceTimersByTimeAsync(19_999)
    expect(r).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(r).toBe('pendiente')
  })

  it('6. un sobre con stat que se corta: el reintento lleva la stat y la confirmación trae totales', async () => {
    const { s, envios, confirmados } = montar()
    s.editar(R, 1, { gross: 4 }, PAR)
    await envios[0].responder(OK)
    s.editar(R, 1, { putts: 2 }, STAT)
    await vi.advanceTimersByTimeAsync(600)
    expect(envios[1].sobre).toMatchObject({ gross: 4, stats: { putts: 2 } })
    await envios[1].responder(CORTE)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(envios[2].sobre).toMatchObject({ gross: 4, stats: { putts: 2 } })
    await envios[2].responder(OK)
    expect(confirmados.at(-1)).toEqual({ roundId: R, totales: OK.totales })
    expect(s.vista(R)[1]).toMatchObject({ putts: 2, estado: 'limpio' })
  })

  it('7. dos sobres del mismo hoyo nunca en vuelo a la vez; la secuencia crece', async () => {
    const { s, envios } = montar()
    s.editar(R, 9, { gross: 4 }, PAR)
    s.editar(R, 9, { gross: 5 }, PAR)
    s.editar(R, 9, { gross: 6 }, PAR)
    expect(envios).toHaveLength(1)
    await envios[0].responder(OK)
    expect(envios).toHaveLength(2)
    expect(envios[1].sobre).toMatchObject({ gross: 6 })
    expect(envios[1].sobre.seq).toBeGreaterThan(envios[0].sobre.seq)
  })

  it('8. GIR y putts en el mismo tick → un solo sobre con los dos', async () => {
    const { s, envios } = montar()
    s.editar(R, 4, { gross: 4 }, PAR)
    await envios[0].responder(OK)
    s.editar(R, 4, { gir: true }, STAT)
    s.editar(R, 4, { putts: 2 }, STAT)
    await vi.advanceTimersByTimeAsync(600)
    expect(envios).toHaveLength(2)
    expect(envios[1].sobre.stats).toEqual({ gir: true, putts: 2 })
  })

  it('9. stat A→B→A durante el vuelo queda pendiente y se reenvía', async () => {
    const { s, envios } = montar()
    s.editar(R, 6, { gross: 5 }, PAR)
    await envios[0].responder(OK)
    s.editar(R, 6, { putts: 2 }, STAT)
    await vi.advanceTimersByTimeAsync(600)
    s.editar(R, 6, { putts: 3 }, STAT)
    s.editar(R, 6, { putts: 2 }, STAT)
    await envios[1].responder(OK)
    expect(s.vista(R)[6].estado).not.toBe('limpio')
    await vi.advanceTimersByTimeAsync(600)
    expect(envios[2].sobre.stats).toEqual({ putts: 2 })
    await envios[2].responder(OK)
    expect(s.vista(R)[6].estado).toBe('limpio')
  })

  it('10. golpe rechazado → ningún sobre lo vuelve a llevar sin una edición nueva', async () => {
    const { s, envios } = montar()
    s.editar(R, 8, { gross: 7 }, PAR)
    await envios[0].responder(PROHIBIDO)
    expect(s.vista(R)[8]).toMatchObject({ estado: 'rechazado', motivo: 'sin_permiso' })
    await vi.advanceTimersByTimeAsync(60_000)
    s.reintentar() // vuelve la señal / la pestaña: no reenvía un rechazo
    expect(s.editar(R, 8, { gir: true }, STAT)).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(envios).toHaveLength(1)
    s.editar(R, 8, { gross: 7 }, PAR) // reanotar el mismo golpe: el organizador lo pide
    expect(envios).toHaveLength(2)
  })

  it('11. sembrar con marca vieja no pisa un hoyo confirmado después ni uno en vuelo', async () => {
    const { s, envios } = montar()
    const vieja = s.marca()
    s.editar(R, 1, { gross: 5 }, PAR)
    await envios[0].responder(OK)
    s.editar(R, 2, { gross: 6 }, PAR)
    s.sembrar(R, [{ hole_number: 1, gross_score: 4 }, { hole_number: 2, gross_score: 3 }], vieja, () => 4)
    expect(s.vista(R)[1].gross).toBe(5)
    expect(s.vista(R)[2].gross).toBe(6)
    const m1 = s.marca()
    const m2 = s.marca()
    s.sembrar(R, [{ hole_number: 3, gross_score: 4 }], m2, () => 4)
    s.sembrar(R, [{ hole_number: 3, gross_score: 9 }], m1, () => 4)
    expect(s.vista(R)[3].gross).toBe(4)
  })

  it('12. deshacer en vuelo → la base termina en el valor previo', async () => {
    const { s, envios } = montar()
    s.editar(R, 10, { gross: 7 }, PAR)
    s.editar(R, 10, { gross: null }, PAR)
    await envios[0].responder(OK)
    expect(envios[1].sobre.gross).toBeNull()
    await envios[1].responder(OK)
    expect(s.vista(R)[10]).toMatchObject({ gross: null, estado: 'limpio' })
  })

  it('13. revertirLocal tras un 403 no envía; tras un corte no se permite (hay que enviar)', async () => {
    const { s, envios } = montar()
    s.editar(R, 11, { gross: 7 }, PAR)
    await envios[0].responder(PROHIBIDO)
    expect(s.revertirLocal(R, 11)).toBe(true)
    expect(s.vista(R)[11]).toMatchObject({ gross: null, estado: 'limpio' })
    expect(envios).toHaveLength(1)

    s.editar(R, 12, { gross: 7 }, PAR)
    await envios[1].responder(CORTE)
    await vi.advanceTimersByTimeAsync(1_000)
    await envios[2].responder(PROHIBIDO)
    expect(s.vista(R)[12]).toMatchObject({ estado: 'rechazado', quizaAplicado: true })
    expect(s.revertirLocal(R, 12)).toBe(false)
    s.editar(R, 12, { gross: null }, PAR)
    expect(envios[3].sobre.gross).toBeNull()
  })
})
