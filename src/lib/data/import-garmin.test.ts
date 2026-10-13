import { describe, it, expect, vi } from 'vitest'
import { actualizacionGarmin, fetchFilasGarminExistentes, type TarjetaGarminReimportada } from './import-garmin'
import { importRound } from '@/lib/import-round'
import { resolveCourse } from '@/lib/resolve-course'

vi.mock('@/lib/resolve-course', () => ({
  resolveCourse: vi.fn(async () => ({ courseId: null, courseCreated: false, holesPopulated: false, matchScore: null, warnings: [] })),
}))

type Respuesta = { data?: unknown; error?: unknown }

/** Cliente falso: cada `from(tabla)` resuelve `porTabla[tabla]` al hacer await, sea cual sea la cadena; captura los insert. */
function fake(porTabla: Record<string, Respuesta>) {
  const insertados: Record<string, unknown>[] = []
  return {
    insertados,
    from(tabla: string) {
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'insert') return (payload: Record<string, unknown>) => { insertados.push(payload); return proxy }
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
const TEE_BLANCO = { nombre: 'Blanco', genero: 'M', rating: 69.5, slope: 122, front_course_rating: 34.7, front_slope_rating: 121, back_course_rating: 34.8, back_slope_rating: 123 }
const TEE_AZUL = { nombre: 'Azul', genero: 'M', rating: 71.3, slope: 128, front_course_rating: 35.6, front_slope_rating: 126, back_course_rating: 35.7, back_slope_rating: 130 }
const dif = (gross: number, cr = 71.3, slope = 128) => parseFloat(((gross - cr) * 113 / slope).toFixed(2))

// 18 bogeys con un 11 en el hoyo 4 (par 5, SI 4): bruto 95; índice 12 → CH 13 → tope 8 → ajustado 92.
const scores = H18.map(h => PAR[h] + 1); scores[3] = 11
const tarjeta = (extra: Partial<TarjetaGarminReimportada> = {}): TarjetaGarminReimportada => ({
  course_name: 'Los Leones', course_id: 'c1', tee_color: 'azul', played_at: '2026-10-01',
  scores, total_gross: 95, holes_played: 18, import_confidence: 1, import_source: 'garmin_zip',
  par_per_hole: null, metadata: { garmin_scorecard_id: 'g1' }, ...extra,
})

const PERFIL = { genero: 'M', indice: 12, indice_golfers: null, default_tee_color: null }

describe('actualizacionGarmin — re-importar una tarjeta Garmin (#545)', () => {
  it('el UPDATE escribe el diferencial desde el gross ajustado y adjusted_gross (antes no recalculaba el diferencial)', async () => {
    const sb = fake({ course_tees: { data: [TEE_AZUL] }, course_holes: { data: CATALOGO } })
    const u = await actualizacionGarmin(sb as never, 'u1', tarjeta(), PERFIL, null)
    expect(u.adjusted_gross).toBe(92)
    expect(u.diferencial).toBe(dif(92))
    expect(u.course_rating).toBe(71.3)
    expect((u.metadata as { ajuste_whs?: { course_hcp: number } }).ajuste_whs?.course_hcp).toBe(13)
    expect((u.metadata as { garmin_scorecard_id?: string }).garmin_scorecard_id).toBe('g1')
  })

  it('tarjeta sin tee: usa el tee por defecto del usuario y queda IGUAL que la primera importación (importRound)', async () => {
    const perfil = { ...PERFIL, default_tee_color: 'azul' }
    const tablas = {
      course_tees: { data: [TEE_AZUL] }, course_holes: { data: CATALOGO },
      profiles: { data: perfil }, historical_rounds: { data: { id: 'h1' }, count: 1 },
    }
    const sinTee = tarjeta({ tee_color: null })
    const u = await actualizacionGarmin(fake(tablas) as never, 'u1', sinTee, perfil, null)
    const sb = fake(tablas)
    const r = await importRound(sb as never, {
      userId: 'u1', courseName: sinTee.course_name, courseId: sinTee.course_id, teeColor: null,
      parPerHole: null, scores: sinTee.scores, playedAt: sinTee.played_at, source: 'garmin',
      totalGross: sinTee.total_gross, metadata: sinTee.metadata, holesPlayed: 18,
    })
    expect(r.success).toBe(true)
    const fila = sb.insertados[0]
    expect(u.tee_color).toBe('azul')
    expect(u.course_rating).toBe(71.3)
    expect(u.diferencial).toBe(dif(92))
    for (const col of ['course_id', 'tee_color', 'course_rating', 'slope_rating', 'diferencial', 'adjusted_gross', 'par_per_hole'] as const) {
      expect(u[col], col).toEqual(fila[col])
    }
  })

  it('sin cancha resuelta no toca course_id ni tee_color (nunca null sobre un vínculo) ni usa el CR/slope del archivo', async () => {
    const sb = fake({})
    const conRatingsDelArchivo = { ...tarjeta({ course_id: null, tee_color: null }), course_rating: 70, slope_rating: 120 } as TarjetaGarminReimportada
    const u = await actualizacionGarmin(sb as never, 'u1', conRatingsDelArchivo, PERFIL, { course_id: null, tee_color: null })
    expect(vi.mocked(resolveCourse)).toHaveBeenCalled()
    expect(u).not.toHaveProperty('course_id')
    expect(u).not.toHaveProperty('tee_color')
    expect(u.course_rating).toBeNull()
    expect(u.slope_rating).toBeNull()
    expect(u.diferencial).toBeNull()
  })

  it('tee corregido en la app sobrevive al re-import: manda el de la fila y el diferencial sale de ESE tee', async () => {
    vi.mocked(resolveCourse).mockClear()
    const sb = fake({ course_tees: { data: [TEE_AZUL, TEE_BLANCO] }, course_holes: { data: CATALOGO } })
    // El archivo dice azul y otra cancha; la fila (corregida en la app) dice c1 / blanco.
    const u = await actualizacionGarmin(sb as never, 'u1', tarjeta({ course_id: null, tee_color: 'azul' }), PERFIL,
      { course_id: 'c1', tee_color: 'blanco' })
    expect(u.tee_color).toBe('blanco')
    expect(u.course_id).toBe('c1')
    expect(u.course_rating).toBe(69.5)
    expect(u.slope_rating).toBe(122)
    // Índice 12 en blanco: CH = 12 × 122/113 + (69.5 − 72) = 10.46 → 10 → tope hoyo 4 = 5+2+1 = 8 → ajustado 92.
    expect(u.adjusted_gross).toBe(92)
    expect(u.diferencial).toBe(dif(92, 69.5, 122))
    // Con la cancha de la fila no se resuelve por nombre (no se crean canchas).
    expect(vi.mocked(resolveCourse)).not.toHaveBeenCalled()
  })

  it('fetchFilasGarminExistentes: cancha y tee actuales por garmin_scorecard_id; lanza si la lectura falla', async () => {
    const ok = await fetchFilasGarminExistentes(fake({ historical_rounds: { data: [
      { garmin_scorecard_id: 'g1', course_id: 'c1', tee_color: 'blanco' },
    ] } }) as never, 'u1', ['g1'])
    expect(ok.get('g1')).toEqual({ course_id: 'c1', tee_color: 'blanco' })
    expect((await fetchFilasGarminExistentes(fake({}) as never, 'u1', [])).size).toBe(0)
    await expect(fetchFilasGarminExistentes(fake({ historical_rounds: { error: { message: 'x' } } }) as never, 'u1', ['g1']))
      .rejects.toThrow()
  })

  it('bola compartida: diferencial null', async () => {
    const sb = fake({ course_tees: { data: [TEE_AZUL] }, course_holes: { data: CATALOGO } })
    const u = await actualizacionGarmin(sb as never, 'u1', tarjeta({ formato_juego: 'foursome' }), PERFIL, null)
    expect(u.diferencial).toBeNull()
  })
})
