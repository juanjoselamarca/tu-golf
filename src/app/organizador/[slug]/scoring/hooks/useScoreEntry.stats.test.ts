// Stats del hoyo (putts / fairway / GIR) y carga de la tarjeta en el scorer del organizador.
// Revisión Fable de #832 (P2) y de #834 (vuelta 1):
//  1. Al pasar de A a B, la foto de stats seguía siendo la de A hasta que terminaba la carga de B. Y una carga de A
//     que llegaba tarde pintaba sus stats en la tarjeta de B.
//  2. Una stat no se podía borrar: el null se descartaba. Y mandar null "por defecto" borraría datos buenos, así
//     que la foto omite lo que el organizador no tocó; lo confirmado por el servidor deja de viajar.
//  3. Con la carga fallida la tarjeta quedaba vacía y editable: anotar y deshacer mandaba `gross_score: null` y
//     borraba el golpe real. Ahora no se anota hasta que la tarjeta cargue, con "Reintentar".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { HoleScoreRow, ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const fetchRoundHoleScores = vi.fn<(roundId: string, signal?: AbortSignal) => Promise<Partial<HoleScoreRow>[]>>(async () => [])
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: (_c: unknown, roundId: string, signal?: AbortSignal) => fetchRoundHoleScores(roundId, signal),
  fetchRoundTotals: async () => ({ total_gross: 0, total_net: 0, total_points: 0 }),
}))
const toast = { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn() }
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

