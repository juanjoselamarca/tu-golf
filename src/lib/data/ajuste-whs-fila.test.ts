import { describe, it, expect, vi } from 'vitest'
import { grossAjustadoDeFila, fetchIndiceParaTope, type FilaParaAjuste } from './ajuste-whs-fila'

type Respuesta = { data?: unknown; error?: unknown }

/** Cliente falso: cada `from(tabla)` resuelve `porTabla[tabla]` al hacer await, sea cual sea la cadena. */
function fake(porTabla: Record<string, Respuesta>) {
  const tablas: string[] = []
  return {
    tablas,
    from(tabla: string) {
      tablas.push(tabla)
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null, ...(porTabla[tabla] ?? {}) }).then(ok, ko)
          return () => proxy
        },
      })
      return proxy
    },
  }
}

const PAR: Record<number, number> = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5, 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
const H18 = Array.from({ length: 18 }, (_, i) => i + 1)
const CATALOGO = H18.map(n => ({ numero: n, par: PAR[n], stroke_index: n, recorrido: null }))
const TEE = { rating: 71.3, slope: 128, front_course_rating: 35.6, front_slope_rating: 126, back_course_rating: 35.7, back_slope_rating: 130 }
const CANCHA = { slope_rating: 128, course_rating: 71.3, par_total: 72 }
const conCatalogo = (extra: Record<string, Respuesta> = {}) =>
  fake({ course_holes: { data: CATALOGO }, course_tees: { data: TEE }, courses: { data: CANCHA }, ...extra })

const parPosicional = (hoyos: number[]) => Object.fromEntries(hoyos.map((h, i) => [String(i + 1), PAR[h]]))
const fila18 = (scores: (number | null)[], extra: Partial<FilaParaAjuste> = {}): FilaParaAjuste => ({
  course_id: 'c1', tee_color: 'azul', holes_played: scores.filter(s => s != null).length, scores,
  par_per_hole: parPosicional(H18), metadata: { hoyos: H18 }, formato_juego: 'stroke_play', import_source: null, ...extra,
})
const bogeys = (hoyos: number[]) => hoyos.map(h => PAR[h] + 1)

describe('grossAjustadoDeFila — tarjeta de 18 con catálogo', () => {
  it('11 en el par 5 de SI 4, índice 12 (CH 13): tope 8, ajustado baja 3', async () => {
    const scores = bogeys(H18); scores[3] = 11
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila18(scores), { indice: 12 })
    expect(r).not.toBeNull()
    expect(r!.courseHcp).toBe(13)
    expect(r!.siFuente).toBe('catalogo')
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 11, tope: 8 }])
    expect(r!.grossAjustado).toBe(r!.grossBruto - 3)
    expect(r!.metadata).toEqual({ course_hcp: 13, indice: 12, si_fuente: 'catalogo', hoyos_topados: [{ hoyo: 4, gross: 11, tope: 8 }], hoyos_sin_par: [], tee: 'azul', hoyos_reparto: 18 })
  })

  it('sin índice (Regla 3.1a): par + 5', async () => {
    const scores = bogeys(H18); scores[3] = 11
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila18(scores), { indice: null })
    expect(r!.courseHcp).toBeNull()
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 11, tope: 10 }])
  })

  it('sin datos de cancha creíbles no aproxima el CH con el índice: tope par + 5', async () => {
    const scores = bogeys(H18); scores[3] = 11
    const sb = fake({ course_holes: { data: CATALOGO }, course_tees: { data: null }, courses: { data: null } })
    const r = await grossAjustadoDeFila(sb as never, fila18(scores), { indice: 12 })
    expect(r!.courseHcp).toBeNull()
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 11, tope: 10 }])
  })

  it('sin par_per_hole: el par sale del catálogo (nunca par 4 inventado)', async () => {
    const scores = bogeys(H18); scores[3] = 11
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila18(scores, { par_per_hole: null }), { indice: 12 })
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 11, tope: 8 }])
    expect(r!.completo).toBe(true)
  })

  it('catálogo ambiguo (dos recorridos con la misma numeración, sin saber cuál): SI desconocido, tope holgado', async () => {
    const ambiguo = [...CATALOGO, ...CATALOGO.map(h => ({ ...h, par: 3, recorrido: 'B' }))]
    const scores = bogeys(H18); scores[3] = 11
    const r = await grossAjustadoDeFila(fake({ course_holes: { data: ambiguo }, course_tees: { data: TEE }, courses: { data: CANCHA } }) as never, fila18(scores), { indice: 12 })
    expect(r!.siFuente).toBe('desconocido')
    // par propio de la fila (5) + 2 + ceil(13/18) = 8
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 11, tope: 8 }])
  })

  it('sin catálogo ni par propio: no se topa nada y queda completo:false', async () => {
    const scores = bogeys(H18); scores[3] = 11
    const r = await grossAjustadoDeFila(fake({}) as never, fila18(scores, { par_per_hole: null }), { indice: 12 })
    expect(r!.grossAjustado).toBe(r!.grossBruto)
    expect(r!.completo).toBe(false)
    expect(r!.hoyosSinPar).toHaveLength(18)
  })
})

