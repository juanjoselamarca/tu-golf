// Stats del hoyo (putts / fairway / GIR) y carga de la tarjeta en el scorer del organizador.
// Revisión Fable de #832 (P2) y de #834 (vuelta 1):
//  1. Al pasar de A a B, la foto de stats seguía siendo la de A hasta que terminaba la carga de B. Y una carga de A
//     que llegaba tarde pintaba sus stats en la tarjeta de B.
//  2. Una stat no se podía borrar: el null se descartaba. Y mandar null "por defecto" borraría datos buenos, así
//     que la foto omite lo que el organizador no tocó; lo confirmado por el servidor deja de viajar.
//  3. Con la carga fallida la tarjeta quedaba vacía y editable: anotar y deshacer mandaba `gross_score: null` y
//     borraba el golpe real. Ahora no se anota hasta que la tarjeta cargue, con "Reintentar".

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { HoleScoreRow, ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const fetchRoundHoleScores = vi.fn<(roundId: string) => Promise<Partial<HoleScoreRow>[]>>(async () => [])
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: (_c: unknown, roundId: string) => fetchRoundHoleScores(roundId),
  fetchRoundTotals: async () => ({ total_gross: 0, total_net: 0, total_points: 0 }),
}))
const toast = { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn() }
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

const RONDA_A = { id: 'rA', status: 'in_progress', round_number: 1 } as ScoringRound
const RONDA_B = { id: 'rB', status: 'in_progress', round_number: 1 } as ScoringRound
const TOURNAMENT = { id: 't1' } as ScoringTournament
const PLAYERS = [{ id: 'pA' }, { id: 'pB' }] as ScoringPlayer[]
const VACIO: never[] = []
const getActiveRound = (p: ScoringPlayer | undefined) => (p?.id === 'pA' ? RONDA_A : p?.id === 'pB' ? RONDA_B : undefined)
const STATS_A = [{ hole_number: 1, gross_score: 4, putts: 2, fairway_hit: true, gir: true }]
const GOLPE_B = [{ hole_number: 1, gross_score: 6, putts: null, fairway_hit: null, gir: null }]

function montar() {
  return renderHook(() =>
    useScoreEntry({
      tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
      getActiveRound, applyRoundTotals: vi.fn(), reloadRoster: vi.fn(async () => {}),
    }),
  )
}

type Respuesta = number | 'sin-senal' | 'descartado'
/** `fetch` que responde lo indicado, en orden (la última se repite), y guarda cada body enviado. */
function servidor(...respuestas: Respuesta[]) {
  const enviados: Record<string, unknown>[] = []
  let i = 0
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
    enviados.push(JSON.parse(String(init.body)))
    const r = respuestas.length ? respuestas[Math.min(i++, respuestas.length - 1)] : 200
    if (r === 'sin-senal') throw new TypeError('Failed to fetch')
    if (r === 'descartado') return new Response('{"success":true,"descartado":true}', { status: 200 })
    return new Response('{}', { status: r })
  }))
  return enviados
}