const RONDA_A = { id: 'rA', status: 'in_progress', round_number: 1 } as ScoringRound
const RONDA_B = { id: 'rB', status: 'in_progress', round_number: 1 } as ScoringRound
const TOURNAMENT = { id: 't1' } as ScoringTournament
const PLAYERS = [{ id: 'pA', player_name: 'Ana' }, { id: 'pB', player_name: 'Beto' }] as ScoringPlayer[]
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
afterEach(() => {
  vi.useRealTimers()
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

// ── Revisión Fable #834, vuelta 2 ──

describe('useScoreEntry · tarjeta atada a su ronda (P1-a, P1-b, P1-c)', () => {
  it('tocar de nuevo al jugador ya abierto no deja la tarjeta en "Cargando…" para siempre', async () => {
    servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    expect(result.current.cargaTarjeta).toBe('lista')
    await act(async () => result.current.selectPlayer('pA'))
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(result.current.currentScores[1]).toBe(4)
  })

  // Revisión Fable #834 v3 (P1): `AbortSignal.timeout` no existe en iOS 15 y lanzaba: la tarjeta quedaba en error.
  it('la carga lleva un corte de 10 s sin AbortSignal.timeout (iOS 15): se aborta y pasa a error con Reintentar', async () => {
    const original = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')
    delete (AbortSignal as { timeout?: unknown }).timeout
    try {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      servidor()
      let abortada = false
      fetchRoundHoleScores.mockImplementation((_id, signal) => {
        signal?.addEventListener('abort', () => { abortada = true })
        return new Promise(() => {})
      })
      const { result } = montar()
      await act(async () => result.current.selectPlayer('pB'))
      expect(result.current.cargaTarjeta).toBe('cargando')
      await act(async () => { vi.advanceTimersByTime(9_999) })
      expect(result.current.cargaTarjeta).toBe('cargando')
      await act(async () => { vi.advanceTimersByTime(1) })
      expect(result.current.cargaTarjeta).toBe('error')
      expect(abortada).toBe(true)
    } finally {
      if (original) Object.defineProperty(AbortSignal, 'timeout', original)
    }
  })

  it('una carga que tarda más de 4 s ofrece Reintentar antes del corte', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    servidor()
    fetchRoundHoleScores.mockImplementation(() => new Promise(() => {}))
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pB'))
    expect(result.current.cargaLenta).toBe(false)
    await act(async () => { vi.advanceTimersByTime(4_000) })
    expect(result.current.cargaLenta).toBe(true)
  })

  /** Roster mutable: el jugador pC no tiene tarjeta hasta que se la crean (`useCrearTarjeta` → `reloadRoster`). */
  function montarConRoster() {
    let rondaDeC: ScoringRound | undefined
    const activa = (p: ScoringPlayer | undefined) => (p?.id === 'pC' ? rondaDeC : getActiveRound(p))
    const hook = renderHook(({ players }) =>
      useScoreEntry({
        tournament: TOURNAMENT, players, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
        getActiveRound: activa, applyRoundTotals: vi.fn(), reloadRoster: vi.fn(async () => {}),
      }), { initialProps: { players: [...PLAYERS, { id: 'pC' }] as ScoringPlayer[] } })
    const aparecerTarjeta = (id: string) => {
      rondaDeC = { id, status: 'in_progress', round_number: 1 } as ScoringRound
      hook.rerender({ players: [...PLAYERS, { id: 'pC' }] as ScoringPlayer[] })
    }
    return { ...hook, aparecerTarjeta }
  }

  it('cuando aparece la tarjeta de un jugador que no tenía, vuelve a "cargando" y no se anota hasta tener la ronda', async () => {
    const enviados = servidor()
    const cargaC = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation((id) => (id === 'rC' ? cargaC.promesa : Promise.resolve([])))
    const { result, aparecerTarjeta } = montarConRoster()
    await act(async () => result.current.selectPlayer('pC'))
    expect(result.current.cargaTarjeta).toBe('lista') // sin tarjeta: nada que cargar

    await act(async () => aparecerTarjeta('rC'))
    expect(result.current.cargaTarjeta).toBe('cargando')
    await act(() => result.current.saveScore(1, '5'))
    expect(enviados).toHaveLength(0)

    // #828: la tarjeta que se "crea" puede ser una que ya existía con golpes.
    await act(async () => { cargaC.resolver([{ hole_number: 1, gross_score: 4 }]) })
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(result.current.currentScores[1]).toBe(4)
  })

  it('si la carga de la ronda nueva falla, la tarjeta queda bloqueada (no "lista" con la grilla vacía)', async () => {
    servidor()
    fetchRoundHoleScores.mockImplementation(async (id) => { if (id === 'rC') throw new Error('red'); return [] })
    const { result, aparecerTarjeta } = montarConRoster()
    await act(async () => result.current.selectPlayer('pC'))
    await act(async () => aparecerTarjeta('rC'))
    expect(result.current.cargaTarjeta).toBe('error')
  })
})

describe('useScoreEntry · la recarga no pisa lo que este organizador tiene sin confirmar (P2-e)', () => {
  it('un golpe en vuelo sigue en pantalla aunque la recarga traiga la base sin él', async () => {
    const respuesta = diferida<Response>()
    vi.stubGlobal('fetch', vi.fn(() => respuesta.promesa))
    fetchRoundHoleScores.mockImplementation(async () => [])
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pB'))
    let guardado!: Promise<void>
    act(() => { guardado = result.current.saveScore(1, '5') })
    await act(async () => result.current.reintentarCarga())
    expect(result.current.currentScores[1]).toBe(5)
    await act(async () => { respuesta.resolver(new Response('{}', { status: 200 })); await guardado })
  })

  it('una stat que no se guardó sigue en pantalla tras la recarga (no vuelve a lo de la base)', async () => {
    servidor(500)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA')) // base: GIR sí
    act(() => result.current.setHoleGir((g) => ({ ...g, 1: false })))
    await act(async () => { await result.current.saveHoleStat(1, { gir: false }) })
    await act(async () => result.current.reintentarCarga())
    expect(result.current.holeGir[1]).toBe(false)
    expect(result.current.holePutts[1]).toBe(2) // lo no tocado sí viene de la base
  })
})

// ── Revisión Fable #834, vuelta 3 ──

describe('useScoreEntry · cargas en vuelo y reintento (v3)', () => {
  it('una recarga pedida antes de que el golpe se confirme no lo borra de la pantalla al volver', async () => {
    const respuesta = diferida<Response>()
    vi.stubGlobal('fetch', vi.fn(() => respuesta.promesa))
    const recarga = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation(async () => [])
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pB'))
    let guardado!: Promise<void>
    act(() => { guardado = result.current.saveScore(1, '5') })
    fetchRoundHoleScores.mockImplementation(() => recarga.promesa)
    act(() => result.current.reintentarCarga()) // recarga emitida con el golpe todavía en vuelo
    await act(async () => { respuesta.resolver(new Response('{}', { status: 200 })); await guardado })
    await act(async () => { recarga.resolver([]) }) // la base de ANTES del golpe
    expect(result.current.currentScores[1]).toBe(5)
  })

  it('Reintentar durante una carga lenta no invalida la que está en vuelo y reinicia el aviso de carga lenta', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    servidor()
    const primera = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementationOnce(() => primera.promesa).mockImplementation(() => new Promise(() => {}))
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pB'))
    await act(async () => { vi.advanceTimersByTime(4_000) })
    expect(result.current.cargaLenta).toBe(true)

    await act(async () => result.current.reintentarCarga())
    expect(result.current.cargaLenta).toBe(false)
    expect(fetchRoundHoleScores).toHaveBeenCalledTimes(2)

    await act(async () => { primera.resolver(GOLPE_B) }) // responde la primera: vale
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(result.current.currentScores[1]).toBe(6)
  })
})

