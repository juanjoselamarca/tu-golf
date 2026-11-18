// useScoreEntry sobre `estado-hoyos`: la pantalla deriva de la vista de la ronda abierta, cada envío va a la
// ronda donde se anotó y el deshacer es una edición más del hoyo. Reemplaza a los tests de deshacer y de carga
// del cliente anterior (#834), que dependían de refs espejo de la tarjeta, marcas de error aparte y la relectura.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const lecturas: Record<string, unknown[]> = {}
const fetchRoundHoleScores = vi.fn(async (_c: unknown, roundId: string) => lecturas[roundId] ?? [])
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: (c: unknown, r: string) => fetchRoundHoleScores(c, r),
}))
const showError = vi.fn()
const showWarning = vi.fn()
const showSuccess = vi.fn()
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showError, showSuccess, showWarning }) }))

const ronda = (id: string, n = 1) => ({ id, status: 'in_progress', total_gross: 0, total_net: 0, total_points: 0, round_number: n }) as ScoringRound
const RA = ronda('ra')
const RB = ronda('rb')
const RA2 = ronda('ra2', 2)
// El store vive a nivel de módulo, uno por torneo: cada test usa un torneo propio para partir de cero, y lo que
// envíe tarde un store de un test anterior (otro torneo) no cae en la lista de este.
let TOURNAMENT = { id: 't0' } as ScoringTournament
let nTorneo = 0
const RC = { ...ronda('rc'), status: 'closed' } as ScoringRound
const PLAYERS = [{ id: 'pa', rounds: [RA, RA2] }, { id: 'pb', rounds: [RB] }, { id: 'pc', rounds: [RC] }] as unknown as ScoringPlayer[]
const VACIO: never[] = []
let rondaN = 1
const getActiveRound = (p: ScoringPlayer | undefined) => p?.rounds?.find((r) => r.round_number === rondaN)
const applyRoundTotals = vi.fn()
const reloadRoster = vi.fn(async () => {})

interface Pedido { body: Record<string, unknown>; responder: (status: number, cuerpo?: object) => Promise<void> }
let pedidos: Pedido[] = []

function montar() {
  return renderHook(() => useScoreEntry({
    tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
    getActiveRound, applyRoundTotals, reloadRoster,
  }))
}
const OK = { success: true, totalGross: 4, totalNet: 4, totalPoints: 2 }
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

async function abrir(hook: ReturnType<typeof montar>, id: string) {
  await act(async () => hook.result.current.selectPlayer(id))
  await tick()
}

