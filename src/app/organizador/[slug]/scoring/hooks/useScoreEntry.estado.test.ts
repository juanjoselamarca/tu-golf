// useScoreEntry sobre `estado-hoyos`: la pantalla deriva de la vista de la ronda abierta, cada envío va a la
// ronda donde se anotó y el deshacer es una edición más del hoyo. Reemplaza a los tests de deshacer y de carga
// del cliente anterior (#834), que dependían de refs espejo de la tarjeta, marcas de error aparte y la relectura.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'

// El store escucha la sesión una sola vez por página: se captura el callback.
type Sesion = { user: { id: string } } | null
let alCambiarSesion: ((evento: string, sesion: Sesion) => void) | null = null
const sesion = (evento: string, uid: string | null) => act(() => alCambiarSesion?.(evento, uid ? { user: { id: uid } } : null))
let nSesion = 0
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: (evento: string, sesion: Sesion) => void) => {
        alCambiarSesion = cb
        return { data: { subscription: { unsubscribe() {} } } }
      },
    },
  }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const lecturas: Record<string, unknown[]> = {}
const fetchRoundHoleScores = vi.fn(async (_c: unknown, roundId: string) => lecturas[roundId] ?? [])
const fetchRoundTotals = vi.fn(async (_c: unknown, _roundId: string) => ({ total_gross: 11, total_net: 10, total_points: 5 }))
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: (c: unknown, r: string) => fetchRoundHoleScores(c, r),
  fetchRoundTotals: (c: unknown, r: string) => fetchRoundTotals(c, r),
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

function montar(conTorneo: ScoringTournament | null = TOURNAMENT) {
  // `rerender()` sin props conserva el torneo inicial; `rerender({ tournament })` lo cambia.
  return renderHook((p?: { tournament: ScoringTournament | null }) => useScoreEntry({
    tournament: p ? p.tournament : conTorneo, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
    getActiveRound, applyRoundTotals, reloadRoster,
  }), { initialProps: { tournament: conTorneo } })
}
const salir = () => {
  const e = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(e)
  return e.defaultPrevented
}
/** Espera real (los tests usan timers reales): deja pasar el primer reintento por red (1 s). */
const esperar = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
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
  fetchRoundTotals.mockClear()
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
// Lo que quedó sin responder en un test no debe contar en el aviso al salir del siguiente (el store es de módulo).
// Lo que quedó pendiente en un test no debe contar en el siguiente (el store es de módulo): entrar con dos usuarios
// distintos seguidos olvida todos los stores.
afterEach(() => {
  sesion('SIGNED_IN', `fin-a-${++nSesion}`)
  sesion('SIGNED_IN', `fin-b-${nSesion}`)
  vi.unstubAllGlobals()
})

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
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(7, '6'))
    await pedidos[0].responder(409, { code: 'round_closed' })
    expect(hook.result.current.vista[7]).toMatchObject({ estado: 'rechazado' })
    expect(salir()).toBe(true)
    await act(async () => { await hook.result.current.descartarRechazados('ra', [7]) })
    expect(hook.result.current.vista[7]).toMatchObject({ gross: null, estado: 'limpio' })
    expect(salir()).toBe(false)
    expect(pedidos).toHaveLength(1)
  })

  it('descarta sólo los hoyos del grupo y nunca un rechazo de sesión vencida', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(7, '6'))
    act(() => hook.result.current.saveScore(8, '5'))
    act(() => hook.result.current.saveScore(9, '4'))
    await pedidos[0].responder(409, { code: 'round_closed' })
    await pedidos[1].responder(401, {})
    await pedidos[2].responder(409, { code: 'round_closed' })
    expect(hook.result.current.vista[8]).toMatchObject({ estado: 'rechazado', motivo: 'sin_sesion' })
    // Mutación anotada: en descartar-rechazados.ts ignorar `holes` (toda la ronda) → el 9 queda limpio y falla.
    // Mutación anotada: quitar el filtro esRechazoPermanente → el 8 (sin_sesion) se descarta y falla.
    await act(async () => { await hook.result.current.descartarRechazados('ra', [7, 8]) })
    expect(hook.result.current.vista[7]).toMatchObject({ gross: null, estado: 'limpio' })
    expect(hook.result.current.vista[8]).toMatchObject({ gross: 5, estado: 'rechazado' })
    expect(hook.result.current.vista[9]).toMatchObject({ gross: 4, estado: 'rechazado' })
  })

  it('con un envío que quizá quedó escrito: sin lectura de la base no descarta y avisa; con lectura muestra la base', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(7, '6'))
    await pedidos[0].responder(503, {})
    await esperar(1_200)
    await pedidos[1].responder(409, { code: 'round_closed' })
    expect(hook.result.current.vista[7]).toMatchObject({ estado: 'rechazado' })
    fetchRoundHoleScores.mockRejectedValueOnce(new Error('red'))
    // Mutación anotada: en descartar-rechazados.ts no leer la base con quizaAplicado → queda limpio vacío y falla.
    await act(async () => { await hook.result.current.descartarRechazados('ra', [7]) })
    expect(hook.result.current.vista[7]).toMatchObject({ gross: 6, estado: 'rechazado' })
    expect(showWarning).toHaveBeenCalledWith('No pudimos confirmar qué quedó guardado', expect.any(String))
    lecturas.ra = [{ hole_number: 7, gross_score: 6, putts: null, fairway_hit: null, gir: null }]
    await act(async () => { await hook.result.current.descartarRechazados('ra', [7]) })
    expect(hook.result.current.vista[7]).toMatchObject({ gross: 6, estado: 'limpio' })
  })

  it('si sale otro envío del hoyo mientras se lee la base, ese hoyo no se descarta', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(7, '6'))
    await pedidos[0].responder(503, {})
    await esperar(1_200)
    await pedidos[1].responder(409, { code: 'round_closed' })
    let soltar: (v: unknown[]) => void = () => {}
    fetchRoundHoleScores.mockReturnValueOnce(new Promise((r) => { soltar = r }))
    let fin: Promise<void> = Promise.resolve()
    act(() => { fin = hook.result.current.descartarRechazados('ra', [7]) })
    // Reintentar mientras tanto: vuelve a salir y vuelve a ser rechazado (sigue "rechazado", con un envío más).
    act(() => hook.result.current.reintentarGuardado('ra'))
    await pedidos[2].responder(409, { code: 'round_closed' })
    // Mutación anotada: no comparar envíos al leer en descartar-rechazados.ts → queda limpio con la base vieja y falla.
    await act(async () => { soltar([]); await fin })
    expect(hook.result.current.vista[7]).toMatchObject({ gross: 6, estado: 'rechazado' })
  })

  it('desde el chip descarta los rechazos permanentes de otra tarjeta, no los de la abierta', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(7, '6'))
    await pedidos[0].responder(409, { code: 'round_closed' })
    await abrir(hook, 'pb')
    act(() => hook.result.current.saveScore(2, '5'))
    await pedidos[1].responder(409, { code: 'round_closed' })
    expect(hook.result.current.hayDescartablesEnOtras).toBe(true)
    expect(hook.result.current.descartablesEnOtras).toEqual([{ roundId: 'ra', holes: [7], nombre: expect.any(String) }])
    await act(async () => { await hook.result.current.descartarRechazosDeOtras() })
    expect(hook.result.current.pendientes).toEqual([expect.objectContaining({ roundId: 'rb', hole: 2 })])
    expect(hook.result.current.hayDescartablesEnOtras).toBe(false)
  })
})