describe('grossAjustadoDeFila — 9 hoyos', () => {
  const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18]

  it('back 9 con metadata.hoyos: SI normalizado 1..9 sobre 10-18 y CH de 9 hoyos', async () => {
    const scores = BACK.map(() => 12)
    const fila: FilaParaAjuste = {
      course_id: 'c1', tee_color: 'azul', holes_played: 9, scores, par_per_hole: parPosicional(BACK),
      metadata: { hoyos: BACK }, formato_juego: 'stroke_play', import_source: null,
    }
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila, { indice: 12 })
    expect(r!.siFuente).toBe('catalogo')
    const ch = r!.courseHcp!
    expect(ch).toBeGreaterThan(0)
    expect(ch).toBeLessThan(9)
    // SI de catálogo 10..18 → normalizado 1..9 en el mismo orden.
    expect(r!.hoyosTopados).toEqual(BACK.map((h, i) => ({ hoyo: h, gross: 12, tope: PAR[h] + 2 + (i + 1 <= ch ? 1 : 0) })))
  })

  it('9 casillas sin metadata.hoyos en una cancha de 18: front asumido → tope holgado y sin par de catálogo', async () => {
    const fila: FilaParaAjuste = {
      course_id: 'c1', tee_color: 'azul', holes_played: 9, scores: Array(9).fill(12), par_per_hole: null,
      metadata: null, formato_juego: 'stroke_play', import_source: null,
    }
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila, { indice: 12 })
    expect(r!.siFuente).toBe('front_asumido')
    expect(r!.completo).toBe(false)
    expect(r!.grossAjustado).toBe(108)
  })

  it('tarjeta de 18 casillas con sólo el back jugado: se reparte como 9 hoyos (10-18)', async () => {
    const scores: (number | null)[] = [...Array(9).fill(null), ...BACK.map(() => 12)]
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila18(scores), { indice: 12 })
    expect(r!.siFuente).toBe('catalogo')
    expect(r!.hoyosTopados.map(t => t.hoyo)).toEqual(BACK)
    expect(r!.courseHcp).toBeLessThan(9)
  })
})

describe('grossAjustadoDeFila — lo que no se topa', () => {
  it('FedeGolf nunca entra (su diferencial es el oficial)', async () => {
    const sb = conCatalogo()
    expect(await grossAjustadoDeFila(sb as never, fila18(bogeys(H18), { import_source: 'fedegolf' }), { indice: 12 })).toBeNull()
    expect(sb.tablas).toHaveLength(0)
  })
  it('bola compartida: null', async () => {
    expect(await grossAjustadoDeFila(conCatalogo() as never, fila18(bogeys(H18), { formato_juego: 'scramble' }), { indice: 12 })).toBeNull()
  })
  it('sin golpes por hoyo: null (el que llama sigue con total_gross)', async () => {
    expect(await grossAjustadoDeFila(conCatalogo() as never, fila18([], { scores: null }), { indice: 12 })).toBeNull()
    expect(await grossAjustadoDeFila(conCatalogo() as never, fila18(Array(18).fill(null)), { indice: 12 })).toBeNull()
  })
})

