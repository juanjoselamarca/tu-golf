// useScoreEntry sobre `estado-hoyos`: la pantalla deriva de la vista de la ronda abierta, cada envío va a la
// ronda donde se anotó y el deshacer es una edición más del hoyo. Reemplaza a los tests de deshacer y de carga
// del cliente anterior (#834), que dependían de `tarjetaRef`, `errorHoles` y la relectura.

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
const TOURNAMENT = { id: 't1' } as ScoringTournament
const PLAYERS = [{ id: 'pa', rounds: [RA, RA2] }, { id: 'pb', rounds: [RB] }] as unknown as ScoringPlayer[]
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
  rondaN = 1
  pedidos = []
  for (const k of Object.keys(lecturas)) delete lecturas[k]
  fetchRoundHoleScores.mockClear()
  applyRoundTotals.mockClear()
  showWarning.mockClear()
  vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise<Response>((res) => {
    pedidos.push({
      body: JSON.parse(String(init.body)),
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