describe('useScoreEntry · stats sin guardar y envío agrupado (v3)', () => {
  it('el hoyo con stats fallidas lo lleva el hook (sobrevive a colapsar la tabla) y se limpia al guardarse', async () => {
    servidor(500, 200)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(async () => { await result.current.saveHoleStat(1, { gir: false }) })
    expect([...result.current.statsFallidas]).toEqual([1])
    await act(async () => { await result.current.saveHoleStat(1, {}) })
    expect(result.current.statsFallidas.size).toBe(0)
  })

  it('las stats fallidas son de su tarjeta: en la de otro jugador no aparecen', async () => {
    servidor(500)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(async () => { await result.current.saveHoleStat(1, { gir: false }) })
    await act(async () => result.current.selectPlayer('pB'))
    expect(result.current.statsFallidas.size).toBe(0)
  })

  it('toques seguidos de fairway / GIR salen en un solo envío con el valor final, 600 ms después del último', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    act(() => result.current.cambiarStat(1, { gir: false }))
    act(() => result.current.cambiarStat(1, { gir: null }))
    await act(async () => { vi.advanceTimersByTime(599) })
    expect(enviados).toHaveLength(0)
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(enviados).toHaveLength(1)
    expect(enviados[0]).toMatchObject({ round_id: 'rA', hole_number: 1, gross_score: 4, gir: null })
  })

  it('lo que esperaba el envío sale al cambiar de jugador, a la ronda donde se tocó', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    act(() => result.current.cambiarStat(1, { fairway_hit: false }))
    await act(async () => result.current.selectPlayer('pB'))
    expect(enviados).toHaveLength(1)
    expect(enviados[0]).toMatchObject({ round_id: 'rA', hole_number: 1, fairway_hit: false })
    await act(async () => { vi.advanceTimersByTime(1_000) })
    expect(enviados).toHaveLength(1)
  })
})

// ── Revisión #834, vuelta 4 (opus) ──

/** `fetch` que guarda cada body y responde 200, salvo los que `demorar` elija: esos esperan a `soltar()`. */
function servidorConDemora(demorar: (body: Record<string, unknown>) => boolean, status = 200) {
  const enviados: Record<string, unknown>[] = []
  const demorados: (() => void)[] = []
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    enviados.push(body)
    if (demorar(body)) {
      return new Promise<Response>((res) => demorados.push(() => res(new Response('{}', { status }))))
    }
    return new Response('{}', { status: 200 })
  }))
  return { enviados, soltar: () => demorados.splice(0).forEach((f) => f()) }
}
/** Lo que queda en la base del hoyo: el envío con la secuencia más alta (así ordena `guardar_hole_score`). */
const ultimoDelHoyo = (enviados: Record<string, unknown>[], hole: number) =>
  enviados.filter((e) => e.hole_number === hole).sort((a, b) => Number(a.seq) - Number(b.seq)).at(-1)

describe('useScoreEntry · deshacer y envío diferido de stats (v4)', () => {
  it('un deshacer confirmado invalida la recarga pedida antes: no vuelve a pintar el golpe deshecho', async () => {
    servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(() => result.current.saveScore(1, '5'))
    const recarga = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation(() => recarga.promesa)
    act(() => result.current.reintentarCarga()) // pedida con el 5 todavía en la base
    await act(async () => { await result.current.undoLast() })
    expect(result.current.currentScores[1]).toBe(4)
    await act(async () => { recarga.resolver([{ ...STATS_A[0], gross_score: 5 }]) })
    expect(result.current.currentScores[1]).toBe(4)
  })

  it('cerrar la tarjeta manda antes lo que esperaba el fin de los toques', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    act(() => result.current.cambiarStat(1, { gir: false }))
    await act(async () => { await result.current.finalizeRound() })
    const i = enviados.findIndex((e) => e.action === 'finalize_round')
    expect(enviados.slice(0, i).at(-1)).toMatchObject({ hole_number: 1, gir: false })
  })

  it('al ocultarse la página (iOS suspende timers) sale ya lo que esperaba', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    act(() => result.current.cambiarStat(1, { fairway_hit: false }))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    try {
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(enviados).toHaveLength(1)
      expect(enviados[0]).toMatchObject({ hole_number: 1, fairway_hit: false })
    } finally {
      delete (document as { visibilityState?: unknown }).visibilityState
    }
  })
})