describe('useScoreEntry · tarjeta antes del torneo', () => {
  it('con el torneo sin resolver no se lee la tarjeta; al resolverse se lee y se ve la base', async () => {
    lecturas.ra = [{ hole_number: 5, gross_score: 6, putts: null, fairway_hit: null, gir: null }]
    const hook = montar(null)
    await abrir(hook, 'pa')
    // Mutación anotada: pasar `roundId: rondaAbierta` sin el guard de hayTorneo → se lee aquí y falla.
    expect(fetchRoundHoleScores).not.toHaveBeenCalled()
    act(() => hook.result.current.saveScore(5, '4'))
    expect(pedidos).toHaveLength(0)
    hook.rerender({ tournament: TOURNAMENT })
    await tick()
    expect(fetchRoundHoleScores).toHaveBeenCalledWith(expect.anything(), 'ra')
    expect(hook.result.current.vista[5]).toMatchObject({ gross: 6, estado: 'limpio' })
  })
})

describe('useScoreEntry · totales con respuestas cruzadas', () => {
  it('si las respuestas llegan fuera de orden, los totales se leen de la base', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(1, '4'))
    act(() => hook.result.current.saveScore(2, '5'))
    await pedidos[1].responder(200, { success: true, totalGross: 5, totalNet: 5, totalPoints: 2 })
    await pedidos[0].responder(200, { success: true, totalGross: 9, totalNet: 9, totalPoints: 4 })
    await tick()
    // Mutación anotada: en alConfirmar ignorar el caso null → no se relee y falla.
    expect(fetchRoundTotals).toHaveBeenCalledWith(expect.anything(), 'ra')
    expect(applyRoundTotals).toHaveBeenCalledTimes(1)
    expect(applyRoundTotals).toHaveBeenCalledWith('pa', 'ra', { total_gross: 11, total_net: 10, total_points: 5 })
  })

  it('una relectura de totales que llega después de un guardado más nuevo no lo pisa', async () => {
    let soltar: (v: { total_gross: number; total_net: number; total_points: number }) => void = () => {}
    fetchRoundTotals.mockReturnValueOnce(new Promise((r) => { soltar = r }))
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(1, '4'))
    act(() => hook.result.current.saveScore(2, '5'))
    await pedidos[1].responder(200, { success: true, totalGross: 5, totalNet: 5, totalPoints: 2 })
    await pedidos[0].responder(200, { success: true, totalGross: 9, totalNet: 9, totalPoints: 4 })
    act(() => hook.result.current.saveScore(3, '3'))
    await pedidos[2].responder(200, { success: true, totalGross: 12, totalNet: 12, totalPoints: 6 })
    expect(applyRoundTotals).toHaveBeenLastCalledWith('pa', 'ra', { total_gross: 12, total_net: 12, total_points: 6 })
    // Mutación anotada: aplicar la relectura sin mirar el contador → la última llamada son los totales viejos y falla.
    await act(async () => { soltar({ total_gross: 9, total_net: 9, total_points: 4 }); await Promise.resolve() })
    await tick()
    expect(applyRoundTotals).toHaveBeenLastCalledWith('pa', 'ra', { total_gross: 12, total_net: 12, total_points: 6 })
  })
})