describe('fetchIndiceParaTope', () => {
  it('el índice declarado en la ronda gana y no se lee el perfil', async () => {
    const sb = fake({ profiles: { data: { indice: 10.2, indice_golfers: 14 } } })
    expect(await fetchIndiceParaTope(sb as never, 'u1', 7.5)).toBe(7.5)
    expect(sb.tablas).toHaveLength(0)
    expect(await fetchIndiceParaTope(sb as never, null)).toBeNull()
    expect(sb.tablas).toHaveLength(0)
  })
  it('profiles.indice primero; si no, el Índice Golfers+; si no, null', async () => {
    expect(await fetchIndiceParaTope(fake({ profiles: { data: { indice: 10.2, indice_golfers: 14 } } }) as never, 'u1')).toBe(10.2)
    expect(await fetchIndiceParaTope(fake({ profiles: { data: { indice: null, indice_golfers: 14 } } }) as never, 'u1')).toBe(14)
    expect(await fetchIndiceParaTope(fake({ profiles: { data: null } }) as never, 'u1')).toBeNull()
  })
})

describe('grossAjustadoDeFila — el par de relleno nunca topa (#545 P1-a)', () => {
  it('ronda libre: el par 4 de relleno de par_per_hole no topa si el catálogo no tiene el hoyo', async () => {
    const scores = bogeys(H18); scores[3] = 9
    const fila = fila18(scores, { par_per_hole: Object.fromEntries(H18.map((_, i) => [String(i + 1), 4])), metadata: { hoyos: H18, ronda_libre_jugador_id: 'p1' } })
    const r = await grossAjustadoDeFila(fake({ course_tees: { data: TEE }, courses: { data: CANCHA } }) as never, fila, { indice: 12 })
    expect(r!.hoyosTopados).toEqual([])
    expect(r!.grossAjustado).toBe(r!.grossBruto)
    expect(r!.hoyosSinPar).toHaveLength(18)
  })
  it('ronda libre: el catálogo manda sobre el par guardado', async () => {
    const scores = bogeys(H18); scores[3] = 9
    // par guardado 4 (relleno) en el hoyo 4, que en el catálogo es par 5: el tope es el del par 5 (8), no 7.
    const fila = fila18(scores, { par_per_hole: { ...parPosicional(H18), '4': 4 }, metadata: { hoyos: H18, ronda_libre_jugador_id: 'p1' } })
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila, { indice: 12 })
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 9, tope: 8 }])
  })
  it('importada: si el par guardado y el catálogo difieren, se usa el mayor (nunca el tope más bajo)', async () => {
    const scores = bogeys(H18); scores[3] = 11
    const fila = fila18(scores, { par_per_hole: { ...parPosicional(H18), '4': 4 } })
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila, { indice: 12 })
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 11, tope: 8 }])
  })
})

