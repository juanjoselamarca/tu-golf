/**
 * PARIDAD — torneo al 85 % iniciado: su tarjeta de grupo es una ronda libre
 * (`rondas_libres.hcp_pct = 85`, copiado por `materializeGroupScorecard`) y
 * TODOS los que puntúan desde ahí ven el mismo handicap de juego:
 *   · board /torneo/[slug] y /en-vivo  → `fetchRondaLibreJugadoresConCourseHcp`
 *   · vista en vivo, scorer y GWI       → `courseHandicapsDeRonda` (scorer vía `resolverHandicapsDelScorer`)
 *   · match play                        → `matchDeLaRonda` con esos handicaps (diferencia al 100 %)
 *   · tarjeta del historial             → match con el de juego; ajuste WHS con el COMPLETO (Regla 3.1b)
 *
 * Ejemplo de la Regla 6.2a/1 (CR 71, slope 125, par 71): índice 8,6 → CH 9,5132 y
 * 10,3 → 11,3938. Al 100 % juegan con 10 y 11; al 85 % con 8 y 10 (sin doble redondeo).
 */
import { describe, it, expect, vi } from 'vitest'

const CANCHA_6_2A = { slope: 125, courseRating: 71, par: 71, is9Hole: false }

vi.mock('@/golf/core/course-handicap', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/golf/core/course-handicap')>()
  return {
    ...real,
    resolverCourseData: vi.fn(async () => CANCHA_6_2A),
    resolverHandicapDisplayDeRonda: vi.fn(async (index: number) => Math.round(index)),
  }
})

import { courseHandicapsDeRonda } from '@/lib/data/ronda-libre'
import { resolverHandicapsDelScorer } from '@/lib/data/ronda-libre-scorer'
import { fetchRondaLibreJugadoresConCourseHcp } from '@/lib/data/tournaments/leaderboard'
import { matchDeLaRonda } from '@/golf/ronda-libre/match-de-la-ronda'
import { tarjetaParaHistorial } from '@/golf/ronda-libre/tarjeta-para-historial'
import { CONCEDE } from '@/golf/formats/match-play'

/** Cliente falso: cada `from(tabla)` resuelve `porTabla[tabla]` y registra los `select`. */
function fakeSupabase(porTabla: Record<string, unknown[]>) {
  const selects: Array<[string, string]> = []
  return {
    selects,
    from(tabla: string) {
      const q: Record<string, unknown> = {}
      for (const m of ['eq', 'order', 'single', 'maybeSingle']) q[m] = () => q
      q.select = (cols: string) => { selects.push([tabla, cols]); return q }
      q.in = () => q
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: porTabla[tabla] ?? [], error: null }).then(res)
      return q
    },
  }
}

const jugadores = [
  { id: 'a', nombre: 'Ana', user_id: null, scores: {}, handicap: 8.6, tees: null, ronda_id: 'r1' },
  { id: 'b', nombre: 'Beto', user_id: null, scores: {}, handicap: 10.3, tees: null, ronda_id: 'r1' },
]
const rondaDelGrupo = (hcp_pct?: number) => ({
  id: 'r1', course_id: 'c1', holes: 18, tees: 'azul', recorridos: null,
  ...(hcp_pct === undefined ? {} : { hcp_pct }),
  ronda_libre_jugadores: jugadores,
})

