import { describe, it, expect } from 'vitest'
import { guardarRondaDeTorneoEnHistorial, ratingsDelJugadorDeTorneo } from './historial'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import type { LegacyHcpContext } from '@/golf/leaderboard/types'

type Cadena = Array<[string, unknown[]]>

/** Cliente falso: cada tabla responde lo indicado; registra las cadenas para afirmar sobre el INSERT. */
function fake(porTabla: Record<string, (c: Cadena) => { data?: unknown; error?: unknown }>) {
  const llamadas: Array<{ tabla: string; cadena: Cadena }> = []
  const respuesta = (tabla: string, cadena: Cadena) =>
    Promise.resolve({ data: null, error: null, count: 0, ...(porTabla[tabla]?.(cadena) ?? {}) })
  const cadenaDe = (tabla: string) => {
    const cadena: Cadena = []
    llamadas.push({ tabla, cadena })
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => respuesta(tabla, cadena).then(res, rej)
        return (...args: unknown[]) => { cadena.push([String(prop), args]); return proxy }
      },
    })
    return proxy
  }
  return {
    llamadas,
    from: (tabla: string) => cadenaDe(tabla),
    rpc: (fn: string) => cadenaDe(`rpc:${fn}`),
  }
}
const eqDe = (c: Cadena, col: string) => c.find(x => x[0] === 'eq' && x[1][0] === col)?.[1][1]

const tee = (over: Partial<CourseTeeRow>): CourseTeeRow => ({
  id: 'tA', nombre: 'Azul', rating: 72, slope: 130, yardaje_total: 6400, genero: 'M',
  front_course_rating: 35.8, front_slope_rating: 128, back_course_rating: 36.2, back_slope_rating: 132, ...over,
})
// Hacienda Chicureo-like: Blanco varones 71.6/137, Blanco damas 78.6/142.
const BLANCO_M = tee({ id: 'tBM', nombre: 'Blanco', rating: 71.6, slope: 137, genero: 'M' })
const BLANCO_F = tee({ id: 'tBF', nombre: 'Blanco', rating: 78.6, slope: 142, genero: 'F' })
const AZUL = tee({})

const TORNEO = {
  id: 't1', afecta_estadisticas: true, course_id: 'c1', tees: 'Azul', hole_count: 18,
  date_start: '2026-10-09', total_rounds: 1, formato_juego: 'stroke_play' as string | null, format: null as string | null,
  modo_juego: 'gross', hcp_calc_mode: 'whs',
}
// Sin `nombre` en el embed: el contexto no sale a buscar la variante de género (los tees viajan acá).
const cancha = (id: string, tees: CourseTeeRow[], cr = 70, slope = 125) =>
  ({ id, par_total: 72, slope_rating: slope, course_rating: cr, course_tees: tees })

function escenario(opts: {
  torneo?: Partial<typeof TORNEO>
  hoyos: Array<[number, number]>
  jugador?: Record<string, unknown>
  roundNumber?: number
  tees?: CourseTeeRow[]
}) {
  const total = opts.hoyos.reduce((a, [, g]) => a + g, 0)
  const tees = opts.tees ?? [AZUL, BLANCO_M, BLANCO_F]
  return fake({
    rounds: () => ({ data: { player_id: 'p1', round_number: opts.roundNumber ?? 1, total_gross: total, tournament_id: 't1' } }),
    tournaments: () => ({ data: { ...TORNEO, ...opts.torneo, courses: cancha('c1', tees) } }),
    tournament_rounds: () => ({ data: [{ round_number: 2, course_id: 'c2', hole_count: 18, date: null }] }),
    players: () => ({ data: { user_id: 'u1', tee_id: null, genero: 'M', categories: null, ...opts.jugador } }),
    courses: c => (eqDe(c, 'id') === 'c2'
      ? { data: { ...cancha('c2', [tee({ id: 'tC2', rating: 68, slope: 120 })]), nombre: 'Otra' } }
      : { data: { nombre: 'Los Leones' } }),
    hole_scores: () => ({ data: opts.hoyos.map(([hole_number, gross_score]) => ({ hole_number, gross_score })) }),
  })
}
const insertDe = (sb: ReturnType<typeof fake>) =>
  sb.llamadas.find(l => l.tabla === 'historical_rounds' && l.cadena.some(c => c[0] === 'insert'))
    ?.cadena.find(c => c[0] === 'insert')?.[1][0] as Record<string, unknown> | undefined
const de = (desde: number, golpes: number[]): Array<[number, number]> => golpes.map((g, i) => [desde + i, g])