describe('grossAjustadoDeFila — reutiliza el ajuste guardado (#545 P1-c)', () => {
  const previo = { course_hcp: 13, indice: 12, si_fuente: 'catalogo', hoyos_topados: [], hoyos_sin_par: [], tee: 'azul', hoyos_reparto: 18 }
  it('al corregir golpes (reusarCourseHcp) usa SU índice y course handicap, sin leer el perfil', async () => {
    const scores = bogeys(H18); scores[3] = 11
    const leer = vi.fn(async () => 30)
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila18(scores, { metadata: { hoyos: H18, ajuste_whs: { ...previo, course_hcp: 10 } } }), { indice: leer, reusarCourseHcp: true })
    expect(leer).not.toHaveBeenCalled()
    expect(r!.indice).toBe(12)
    expect(r!.courseHcp).toBe(10)
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 11, tope: 8 }])
  })
  it('por defecto (recálculos) reutiliza el índice pero recalcula el course handicap con el catálogo de hoy', async () => {
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila18(bogeys(H18), { metadata: { hoyos: H18, ajuste_whs: { ...previo, course_hcp: 10 } } }), { indice: 30 })
    expect(r!.indice).toBe(12)
    expect(r!.courseHcp).toBe(13)
  })
  it('sin índice al guardarse (indice null) sigue sin índice: par + 5', async () => {
    const scores = bogeys(H18); scores[3] = 11
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila18(scores, { metadata: { hoyos: H18, ajuste_whs: { ...previo, indice: null, course_hcp: null } } }), { indice: 12 })
    expect(r!.courseHcp).toBeNull()
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 11, tope: 10 }])
  })
  it('otro tee u otro reparto: reutiliza el índice pero recalcula el course handicap', async () => {
    const scores = bogeys(H18); scores[3] = 11
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila18(scores, { metadata: { hoyos: H18, ajuste_whs: { ...previo, course_hcp: 30, tee: null } } }), { indice: 25, reusarCourseHcp: true })
    expect(r!.indice).toBe(12)
    expect(r!.courseHcp).toBe(13)
  })
  it('guarda tee y hoyos_reparto en el detalle para la próxima vez', async () => {
    const r = await grossAjustadoDeFila(conCatalogo() as never, fila18(bogeys(H18)), { indice: 12 })
    expect(r!.metadata).toMatchObject({ tee: 'azul', hoyos_reparto: 18 })
  })
})

describe('grossAjustadoDeFila — ratings del diferencial (#545, tope y diferencial de la misma fila)', () => {
  it('con ratings: el CH sale de ellos y no se lee course_tees (M y F comparten nombre)', async () => {
    const sb = conCatalogo()
    const scores = bogeys(H18); scores[3] = 11
    const r = await grossAjustadoDeFila(sb as never, fila18(scores), { indice: 12, ratings: { cr: 74.5, slope: 136, nineHoleRatings: null } })
    // round(12 × 136/113 + (74.5 − 72)) = 17 (con el tee de catálogo sería 13).
    expect(r!.courseHcp).toBe(17)
    expect(sb.tablas).not.toContain('course_tees')
  })

  it('9 hoyos sin rating de 9 publicado: la misma aproximación del diferencial (CR/2, slope de 18)', async () => {
    const back = H18.slice(9)
    const r = await grossAjustadoDeFila(conCatalogo() as never, {
      ...fila18(bogeys(back)), par_per_hole: parPosicional(back), metadata: { hoyos: back },
    }, { indice: 12, ratings: { cr: 74, slope: 128, nineHoleRatings: null } })
    // CR/2: round(6 × 128/113 + (37 − 36)) = 8. El front publicado del catálogo
    // (35.6/126) daría round(6 × 126/113 − 0.4) = 6: el test distingue los dos.
    expect(r!.courseHcp).toBe(8)
  })

  it('sin ratings y sin tee: no hay course handicap (par + 5), nunca un tee cualquiera de la cancha', async () => {
    const sb = conCatalogo({ course_tees: { data: { rating: 66, slope: 115 } } })
    const scores = bogeys(H18); scores[3] = 11
    const r = await grossAjustadoDeFila(sb as never, fila18(scores, { tee_color: null }), { indice: 12 })
    expect(r!.courseHcp).toBeNull()
    expect(r!.hoyosTopados).toEqual([{ hoyo: 4, gross: 11, tope: 10 }])
    expect(sb.tablas).not.toContain('course_tees')
  })

  it('9 hoyos con rating de 9: usa el de 9', async () => {
    const back = H18.slice(9)
    const r = await grossAjustadoDeFila(conCatalogo() as never, {
      ...fila18(bogeys(back)), par_per_hole: parPosicional(back), metadata: { hoyos: back },
    }, { indice: 30, ratings: { cr: 71.3, slope: 128, nineHoleRatings: { cr9h: 37.7, slope9h: 140 } } })
    // round(15 × 140/113 + (37.7 − 36)) = round(18.58 + 1.7) = 20.
    expect(r!.courseHcp).toBe(20)
  })
})
