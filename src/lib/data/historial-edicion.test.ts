import { describe, it, expect } from 'vitest'
import { actualizarScoresDeRonda, estimadosTrasEditar } from './historial-edicion'

type Cadena = Array<[string, unknown[]]>

/** Cliente falso: cada tabla responde lo indicado; registra las cadenas para afirmar sobre el UPDATE. */
function fake(porTabla: Record<string, (c: Cadena) => { data?: unknown; error?: unknown }>) {
  const llamadas: Array<{ tabla: string; cadena: Cadena }> = []
  return {
    llamadas,
    from(tabla: string) {
      const cadena: Cadena = []
      llamadas.push({ tabla, cadena })
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, ...(porTabla[tabla]?.(cadena) ?? {}) }).then(res)
          return (...args: unknown[]) => { cadena.push([String(prop), args]); return proxy }
        },
      })
      return proxy
    },
  }
}

const TEE = { rating: 71.3, slope: 128, front_course_rating: 35.6, front_slope_rating: 126, back_course_rating: 35.7, back_slope_rating: 130 }
const update = (sb: ReturnType<typeof fake>) =>
  sb.llamadas.filter(l => l.tabla === 'historical_rounds').map(l => l.cadena.find(c => c[0] === 'update')).find(Boolean)?.[1][0] as Record<string, unknown>

describe('estimadosTrasEditar', () => {
  it('un hoyo corregido deja de ser estimado; los demás siguen', () => {
    const est = [{ hoyo: 2, motivo: 'concedido' }, { hoyo: 9, motivo: 'no_jugado' }]
    expect(estimadosTrasEditar(est, null, [4, 6, 4], [4, 5, 4])).toEqual([{ hoyo: 9, motivo: 'no_jugado' }])
  })
  it('usa metadata.hoyos: una ronda de 9 desde el 10 guarda el hoyo 11 en la posición 1', () => {
    const hoyos = [10, 11, 12, 13, 14, 15, 16, 17, 18]
    expect(estimadosTrasEditar([{ hoyo: 11, motivo: 'concedido' }], hoyos, [4, 6], [4, 5])).toEqual([])
    expect(estimadosTrasEditar([{ hoyo: 2, motivo: 'concedido' }], hoyos, [4, 6], [4, 5])).toEqual([{ hoyo: 2, motivo: 'concedido' }])
  })
})

describe('actualizarScoresDeRonda', () => {
  const fila = (extra: Record<string, unknown> = {}) => ({
    user_id: 'u1', course_id: 'c1', tee_color: 'azul', slope_rating: 128, course_rating: 71.3, formato_juego: 'stroke_play',
    scores: Array(18).fill(5), metadata: { hoyos: Array.from({ length: 18 }, (_, i) => i + 1) }, ...extra,
  })

  it('recalcula el DIFERENCIAL con el total nuevo (antes quedaba el viejo y el índice no se movía)', async () => {
    const sb = fake({ historical_rounds: () => ({ data: fila(), error: null }), course_tees: () => ({ data: TEE }) })
    const nuevos = Array(18).fill(4)
    const r = await actualizarScoresDeRonda(sb as never, { id: 'h1', scores: nuevos })
    expect(r.ok).toBe(true)
    const u = update(sb)
    expect(u.total_gross).toBe(72)
    expect(u.holes_played).toBe(18)
    expect(Number(u.diferencial)).toBeCloseTo((72 - 71.3) * 113 / 128, 2)
  })

  it('match de 9 decidido 5&4: completar los 4 hoyos no jugados con golpes reales habilita el diferencial', async () => {
    const est = [6, 7, 8, 9].map(h => ({ hoyo: h, motivo: 'no_jugado' }))
    const base = fila({ formato_juego: 'match_play', scores: [4, 4, 4, 4, 4, 4, 4, 4, 4], metadata: { hoyos: [1, 2, 3, 4, 5, 6, 7, 8, 9], estimados: est } })
    // Sin tocar los estimados: sigue sin diferencial (sólo 5 jugados).
    const sb1 = fake({ historical_rounds: () => ({ data: base, error: null }), course_tees: () => ({ data: TEE }) })
    await actualizarScoresDeRonda(sb1 as never, { id: 'h1', scores: [3, 4, 4, 4, 4, 4, 4, 4, 4] })
    expect(update(sb1).diferencial).toBeNull()
    // Corrigiendo los 4: ya no hay estimados y hay diferencial.
    const sb2 = fake({ historical_rounds: () => ({ data: base, error: null }), course_tees: () => ({ data: TEE }) })
    await actualizarScoresDeRonda(sb2 as never, { id: 'h1', scores: [4, 4, 4, 4, 4, 5, 5, 5, 5] })
    const u = update(sb2)
    expect(u.metadata).not.toHaveProperty('estimados')
    expect(u.diferencial).not.toBeNull()
  })

  it('bola compartida: sin diferencial aunque cambien los golpes', async () => {
    const sb = fake({ historical_rounds: () => ({ data: fila({ formato_juego: 'scramble' }), error: null }), course_tees: () => ({ data: TEE }) })
    await actualizarScoresDeRonda(sb as never, { id: 'h1', scores: Array(18).fill(4) })
    expect(update(sb).diferencial).toBeNull()
  })

  it('sin cancha: usa los ratings guardados en la fila', async () => {
    const sb = fake({ historical_rounds: () => ({ data: fila({ course_id: null }), error: null }) })
    await actualizarScoresDeRonda(sb as never, { id: 'h1', scores: Array(18).fill(4) })
    expect(Number(update(sb).diferencial)).toBeCloseTo((72 - 71.3) * 113 / 128, 2)
  })

  it('la fila no se pudo leer (RLS / no existe) → noop, sin UPDATE', async () => {
    const sb = fake({ historical_rounds: () => ({ data: null, error: null }) })
    const r = await actualizarScoresDeRonda(sb as never, { id: 'h1', scores: [4] })
    expect(r).toMatchObject({ ok: false, reason: 'noop' })
    expect(update(sb)).toBeUndefined()
  })

  it('tarjeta de FedeGolf (oficial, sin golpes por hoyo): no se edita ni se pisa su diferencial', async () => {
    const sb = fake({ historical_rounds: () => ({ data: fila({ import_source: 'fedegolf', scores: null }), error: null }) })
    const r = await actualizarScoresDeRonda(sb as never, { id: 'h1', scores: [4, 4, 4] })
    expect(r.ok).toBe(false)
    expect(update(sb)).toBeUndefined()
  })

  it('una ronda de 9 no crece a 10 hoyos por una casilla de más', async () => {
    const nueve = fila({ scores: Array(9).fill(4), metadata: { hoyos: [10, 11, 12, 13, 14, 15, 16, 17, 18] } })
    const sb = fake({ historical_rounds: () => ({ data: nueve, error: null }), course_tees: () => ({ data: TEE }) })
    await actualizarScoresDeRonda(sb as never, { id: 'h1', scores: [...Array(9).fill(4), 5] })
    const u = update(sb)
    expect(u.holes_played).toBe(9)
    expect((u.scores as unknown[]).length).toBe(9)
  })
})