beforeEach(() => {
  TOURNAMENT = { id: `t${++nTorneo}` } as ScoringTournament
  const torneo = TOURNAMENT.id
  rondaN = 1
  const mios: Pedido[] = []
  pedidos = mios
  for (const k of Object.keys(lecturas)) delete lecturas[k]
  fetchRoundHoleScores.mockClear()
  applyRoundTotals.mockClear()
  showWarning.mockClear()
  reloadRoster.mockReset()
  reloadRoster.mockImplementation(async () => {})
  vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise<Response>((res) => {
    const body = JSON.parse(String(init.body))
    if (body.tournament_id !== torneo) return
    mios.push({
      body,
      responder: async (status, cuerpo = OK) => {
        res(new Response(JSON.stringify(cuerpo), { status }))
        await tick()
      },
    })
  })))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useScoreEntry · vista por ronda', () => {
  it('14. la respuesta de A con B abierto no cambia la vista de B y los totales van a A', async () => {
    lecturas.rb = [{ hole_number: 3, gross_score: 6, putts: null, fairway_hit: null, gir: null }]
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(3, '4'))
    await abrir(hook, 'pb')
    const antes = hook.result.current.vista
    await pedidos[0].responder(200)
    expect(hook.result.current.vista).toBe(antes)
    expect(hook.result.current.currentScores[3]).toBe(6)
    expect(applyRoundTotals).toHaveBeenCalledWith('pa', 'ra', { total_gross: 4, total_net: 4, total_points: 2 })
    lecturas.ra = [{ hole_number: 3, gross_score: 4, putts: null, fairway_hit: null, gir: null }]
    await abrir(hook, 'pa')
    expect(hook.result.current.vista[3]).toMatchObject({ gross: 4, estado: 'limpio' })
  })

  it('17. deshacer el golpe de la R1 con la R2 activa escribe en la R1', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(18, '5'))
    await pedidos[0].responder(200)
    rondaN = 2
    hook.rerender()
    await tick()
    act(() => hook.result.current.undoLast())
    expect(pedidos[1].body).toMatchObject({ round_id: 'ra', hole_number: 18, gross_score: null })
  })

  it('18. salir del campo sin cambiar el valor no envía nada', async () => {
    lecturas.ra = [{ hole_number: 2, gross_score: 5, putts: 2, fairway_hit: null, gir: null }]
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(2, '5'))
    act(() => { hook.result.current.editarStat(2, { putts: 2 }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 700)) })
    expect(pedidos).toHaveLength(0)
    expect(hook.result.current.lastAction).toBeNull()
  })

  it('una stat que espera los 600 ms sale al tiro, a la ronda de A, al abrir a B', async () => {
    lecturas.ra = [{ hole_number: 2, gross_score: 5, putts: null, fairway_hit: null, gir: null }]
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => { hook.result.current.editarStat(2, { putts: 2 }) })
    expect(pedidos).toHaveLength(0)
    await abrir(hook, 'pb')
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].body).toMatchObject({ round_id: 'ra', hole_number: 2, gross_score: 5, putts: 2 })
  })

  it('al ocultarse la pestaña, la stat que esperaba los 600 ms sale ya', async () => {
    lecturas.ra = [{ hole_number: 2, gross_score: 5, putts: null, fairway_hit: null, gir: null }]
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => { hook.result.current.editarStat(2, { gir: true }) })
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    vis.mockRestore()
    await tick()
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].body).toMatchObject({ round_id: 'ra', hole_number: 2, gir: true })
  })

  it('con la tarjeta cargando no se anota (el deshacer no conoce lo que había)', async () => {
    fetchRoundHoleScores.mockImplementationOnce(() => new Promise(() => {}))
    const hook = montar()
    await abrir(hook, 'pa')
    expect(hook.result.current.cargaTarjeta).toBe('cargando')
    act(() => hook.result.current.saveScore(1, '4'))
    expect(pedidos).toHaveLength(0)
  })

  it('volver a tocar al jugador abierto no vuelve a leer ni borra la tarjeta', async () => {
    lecturas.ra = [{ hole_number: 1, gross_score: 4, putts: null, fairway_hit: null, gir: null }]
    const hook = montar()
    await abrir(hook, 'pa')
    await abrir(hook, 'pa')
    expect(fetchRoundHoleScores).toHaveBeenCalledTimes(1)
    expect(hook.result.current.currentScores[1]).toBe(4)
  })

  it('un guardado pendiente de A no marca el hoyo de B', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(5, '4'))
    await pedidos[0].responder(503)
    await abrir(hook, 'pb')
    expect(hook.result.current.vista[5]).toBeUndefined()
    expect(hook.result.current.pendientes).toEqual([{ roundId: 'ra', hole: 5, estado: 'guardando' }])
  })
})

describe('useScoreEntry · cierre', () => {
  it('15. cerrar A y abrir B: finalize_round lleva la ronda de A y B sigue abierta', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    let fin!: Promise<void> | undefined
    act(() => { fin = hook.result.current.finalizeRound() })
    await tick()
    await abrir(hook, 'pb')
    expect(hook.result.current.cierre).toMatchObject({ roundId: 'ra', fase: 'cerrando' })
    await pedidos[0].responder(200, {})
    await act(async () => { await fin })
    expect(pedidos[0].body).toMatchObject({ action: 'finalize_round', round_id: 'ra' })
    expect(hook.result.current.selectedId).toBe('pb')
    expect(reloadRoster).toHaveBeenCalled()
  })

  it('una relectura del listado que no responde no deja el cierre tomado', async () => {
    reloadRoster.mockImplementation(() => new Promise<void>(() => {}))
    const hook = montar()
    await abrir(hook, 'pa')
    let fin!: Promise<void> | undefined
    act(() => { fin = hook.result.current.finalizeRound() })
    await tick()
    await pedidos[0].responder(200, {})
    let termino: unknown
    await act(async () => { termino = await Promise.race([fin!.then(() => 'listo'), new Promise((r) => setTimeout(() => r('colgado'), 1_000))]) })
    expect(termino).toBe('listo')
    expect(hook.result.current.cierre).toBeNull()
    expect(hook.result.current.selectedId).toBeNull()
  })
})