describe('paridad · torneo al 85 % jugado en la tarjeta de ronda libre', () => {
  it('courseHandicapsDeRonda: puntúa con el de juego (8 y 10) y guarda el completo (10 y 11) para el ajuste WHS', async () => {
    const r = await courseHandicapsDeRonda(fakeSupabase({}) as never, rondaDelGrupo(85), 71, null)
    expect(r.courseHcpMap).toEqual({ a: 8, b: 10 })
    expect(r.courseHcpCompletoMap).toEqual({ a: 10, b: 11 })
  })

  it('ronda libre normal (sin % o al 100): exactamente como antes', async () => {
    for (const ronda of [rondaDelGrupo(), rondaDelGrupo(100)]) {
      const r = await courseHandicapsDeRonda(fakeSupabase({}) as never, ronda, 71, null)
      expect(r.courseHcpMap).toEqual({ a: 10, b: 11 })
      expect(r.courseHcpCompletoMap).toEqual({ a: 10, b: 11 })
    }
  })

  it('scorer (individual y de grupo): el mismo 8 y 10', async () => {
    const { hcpMap } = await resolverHandicapsDelScorer(fakeSupabase({}) as never, rondaDelGrupo(85) as never, 71, null)
    expect(hcpMap).toEqual({ a: 8, b: 10 })
  })

  it('board /torneo/[slug] y /en-vivo: el mismo 8 y 10, y la lectura de la ronda pide hcp_pct', async () => {
    const sb = fakeSupabase({
      ronda_libre_jugadores: jugadores,
      rondas_libres: [{ id: 'r1', course_id: 'c1', holes: 18, recorridos: null, tees: 'azul', hcp_pct: 85 }],
    })
    const out = await fetchRondaLibreJugadoresConCourseHcp(sb as never, ['r1'], 71, async () => new Map())
    expect(Object.fromEntries(out.map((j) => [j.id, j.handicap]))).toEqual({ a: 8, b: 10 })
    const select = sb.selects.find(([t]) => t === 'rondas_libres')?.[1] ?? ''
    expect(select).toMatch(/\bhcp_pct\b/)
  })

  it('match play: recibe los de juego y la diferencia va al 100 % (Beto recibe 2 golpes, no 1)', async () => {
    const { courseHcpMap } = await courseHandicapsDeRonda(fakeSupabase({}) as never, rondaDelGrupo(85), 71, null)
    const hoyos = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
    // Los dos hacen 5 en los hoyos de SI 1 y 2 y 4 en el resto: Beto gana los dos hoyos donde recibe.
    const tarjeta = Object.fromEntries(hoyos.map((h) => [h.numero, h.stroke_index <= 2 ? 5 : 4]))
    const match = matchDeLaRonda({
      ronda: { formato_juego: 'match_play', holes: 18, modo_juego: 'neto', hoyo_inicio: 1, ronda_libre_jugadores: jugadores },
      scoresPorJugador: { a: tarjeta, b: tarjeta },
      hoyos,
      courseHcpPorJugador: courseHcpMap,
    })
    expect(match?.holesWonB).toBe(2) // al 100 % (10 vs 11) habría ganado 1
    expect(match?.holesWonA).toBe(0)
  })
})

describe('tarjeta del historial · el match con el de juego, el ajuste WHS con el completo', () => {
  // 18 hoyos par 4 (SI = número), neto. Ana juega con 0; Beto con 3 (completo 6).
  // Beto hace 4 en todos salvo 5 en los hoyos 4 y 5, y concede el 6.
  //  · Match con 3 (golpe en SI 1-3): gana 1-3, pierde 4, 5 y 6 → "Empate".
  //    (con el completo, golpe también en SI 4-6, empataría 4 y 5: "Ganó 2 UP").
  //  · Hoyo 6 estimado con el COMPLETO (1 golpe): min(doble bogey neto 7, neto de Ana 4 + 1 + 1) = 6.
  //    (con el de juego, sin golpe en ese hoyo, habría quedado 5).
  const hoyos = Array.from({ length: 18 }, (_, i) => i + 1)
  const ronda = {
    formato_juego: 'match_play' as const, holes: 18, modo_juego: 'neto' as const, hoyo_inicio: 1,
    ronda_libre_jugadores: [{ id: 'p1', nombre: 'Ana' }, { id: 'p2', nombre: 'Beto' }],
  }
  const beto: Record<number, number> = Object.fromEntries(hoyos.map((n) => [n, n === 4 || n === 5 ? 5 : n === 6 ? CONCEDE : 4]))
  const scoresPorJugador = { p1: Object.fromEntries(hoyos.map((n) => [n, 4])), p2: beto }
  it('Empate y el hoyo concedido vale 6', () => {
    const r = tarjetaParaHistorial({
      ronda, jugadorId: 'p2', scores: beto, scoresPorJugador,
      hoyos, parMap: Object.fromEntries(hoyos.map((n) => [n, 4])),
      hoyosConSi: hoyos.map((n) => ({ numero: n, par: 4, stroke_index: n })),
      handicapDeJuegoPorJugador: { p1: 0, p2: 3 },
      courseHcpPorJugador: { p1: 0, p2: 6 },
      sinIndice: new Set<string>(),
    })
    expect(r.matchResult).toBe('Empate')
    expect(r.scores[6]).toBe(6)
  })
})