/** Deja correr las microtareas: un envío encolado sale en una microtarea, no en el mismo tick del tap. */
const tic = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() })
/** Envíos de stats (sin neto: no son el guardado del golpe) que no son el deshacer. */
const esDeStats = (b: Record<string, unknown>) => !('net_score' in b) && 'gir' in b

describe('useScoreEntry · cola serial por hoyo (v5)', () => {
  it('(a) deshacer que falla con un GIR tocado en vuelo: el GIR sale después, con el golpe que sigue en la base (5)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let deshaciendo = false
    const { enviados, soltar } = servidorConDemora((b) => deshaciendo && b.gross_score === 4, 500)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA')) // H1 = 4 en la base
    await act(() => result.current.saveScore(1, '5')) // confirmado: 5
    deshaciendo = true
    let deshacer!: Promise<void>
    act(() => { deshacer = result.current.undoLast() })
    await tic()
    act(() => result.current.cambiarStat(1, { gir: true }))
    await act(async () => { vi.advanceTimersByTime(600) })
    await tic()
    expect(enviados.filter(esDeStats)).toHaveLength(0) // espera al deshacer: no sale en paralelo
    await act(async () => { soltar(); await deshacer })
    await tic()
    expect(ultimoDelHoyo(enviados, 1)).toMatchObject({ gross_score: 5, gir: true })
    expect(result.current.currentScores[1]).toBe(5)
  })

  it('(b) guardado que falla con un GIR tocado en vuelo: el GIR no lleva el 7 que la base no tiene', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { enviados, soltar } = servidorConDemora((b) => b.gross_score === 7, 500)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA')) // H1 = 4
    let guardar!: Promise<void>
    act(() => { guardar = result.current.saveScore(1, '7') })
    await tic()
    act(() => result.current.cambiarStat(1, { gir: false }))
    await act(async () => { vi.advanceTimersByTime(600) })
    await act(async () => { soltar(); await guardar })
    await tic()
    const stats = enviados.filter(esDeStats)
    expect(stats).toHaveLength(1)
    expect(stats[0]).toMatchObject({ hole_number: 1, gross_score: 4, gir: false })
    expect(ultimoDelHoyo(enviados, 1)).toMatchObject({ gross_score: 4 })
  })

  it('(c) deshacer que sale bien y GIR que dispara justo con la respuesta: lleva el golpe previo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let deshaciendo = false
    const { enviados, soltar } = servidorConDemora((b) => deshaciendo && b.gross_score === 4)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(() => result.current.saveScore(1, '5'))
    deshaciendo = true
    let deshacer!: Promise<void>
    act(() => { deshacer = result.current.undoLast() })
    await tic()
    act(() => result.current.cambiarStat(1, { gir: true })) // la pantalla todavía muestra 5
    await act(async () => {
      soltar()
      vi.advanceTimersByTime(600)
      await deshacer
    })
    await tic()
    expect(enviados.filter(esDeStats).at(-1)).toMatchObject({ hole_number: 1, gross_score: 4, gir: true })
    expect(ultimoDelHoyo(enviados, 1)).toMatchObject({ gross_score: 4, gir: true })
  })

  it('(d) dos guardados seguidos que fallan y un GIR: sale con el 4 de la base', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const enviados = servidor(500, 500, 200)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA')) // H1 = 4
    await act(() => result.current.saveScore(1, '5'))
    await act(() => result.current.saveScore(1, '6'))
    act(() => result.current.cambiarStat(1, { gir: true }))
    await act(async () => { vi.advanceTimersByTime(600) })
    await tic()
    expect(enviados.at(-1)).toMatchObject({ hole_number: 1, gross_score: 4, gir: true })
  })

  it('(e) cerrar la tarjeta espera la RESPUESTA de las stats pendientes antes de mandar el cierre', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { enviados, soltar } = servidorConDemora(esDeStats)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    act(() => result.current.cambiarStat(1, { gir: false }))
    let cerrar!: Promise<void>
    act(() => { cerrar = result.current.finalizeRound() })
    await tic()
    expect(enviados.filter(esDeStats)).toHaveLength(1) // la stat salió…
    expect(enviados.some((e) => e.action === 'finalize_round')).toBe(false) // …y el cierre la espera
    await act(async () => { soltar(); await cerrar })
    expect(enviados.at(-1)).toMatchObject({ action: 'finalize_round', round_id: 'rA' })
  })

  it('(f) dos hoyos distintos no se esperan entre sí', async () => {
    const { enviados, soltar } = servidorConDemora((b) => b.hole_number === 1)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    let hoyo1!: Promise<void>
    act(() => { hoyo1 = result.current.saveScore(1, '5') })
    let hoyo2!: Promise<void>
    act(() => { hoyo2 = result.current.saveScore(2, '3') })
    await tic()
    expect(enviados.map((e) => e.hole_number)).toEqual([1, 2])
    await act(async () => { await hoyo2 }) // responde sin que el hoyo 1 haya respondido
    await act(async () => { soltar(); await hoyo1 })
  })

  it('(g) lo encolado con la tarjeta de A sale igual, a la ronda de A, después de abrir la de B', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { enviados, soltar } = servidorConDemora((b) => b.gross_score === 5)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    let guardar!: Promise<void>
    act(() => { guardar = result.current.saveScore(1, '5') })
    await tic()
    act(() => result.current.cambiarStat(1, { gir: false }))
    fetchRoundHoleScores.mockImplementation(async (id) => (id === 'rA' ? STATS_A : GOLPE_B))
    await act(async () => result.current.selectPlayer('pB'))
    await act(async () => { soltar(); await guardar })
    await act(async () => { vi.advanceTimersByTime(600) })
    await tic()
    const stats = enviados.filter(esDeStats)
    expect(stats).toEqual([expect.objectContaining({ round_id: 'rA', hole_number: 1, gross_score: 5, gir: false })])
    expect(enviados.some((e) => e.round_id === 'rB')).toBe(false)
    expect(result.current.holeGir[1]).toBeNull()
    expect(result.current.currentScores[1]).toBe(6)
  })
})

