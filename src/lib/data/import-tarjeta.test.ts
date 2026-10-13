import { describe, it, expect, vi } from 'vitest'
import { parDelCatalogoPorPosicion, resolverTarjetaImportada } from './import-tarjeta'
import { resolveCourse } from '@/lib/resolve-course'

vi.mock('@/lib/resolve-course', () => ({
  resolveCourse: vi.fn(async () => ({ courseId: 'c1', courseCreated: false, holesPopulated: false, matchScore: null, warnings: [] })),
}))

const PAR18: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 4, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5, 10: 3, 11: 4, 12: 4, 13: 5, 14: 3, 15: 4, 16: 4, 17: 5, 18: 4 }
const catalogo18 = Object.entries(PAR18).map(([n, par]) => ({ numero: Number(n), par, stroke_index: Number(n) }))
const del1 = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const back = [10, 11, 12, 13, 14, 15, 16, 17, 18]

describe('parDelCatalogoPorPosicion — par del catálogo en las posiciones de la tarjeta (#545)', () => {
  it('tarjeta de 18 desde el 1: posición = número de hoyo', () => {
    expect(parDelCatalogoPorPosicion(catalogo18, del1(18))).toEqual(Object.fromEntries(del1(18).map(n => [String(n), PAR18[n]])))
  })

  it('back 9: la posición 1 lleva el par del hoyo 10, no el del 1', () => {
    const par = parDelCatalogoPorPosicion(catalogo18, back)!
    expect(par['1']).toBe(3)
    expect(Object.keys(par)).toHaveLength(9)
  })

  it('catálogo ambiguo (dos recorridos repiten el hoyo 1): null, nunca un par de otro recorrido', () => {
    const otroRecorrido = { numero: 1, par: 3, stroke_index: 1 }
    expect(parDelCatalogoPorPosicion([...catalogo18, otroRecorrido], del1(18))).toBeNull()
  })

  it('cancha de 9 y tarjeta del back 9: la segunda vuelta repite los hoyos 1..9', () => {
    const catalogo9 = catalogo18.slice(0, 9)
    const par = parDelCatalogoPorPosicion(catalogo9, back)!
    expect(Object.keys(par)).toHaveLength(9)
    expect(par['1']).toBe(PAR18[1])
    expect(par['9']).toBe(PAR18[9])
  })

  it('cancha de 9 jugada en 18: los 18 con par (no queda a medias)', () => {
    const par = parDelCatalogoPorPosicion(catalogo18.slice(0, 9), del1(18))!
    expect(Object.keys(par)).toHaveLength(18)
    expect(par['10']).toBe(PAR18[1])
  })

  it('tarjeta de 9 desde el 1: sólo sus 9 hoyos (antes guardaba las 18 claves del catálogo)', () => {
    expect(Object.keys(parDelCatalogoPorPosicion(catalogo18, del1(9))!)).toHaveLength(9)
  })

  it('catálogo vacío: null', () => {
    expect(parDelCatalogoPorPosicion([], del1(18))).toBeNull()
  })
})

/** Cliente falso: cada `from(tabla)` resuelve `porTabla[tabla]` al hacer await, sea cual sea la cadena. */
function fake(porTabla: Record<string, { data?: unknown }>) {
  return {
    from(tabla: string) {
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, ...(porTabla[tabla] ?? {}) }).then(ok)
          return () => proxy
        },
      })
      return proxy
    },
  }
}

describe('resolverTarjetaImportada — metadata del cliente (#545)', () => {
  const base = {
    userId: 'u1', courseName: 'X', courseId: 'c1', teeColor: null, parPerHole: null,
    scores: del1(18).map(n => PAR18[n] + 1), totalGross: 90, holesPlayed: 18, formatoJuego: 'stroke_play', source: 'manual',
  }
  it('sin hoyos: el par del catálogo va a las posiciones 1..N', async () => {
    const r = await resolverTarjetaImportada(fake({ course_holes: { data: catalogo18 } }) as never, { ...base, metadata: {} }, null)
    expect(r.parPerHole).toEqual(Object.fromEntries(del1(18).map(n => [String(n), PAR18[n]])))
  })
  it('hoyos que no calzan con los golpes o recorridos que no son lista: se ignoran (no rompe el import)', async () => {
    const sb = fake({ course_holes: { data: catalogo18 } })
    const r = await resolverTarjetaImportada(sb as never,
      { ...base, metadata: { hoyos: back, recorridos: 'Norte' as unknown as string[] } }, null)
    expect(r.parPerHole?.['1']).toBe(PAR18[1])
    expect(Object.keys(r.parPerHole!)).toHaveLength(18)
  })
  it('back 9 válido (largo = golpes): su par no va a resolveCourse', async () => {
    vi.mocked(resolveCourse).mockClear()
    const sb = fake({ course_holes: { data: catalogo18 } })
    await resolverTarjetaImportada(sb as never, { ...base, courseId: null, scores: base.scores.slice(9), holesPlayed: 9,
      parPerHole: { '1': 3 }, metadata: { hoyos: back } }, null)
    expect(vi.mocked(resolveCourse)).toHaveBeenCalledWith(expect.objectContaining({ parPerHole: null }))
  })
})

describe('resolverTarjetaImportada — hoyos que no es lista', () => {
  it('un string del mismo largo que los golpes no rompe el diferencial', async () => {
    const azul = { nombre: 'Azul', genero: 'M', rating: 71.3, slope: 128, front_course_rating: 35.6, front_slope_rating: 126, back_course_rating: 35.7, back_slope_rating: 130 }
    const sb = fake({ course_holes: { data: catalogo18 }, course_tees: { data: [azul] } })
    const r = await resolverTarjetaImportada(sb as never, {
      userId: 'u1', courseName: 'X', courseId: 'c1', teeColor: 'azul', parPerHole: null,
      scores: del1(9).map(n => PAR18[n] + 1), totalGross: 45, holesPlayed: 9, formatoJuego: 'stroke_play', source: 'manual',
      metadata: { hoyos: '123456789' as unknown as number[] },
    }, null)
    expect(Object.keys(r.parPerHole!)).toHaveLength(9)
    expect(r.ratings).not.toBeNull()   // con ratings se calcula el diferencial (el camino que lanzaba)
    expect(r.diferencial).not.toBeNull()
  })
})