describe('useScoreEntry · salir con pendientes', () => {
  it('cerrar la pestaña con un hoyo sin guardar pregunta; ya guardado, no', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    expect(salir()).toBe(false)
    act(() => hook.result.current.saveScore(1, '4'))
    expect(salir()).toBe(true)
    await pedidos[0].responder(200)
    expect(salir()).toBe(false)
  })

  it('también avisa desde otra pantalla del organizador (scorer desmontado)', async () => {
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(1, '4'))
    // Mutación anotada: volver el beforeunload al efecto del hook (se quita al desmontar) → false y falla.
    hook.unmount()
    expect(salir()).toBe(true)
    await pedidos[0].responder(200)
    expect(salir()).toBe(false)
  })

  it('el aviso al salir se registra sólo mientras hay pendientes', async () => {
    const quitar = vi.spyOn(window, 'removeEventListener')
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(1, '4'))
    await pedidos[0].responder(200)
    // Mutación anotada: dejar el listener puesto siempre → nunca se saca y falla.
    expect(quitar).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    quitar.mockRestore()
  })
})

describe('useScoreEntry · sesión', () => {
  it('SIGNED_OUT (también un refresh rechazado) conserva los pendientes: el envío da 401 y queda visible', async () => {
    sesion('INITIAL_SESSION', 'u-ana')
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(1, '4'))
    // Mutación anotada: olvidar los stores con SIGNED_OUT → el hoyo desaparece de pendientes y falla.
    sesion('SIGNED_OUT', null)
    expect(hook.result.current.pendientes).toEqual([expect.objectContaining({ roundId: 'ra', hole: 1 })])
    expect(salir()).toBe(true)
    await pedidos[0].responder(401, {})
    expect(hook.result.current.vista[1]).toMatchObject({ gross: 4, estado: 'rechazado', motivo: 'sin_sesion' })
    await esperar(1_200)
    expect(pedidos).toHaveLength(1)
  })

  it('volver a entrar con el MISMO usuario conserva y reenvía lo rechazado por sesión', async () => {
    sesion('INITIAL_SESSION', 'u-ana')
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(1, '4'))
    await pedidos[0].responder(401, {})
    sesion('SIGNED_OUT', null)
    // Mutación anotada: no reintentar los sin_sesion al volver a entrar → no sale el segundo envío y falla.
    sesion('SIGNED_IN', 'u-ana')
    expect(pedidos).toHaveLength(2)
    expect(pedidos[1].body).toMatchObject({ round_id: 'ra', hole_number: 1, gross_score: 4 })
    await pedidos[1].responder(200)
    expect(hook.result.current.vista[1]).toMatchObject({ gross: 4, estado: 'limpio' })
  })

  it('entrar con OTRO usuario olvida lo pendiente y la grilla vuelve a cargando (no vacía y editable)', async () => {
    sesion('INITIAL_SESSION', 'u-ana')
    const hook = montar()
    await abrir(hook, 'pa')
    act(() => hook.result.current.saveScore(1, '4'))
    await pedidos[0].responder(401, {})
    fetchRoundHoleScores.mockReturnValueOnce(new Promise(() => {}))
    // Mutación anotada: no avisar a los suscriptores al olvidar → el hook sigue con el store viejo y falla.
    sesion('SIGNED_IN', 'u-beto')
    await tick()
    expect(hook.result.current.pendientes).toEqual([])
    expect(hook.result.current.cargaTarjeta).toBe('cargando')
    expect(hook.result.current.editable).toBe(false)
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