function diferida<T>() {
  let resolver!: (v: T) => void
  let rechazar!: (e: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

const SIN_STATS = ['putts', 'fairway_hit', 'gir']

beforeEach(() => {
  fetchRoundHoleScores.mockReset()
  fetchRoundHoleScores.mockImplementation(async (id) => (id === 'rA' ? STATS_A : []))
  Object.values(toast).forEach((f) => f.mockClear())
})

describe('useScoreEntry · stats al cambiar de tarjeta', () => {
  it('de A a B con la carga de B pendiente: la pantalla de B no muestra nada de A, y al cargar no viaja nada de A', async () => {
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    expect(result.current.holePutts[1]).toBe(2)
    await act(async () => { await result.current.saveHoleStat(1, { gir: false }) }) // A tocó una stat a mano

    const cargaB = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation(() => cargaB.promesa)
    await act(async () => result.current.selectPlayer('pB'))
    expect(result.current.cargaTarjeta).toBe('cargando')
    expect(result.current.holePutts).toEqual({})
    expect(result.current.holeFairway).toEqual({})
    expect(result.current.holeGir).toEqual({})

    await act(async () => { cargaB.resolver([]) })
    await act(() => result.current.saveScore(1, '5'))
    const deB = enviados.at(-1)!
    expect(deB).toMatchObject({ round_id: 'rB', hole_number: 1, gross_score: 5 })
    for (const k of SIN_STATS) expect(deB).not.toHaveProperty(k)
  })

  it('la carga de A que llega después de abrir B no pinta sus stats ni sus golpes en B', async () => {
    servidor()
    const cargaA = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation((id) => (id === 'rA' ? cargaA.promesa : Promise.resolve([])))
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(async () => result.current.selectPlayer('pB'))
    await act(async () => { cargaA.resolver(STATS_A) })

    expect(result.current.selectedId).toBe('pB')
    expect(result.current.currentScores).toEqual({})
    expect(result.current.holePutts).toEqual({})
    expect(result.current.holeGir).toEqual({})
  })

  it('el error de una carga vieja no avisa ni bloquea la tarjeta nueva', async () => {
    servidor()
    const cargaA = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation((id) => (id === 'rA' ? cargaA.promesa : Promise.resolve([])))
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(async () => result.current.selectPlayer('pB'))
    await act(async () => { cargaA.rechazar(new Error('red')) })
    expect(toast.showError).not.toHaveBeenCalled()
    expect(result.current.cargaTarjeta).toBe('lista')
  })
})

describe('useScoreEntry · tarjeta que no cargó', () => {
  it('con la carga caída no se anota (ni se puede deshacer un "hoyo vacío" que borre el golpe real), y Reintentar la destraba', async () => {
    const enviados = servidor()
    fetchRoundHoleScores.mockImplementation(async () => { throw new Error('red') })
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pB'))
    expect(result.current.cargaTarjeta).toBe('error')
    expect(toast.showError).toHaveBeenCalledTimes(1)

    await act(() => result.current.saveScore(1, '5'))
    expect(enviados).toHaveLength(0)
    expect(result.current.lastAction).toBeNull()
    expect(toast.showWarning).toHaveBeenCalledWith('Espera un momento', expect.any(String))

    fetchRoundHoleScores.mockImplementation(async () => GOLPE_B)
    await act(async () => result.current.reintentarCarga())
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(result.current.currentScores[1]).toBe(6)
    // Ahora el deshacer conoce el golpe anterior: vuelve al 6, no a null.
    await act(() => result.current.saveScore(1, '5'))
    await act(() => result.current.undoLast())
    expect(enviados.at(-1)).toMatchObject({ hole_number: 1, gross_score: 6 })
  })

  it('mientras la tarjeta carga, anotar no envía nada', async () => {
    const enviados = servidor()
    fetchRoundHoleScores.mockImplementation(() => new Promise(() => {}))
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pB'))
    await act(() => result.current.saveScore(1, '5'))
    expect(enviados).toHaveLength(0)
  })

  it('una recarga de la tarjeta ya cargada que falla no la bloquea', async () => {
    servidor()
    const { result, rerender } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    fetchRoundHoleScores.mockImplementation(async () => { throw new Error('red') })
    await act(async () => result.current.reintentarCarga())
    rerender()
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(result.current.currentScores[1]).toBe(4)
  })
})

describe('useScoreEntry · borrar, omitir y confirmar stats', () => {
  it('guardar sólo el golpe NO manda las stats que vinieron de la base (no las borra ni las reescribe)', async () => {
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(() => result.current.saveScore(1, '5'))
    for (const k of SIN_STATS) expect(enviados.at(-1)).not.toHaveProperty(k)
    expect(enviados.at(-1)).toHaveProperty('stats_null_borra', true)
  })

  it('borrar los putts manda null explícito con stats_null_borra, sin las stats que no se tocaron', async () => {
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(async () => { await result.current.saveHoleStat(1, { putts: null }) })
    expect(enviados.at(-1)).toHaveProperty('putts', null)
    expect(enviados.at(-1)).toHaveProperty('stats_null_borra', true)
    expect(enviados.at(-1)).not.toHaveProperty('fairway_hit')
    expect(enviados.at(-1)).not.toHaveProperty('gir')
  })

  it('lo tocado viaja hasta que el servidor lo aplica: fallido o descartado sigue viajando; aplicado, deja de viajar', async () => {
    const enviados = servidor(500, 'descartado', 200, 200)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.saveHoleStat(1, { putts: null }) })
    expect(ok).toBe(false)
    await act(async () => { await result.current.saveHoleStat(1, { gir: false }) }) // descartado
    expect(enviados.at(-1)).toMatchObject({ putts: null, gir: false })
    await act(async () => { await result.current.saveHoleStat(1, { gir: false }) }) // aplicado
    expect(enviados.at(-1)).toMatchObject({ putts: null, gir: false })
    await act(() => result.current.saveScore(1, '6'))
    for (const k of SIN_STATS) expect(enviados.at(-1)).not.toHaveProperty(k)
  })

  it('sin señal, saveHoleStat devuelve false y avisa (no queda una promesa rechazada muda)', async () => {
    servidor(200, 'sin-senal')
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.saveHoleStat(1, { putts: 3 }) })
    expect(ok).toBe(true)
    await act(async () => { ok = await result.current.saveHoleStat(1, { putts: 1 }) })
    expect(ok).toBe(false)
    expect(toast.showWarning).toHaveBeenCalledWith('No se guardó', expect.stringContaining('hoyo 1'))
  })

  it('el deshacer lleva lo tocado del hoyo (sin él, un GIR con secuencia anterior se descartaba)', async () => {
    const enviados = servidor(200, 500, 200)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(() => result.current.saveScore(1, '5'))
    await act(async () => { await result.current.saveHoleStat(1, { gir: false }) }) // falla: sigue tocado
    await act(() => result.current.undoLast())
    expect(enviados.at(-1)).toMatchObject({ hole_number: 1, gross_score: 4, gir: false })
    expect(enviados.at(-1)).not.toHaveProperty('putts')
  })
})
