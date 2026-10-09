import { describe, it, expect } from 'vitest'
import { guardarRondaDeTorneoEnHistorial } from './historial'

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

const TEE = { rating: 72, slope: 130, front_course_rating: 35.8, front_slope_rating: 128, back_course_rating: 36.2, back_slope_rating: 132 }
const TORNEO = {
  id: 't1', afecta_estadisticas: true, course_id: 'c1', tees: 'Azul', hole_count: 18,
  date_start: '2026-10-09', total_rounds: 1, formato_juego: 'stroke_play', modo_juego: 'gross',
}

function escenario(opts: { torneo?: Partial<typeof TORNEO>; hoyos: Array<[number, number]>; totalGross?: number }) {
  const total = opts.totalGross ?? opts.hoyos.reduce((a, [, g]) => a + g, 0)
  return fake({
    rounds: () => ({ data: { player_id: 'p1', round_number: 1, total_gross: total, tournament_id: 't1' } }),
    tournaments: () => ({ data: { ...TORNEO, ...opts.torneo } }),
    players: () => ({ data: { user_id: 'u1' } }),
    courses: () => ({ data: { nombre: 'Los Leones', slope_rating: 125, course_rating: 70 } }),
    course_tees: () => ({ data: TEE }),
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

  it('torneo que no afecta estadísticas: no inserta', async () => {
    const sb = escenario({ torneo: { afecta_estadisticas: false }, hoyos: de(1, Array(18).fill(5)) })
    expect(await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')).toBe(false)
    expect(insertDe(sb)).toBeUndefined()
  })

  it('INSERT rechazado: propaga el error (el caller lo reporta)', async () => {
    const err = { code: '23505', message: 'dup' }
    const sb = fake({
      rounds: () => ({ data: { player_id: 'p1', round_number: 1, total_gross: 90, tournament_id: 't1' } }),
      tournaments: () => ({ data: TORNEO }),
      players: () => ({ data: { user_id: 'u1' } }),
      courses: () => ({ data: { nombre: 'X', slope_rating: 125, course_rating: 70 } }),
      course_tees: () => ({ data: TEE }),
      hole_scores: () => ({ data: de(1, Array(18).fill(5)).map(([hole_number, gross_score]) => ({ hole_number, gross_score })) }),
      historical_rounds: c => (c.some(x => x[0] === 'insert') ? { error: err } : {}),
    })
    await expect(guardarRondaDeTorneoEnHistorial(sb as never, 'r1')).rejects.toBe(err)
  })
})
