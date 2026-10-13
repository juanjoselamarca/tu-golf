import { describe, it, expect } from 'vitest'
import { actualizacionGarmin, type TarjetaGarminReimportada } from './import-garmin'

type Respuesta = { data?: unknown; error?: unknown }

/** Cliente falso: cada `from(tabla)` resuelve `porTabla[tabla]` al hacer await, sea cual sea la cadena. */
function fake(porTabla: Record<string, Respuesta>) {
  return {
    from(tabla: string) {
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
const TEE_AZUL = { nombre: 'Azul', genero: 'M', rating: 71.3, slope: 128, front_course_rating: 35.6, front_slope_rating: 126, back_course_rating: 35.7, back_slope_rating: 130 }
const dif = (gross: number, cr = 71.3, slope = 128) => parseFloat(((gross - cr) * 113 / slope).toFixed(2))

// 18 bogeys con un 11 en el hoyo 4 (par 5, SI 4): bruto 95; índice 12 → CH 13 → tope 8 → ajustado 92.
const scores = H18.map(h => PAR[h] + 1); scores[3] = 11
const tarjeta = (extra: Partial<TarjetaGarminReimportada> = {}): TarjetaGarminReimportada => ({
  course_name: 'Los Leones', course_id: 'c1', tee_color: 'azul', played_at: '2026-10-01',
  scores, total_gross: 95, holes_played: 18, import_confidence: 1, import_source: 'garmin_zip',
  par_per_hole: null, metadata: { garmin_scorecard_id: 'g1' }, ...extra,
})

describe('actualizacionGarmin — re-importar una tarjeta Garmin (#545)', () => {
  it('el UPDATE escribe el diferencial desde el gross ajustado y adjusted_gross (antes no recalculaba el diferencial)', async () => {
    const sb = fake({ course_tees: { data: [TEE_AZUL] }, course_holes: { data: CATALOGO } })
    const u = await actualizacionGarmin(sb as never, tarjeta(), { genero: 'M', indice: 12 })
    expect(u.adjusted_gross).toBe(92)
    expect(u.diferencial).toBe(dif(92))
    expect(u.course_rating).toBe(71.3)
    expect((u.metadata as { ajuste_whs?: { course_hcp: number } }).ajuste_whs?.course_hcp).toBe(13)
    expect((u.metadata as { garmin_scorecard_id?: string }).garmin_scorecard_id).toBe('g1')
  })

  it('sin cancha en el catálogo usa el CR/slope del archivo para el diferencial Y para el tope', async () => {
    const sb = fake({})
    const u = await actualizacionGarmin(sb as never, tarjeta({ course_id: null, course_rating: 70, slope_rating: 120, par_per_hole: Object.fromEntries(H18.map(h => [String(h), PAR[h]])) }), { genero: 'M', indice: 12 })
    // CH = 12 × 120/113 + (70 − 72) = 10.7 → 11; SI desconocido → tope holgado par + 2 + ceil(11/18) = 8
    expect(u.adjusted_gross).toBe(92)
    expect(u.diferencial).toBe(dif(92, 70, 120))
  })

  it('bola compartida: diferencial null', async () => {
    const sb = fake({ course_tees: { data: [TEE_AZUL] }, course_holes: { data: CATALOGO } })
    const u = await actualizacionGarmin(sb as never, tarjeta({ formato_juego: 'foursome' }), { genero: 'M', indice: 12 })
    expect(u.diferencial).toBeNull()
  })
})