describe('useScoreEntry · un store por torneo', () => {
  it('salir de la pantalla y volver: el pendiente se sigue viendo y el store viejo no reenvía un valor viejo', async () => {
    const primera = montar()
    await abrir(primera, 'pa')
    act(() => primera.result.current.saveScore(3, '4'))
    await pedidos[0].responder(500)
    primera.unmount()
    const segunda = montar()
    await abrir(segunda, 'pa')
    expect(segunda.result.current.vista[3]).toMatchObject({ gross: 4, estado: 'guardando' })
    act(() => segunda.result.current.saveScore(3, '5'))
    await act(async () => { await new Promise((r) => setTimeout(r, 1_300)) })
    // Un solo envío más, con el valor nuevo; nada de un reintento del 4 con una secuencia más nueva.
    expect(pedidos.slice(1).map((p) => p.body.gross_score)).toEqual([5])
    await pedidos[1].responder(200)
    await act(async () => { await new Promise((r) => setTimeout(r, 1_300)) })
    expect(pedidos).toHaveLength(2)
    expect(segunda.result.current.vista[3]).toMatchObject({ gross: 5, estado: 'limpio' })
  })

  it('una tarjeta cerrada en la base (roundClosed) no se edita: el sello no depende del store', async () => {
    const hook = montar()
    await abrir(hook, 'pc')
    act(() => hook.result.current.saveScore(1, '4'))
    act(() => { hook.result.current.editarStat(1, { putts: 2 }) })
    await tick()
    expect(pedidos).toHaveLength(0)
  })
})

describe('useScoreEntry · descartar', () => {
  it('descartar un hoyo rechazado (tarjeta cerrada) lo saca de pendientes y del aviso al salir', async () => {
    const salir = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(7, '6'))
    await pedidos[0].responder(409, { code: 'round_closed' })
    expect(hook.result.current.vista[7]).toMatchObject({ estado: 'rechazado' })
    expect(salir()).toBe(true)
    act(() => hook.result.current.descartarRechazados('ra'))
    expect(hook.result.current.vista[7]).toMatchObject({ gross: null, estado: 'limpio' })
    expect(salir()).toBe(false)
    expect(pedidos).toHaveLength(1)
  })
})

describe('useScoreEntry · salir con pendientes', () => {
  it('cerrar la pestaña con un hoyo sin guardar pregunta; ya guardado, no', async () => {
    const salir = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    const hook = montar()
    await abrir(hook, 'pa')
    expect(salir()).toBe(false)
    act(() => hook.result.current.saveScore(1, '4'))
    expect(salir()).toBe(true)
    await pedidos[0].responder(200)
    expect(salir()).toBe(false)
  })
})

describe('useScoreEntry · deshacer', () => {
  it('deshacer un hoyo que estaba vacío borra el golpe en el servidor (gross_score null)', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(7, '4'))
    await pedidos[0].responder(200)
    act(() => hook.result.current.undoLast())
    expect(pedidos[1].body).toMatchObject({ round_id: 'ra', hole_number: 7, gross_score: null })
    await pedidos[1].responder(200)
    expect(hook.result.current.vista[7]).toMatchObject({ gross: null, estado: 'limpio' })
    expect(hook.result.current.lastAction).toBeNull()
  })

  it('deshacer con el guardado en vuelo sale detrás y la base termina en el previo', async () => {
    lecturas.ra = [{ hole_number: 4, gross_score: 5, putts: null, fairway_hit: null, gir: null }]
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(4, '6'))
    act(() => hook.result.current.undoLast())
    expect(pedidos).toHaveLength(1)
    await pedidos[0].responder(200)
    expect(pedidos[1].body).toMatchObject({ gross_score: 5 })
  })

  it('un golpe rechazado (403) se deshace sólo en pantalla: no manda nada', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(9, '4'))
    await pedidos[0].responder(403, {})
    expect(hook.result.current.vista[9].estado).toBe('rechazado')
    act(() => hook.result.current.undoLast())
    expect(pedidos).toHaveLength(1)
    expect(hook.result.current.vista[9]).toMatchObject({ gross: null, estado: 'limpio' })
  })

  it('si el hoyo cambió después (otro dispositivo, al releer), deshacer no lo pisa', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(6, '4'))
    await pedidos[0].responder(200)
    lecturas.ra = [{ hole_number: 6, gross_score: 8, putts: null, fairway_hit: null, gir: null }]
    await act(async () => { await hook.result.current.reintentarCarga() })
    expect(hook.result.current.vista[6].gross).toBe(8)
    act(() => hook.result.current.undoLast())
    expect(pedidos).toHaveLength(1)
    expect(showWarning).toHaveBeenCalledWith('No se deshizo', 'El hoyo 6 cambió después.')
  })

  it('cerrar la tarjeta descarta el deshacer pendiente', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(1, '4'))
    act(() => hook.result.current.clearSelection())
    expect(hook.result.current.lastAction).toBeNull()
  })
})