describe('useScoreEntry · respuestas de otra tarjeta (v4)', () => {
  it('un guardado de A que responde con B abierta no deja a B en "Cargando…"', async () => {
    const { soltar } = servidorConDemora((b) => b.round_id === 'rA')
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    let guardado!: Promise<void>
    act(() => { guardado = result.current.saveScore(1, '5') })
    const cargaB = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation(() => cargaB.promesa)
    await act(async () => result.current.selectPlayer('pB'))
    await act(async () => { soltar(); await guardado })
    await act(async () => { cargaB.resolver(GOLPE_B) })
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(result.current.currentScores[1]).toBe(6)
  })

  it('tras un Reintentar que cargó, la primera carga que falla tarde no muestra un error falso', async () => {
    servidor()
    const primera = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementationOnce(() => primera.promesa)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(async () => result.current.reintentarCarga())
    expect(result.current.cargaTarjeta).toBe('lista')
    await act(async () => { primera.rechazar(new Error('red')) })
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(toast.showError).not.toHaveBeenCalled()
  })

  it('las stats de A que fallan con B abierta no borran las marcas de B; el aviso nombra a A; al volver, el reintento lleva el GIR', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { enviados, soltar } = servidorConDemora((b) => b.round_id === 'rA' || b.putts === 2, 500)
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    act(() => result.current.cambiarStat(1, { gir: false }))
    fetchRoundHoleScores.mockImplementation(async (id) => (id === 'rA' ? STATS_A : GOLPE_B))
    await act(async () => result.current.selectPlayer('pB')) // sale el GIR de A (queda en vuelo)
    let deB!: Promise<boolean>
    act(() => { deB = result.current.saveHoleStat(1, { putts: 2 }) })
    await tic() // sale en una microtarea (cola del hoyo)
    await act(async () => { soltar(); await deB })
    expect([...result.current.statsFallidas]).toEqual([1]) // la de B
    expect(toast.showWarning).toHaveBeenCalledWith('No se guardó', expect.stringContaining('Ana'))

    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      enviados.push(JSON.parse(String(init.body)))
      return new Response('{}', { status: 200 })
    }))
    await act(async () => result.current.selectPlayer('pA'))
    expect([...result.current.statsFallidas]).toEqual([1])
    expect(result.current.holeGir[1]).toBe(false) // lo que no se guardó se ve
    await act(async () => { await result.current.saveHoleStat(1, {}) })
    expect(enviados.at(-1)).toMatchObject({ round_id: 'rA', hole_number: 1, gir: false })
    expect(result.current.statsFallidas.size).toBe(0)
  })

  it('un reintento sin nada que reenviar lo dice y no finge un guardado', async () => {
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.saveHoleStat(1, {}) })
    expect(ok).toBe(false)
    expect(enviados).toHaveLength(0)
    expect(toast.showWarning).toHaveBeenCalledWith('Nada que reenviar', expect.any(String))
  })
})