describe('guardarRondaDeTorneoEnHistorial', () => {
  it('torneo de 9 (back) con bruto > 55: diferencial de 9 con el rating del back, no la fórmula de 18', async () => {
    const sb = escenario({ torneo: { hole_count: 9 }, hoyos: de(10, [7, 7, 6, 7, 6, 7, 6, 6, 6]) }) // 58
    expect(await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')).toBe(true)
    const fila = insertDe(sb)!
    expect(fila.holes_played).toBe(9)
    expect(fila.diferencial).toBeCloseTo(((58 - 36.2) * 113 / 132) * 2, 2)
    expect(fila).toMatchObject({ user_id: 'u1', course_id: 'c1', course_name: 'Los Leones', import_source: 'tournament' })
  })

  it('18 hoyos: fórmula de 18 con el tee del torneo', async () => {
    const sb = escenario({ hoyos: de(1, Array(18).fill(5)) }) // 90
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    const fila = insertDe(sb)!
    expect(fila).toMatchObject({ holes_played: 18, course_rating: 72, slope_rating: 130 })
    expect(fila.diferencial).toBeCloseTo((90 - 72) * 113 / 130, 2)
  })

  it('jugadora en un torneo de tee Blanco: rating de damas, no la primera fila "Blanco"', async () => {
    const sb = escenario({ torneo: { tees: 'Blanco' }, jugador: { genero: 'F' }, hoyos: de(1, Array(18).fill(5)) })
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    const fila = insertDe(sb)!
    expect(fila).toMatchObject({ course_rating: 78.6, slope_rating: 142 })
    expect(fila.diferencial).toBeCloseTo((90 - 78.6) * 113 / 142, 2)
  })

  it('ronda 2 en otra cancha: course_id y ratings de esa cancha', async () => {
    const sb = escenario({ torneo: { total_rounds: 2 }, roundNumber: 2, hoyos: de(1, Array(18).fill(5)) })
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(insertDe(sb)).toMatchObject({ course_id: 'c2', course_rating: 68, slope_rating: 120 })
  })

  it('tarjeta de 18 abandonada en el 14: se guarda, sin diferencial', async () => {
    const sb = escenario({ hoyos: de(1, Array(14).fill(5)) })
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(insertDe(sb)).toMatchObject({ holes_played: 14, diferencial: null })
  })

  it('scramble: el score es del equipo → sin diferencial individual', async () => {
    const sb = escenario({ torneo: { formato_juego: 'scramble' }, hoyos: de(1, Array(18).fill(4)) })
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(insertDe(sb)).toMatchObject({ formato_juego: 'scramble', diferencial: null })
  })

  it('torneo viejo con el formato sólo en `format`: se respeta (resolveFormatoJuego)', async () => {
    const sb = escenario({ torneo: { formato_juego: null, format: 'foursome' }, hoyos: de(1, Array(18).fill(4)) })
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(insertDe(sb)).toMatchObject({ formato_juego: 'foursome', diferencial: null })
  })

  it('torneo que no afecta estadísticas: no inserta', async () => {
    const sb = escenario({ torneo: { afecta_estadisticas: false }, hoyos: de(1, Array(18).fill(5)) })
    expect(await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')).toBe(false)
    expect(insertDe(sb)).toBeUndefined()
  })

  it('INSERT rechazado: propaga el error (el caller lo reporta)', async () => {
    const err = { code: '23505', message: 'dup' }
    const sb = fake({
      rounds: () => ({ data: { player_id: 'p1', round_number: 1, total_gross: 90, tournament_id: 't1' } }),
      tournaments: () => ({ data: { ...TORNEO, courses: cancha('c1', [AZUL]) } }),
      players: () => ({ data: { user_id: 'u1', tee_id: null, genero: 'M', categories: null } }),
      courses: () => ({ data: { nombre: 'X' } }),
      hole_scores: () => ({ data: de(1, Array(18).fill(5)).map(([hole_number, gross_score]) => ({ hole_number, gross_score })) }),
      historical_rounds: c => (c.some(x => x[0] === 'insert') ? { error: err } : {}),
    })
    await expect(guardarRondaDeTorneoEnHistorial(sb as never, 'r1')).rejects.toBe(err)
  })
})

describe('ratingsDelJugadorDeTorneo — mismo tee que el motor', () => {
  const ctx = (over: Partial<LegacyHcpContext> = {}): LegacyHcpContext => ({
    mode: 'whs', tees: 'Azul', course: { par_total: 72, slope_rating: 125, course_rating: 70 },
    courseTees: [AZUL, BLANCO_M, BLANCO_F], ...over,
  })
  const jugador = (over: Record<string, unknown> = {}) =>
    ({ user_id: 'u1', tee_id: null, genero: null, categories: null, ...over })
  const h18 = Array.from({ length: 18 }, (_, i) => i + 1)

  it('tee asignado por el admin manda sobre el del torneo, con el rating del género', () => {
    expect(ratingsDelJugadorDeTorneo(ctx(), jugador({ tee_id: 'tBM', genero: 'F' }), h18)).toMatchObject({ cr: 78.6, slope: 142 })
  })
  it('tee de la categoría', () => {
    const r = ratingsDelJugadorDeTorneo(ctx(), jugador({ categories: { default_tee_color: 'Blanco', gender: 'F' } }), h18)
    expect(r).toMatchObject({ cr: 78.6, slope: 142 })
  })
  it('sin tee que calce: los ratings de la cancha', () => {
    expect(ratingsDelJugadorDeTorneo(ctx({ tees: 'Dorado' }), jugador(), h18)).toEqual({ cr: 70, slope: 125, nineHole: null })
  })
  it('cancha sin ratings ni tees: null (sin diferencial)', () => {
    const r = ratingsDelJugadorDeTorneo(ctx({ courseTees: [], course: { par_total: 72, slope_rating: 0, course_rating: 0 } }), jugador(), h18)
    expect(r).toEqual({ cr: null, slope: null, nineHole: null })
  })
})

describe('guardarRondaDeTorneoEnHistorial — lecturas fallidas', () => {
  it('si falla la lectura del jugador, lanza (no pierde la tarjeta en silencio)', async () => {
    const err = { code: 'PGRST100', message: 'bad embed' }
    const sb = fake({
      rounds: () => ({ data: { player_id: 'p1', round_number: 1, total_gross: 90, tournament_id: 't1' } }),
      tournaments: () => ({ data: { ...TORNEO, courses: cancha('c1', [AZUL]) } }),
      players: () => ({ error: err }),
    })
    await expect(guardarRondaDeTorneoEnHistorial(sb as never, 'r1')).rejects.toBe(err)
  })
})
