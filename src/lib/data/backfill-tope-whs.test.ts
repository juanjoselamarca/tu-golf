import { describe, it, expect } from 'vitest'
import {
  entraAlBackfill,
  indiceDelDia,
  indiceGolfersAntesDe,
  recalcularTopeDeFila,
  ultimosVeinte,
  type FilaBackfillTope,
} from './backfill-tope-whs'
import { calcularDiferencial } from '@/lib/indice-golfers'

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

const PAR: Record<number, number> = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5, 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
const H18 = Array.from({ length: 18 }, (_, i) => i + 1)
const CATALOGO = H18.map(n => ({ numero: n, par: PAR[n], stroke_index: n, recorrido: null }))
const TEE = { nombre: 'Azul', genero: 'M', rating: 71.3, slope: 128, front_course_rating: 35.6, front_slope_rating: 126, back_course_rating: 35.7, back_slope_rating: 130 }
const sb = () => fake({ course_holes: { data: CATALOGO }, course_tees: { data: [TEE] } }) as never

// 18 bogeys con un 11 en el hoyo 4 (par 5, SI 4): bruto 95. Índice 12 → CH 13 → tope 8 → ajustado 92.
const scores = H18.map(h => PAR[h] + 1); scores[3] = 11
const difBruto = calcularDiferencial(95, 71.3, 128)
const fila = (extra: Partial<FilaBackfillTope> = {}): FilaBackfillTope => ({
  id: 'r1', user_id: 'u1', played_at: '2026-05-01', total_gross: 95, course_rating: 71.3, slope_rating: 128,
  diferencial: difBruto, adjusted_gross: null, excluded_from_handicap: false,
  course_id: 'c1', tee_color: 'azul', holes_played: 18, scores, par_per_hole: null, metadata: {},
  formato_juego: 'stroke_play', import_source: 'garmin_zip', ...extra,
})

describe('recalcularTopeDeFila — tope WHS 3.1 sobre una fila guardada (#545)', () => {
  it('topa el hoyo y baja el diferencial; escribe adjusted_gross, diferencial y ajuste_whs', async () => {
    const r = await recalcularTopeDeFila(sb(), fila(), 12, new Map())
    expect(r.estado).toBe('cambia')
    expect(r.despues).toEqual({ adjusted_gross: 92, diferencial: calcularDiferencial(92, 71.3, 128) })
    expect(r.update?.adjusted_gross).toBe(92)
    expect((r.update?.metadata as { ajuste_whs: { indice: number } }).ajuste_whs.indice).toBe(12)
  })

  it('sin índice: par + 5 (el 11 en un par 5 queda en 10)', async () => {
    const r = await recalcularTopeDeFila(sb(), fila(), null, new Map())
    expect(r.despues.adjusted_gross).toBe(94)
    expect(r.despues.diferencial).toBe(calcularDiferencial(94, 71.3, 128))
  })

  it('ningún hoyo sobre el tope: estado igual, se guarda adjusted_gross = bruto', async () => {
    const bogeys = H18.map(h => PAR[h] + 1)
    const r = await recalcularTopeDeFila(sb(), fila({ scores: bogeys, total_gross: 90, diferencial: calcularDiferencial(90, 71.3, 128) }), 12, new Map())
    expect(r.estado).toBe('igual')
    expect(r.update?.adjusted_gross).toBe(90)
    expect(r.despues.diferencial).toBe(calcularDiferencial(90, 71.3, 128))
  })

  it('diferencial guardado que no sale del bruto (otra regla, otro rating): no se toca', async () => {
    const r = await recalcularTopeDeFila(sb(), fila({ diferencial: 30 }), 12, new Map())
    expect(r.estado).toBe('no_reproducible')
    expect(r.update).toBeNull()
  })

  it('ratings guardados distintos del catálogo pero que reproducen el diferencial: usa los guardados', async () => {
    const r = await recalcularTopeDeFila(sb(), fila({ course_rating: 70, slope_rating: 120, diferencial: calcularDiferencial(95, 70, 120) }), 12, new Map())
    expect(r.estado).toBe('cambia')
    expect(r.despues.diferencial).toBe(calcularDiferencial(r.despues.adjusted_gross!, 70, 120))
  })

  it('fila sin diferencial: guarda el gross ajustado pero NUNCA crea un diferencial (no hace contar rondas nuevas)', async () => {
    const r = await recalcularTopeDeFila(sb(), fila({ diferencial: null }), 12, new Map())
    expect(r.despues.diferencial).toBeNull()
    expect(r.update?.diferencial).toBeNull()
    expect(r.despues.adjusted_gross).toBeLessThan(95)
  })

  it('idempotente: una fila ya topada igual no se re-escribe', async () => {
    const primera = await recalcularTopeDeFila(sb(), fila(), 12, new Map())
    const topada = fila({ adjusted_gross: 92, diferencial: primera.despues.diferencial, metadata: primera.update!.metadata as FilaBackfillTope['metadata'] })
    const segunda = await recalcularTopeDeFila(sb(), topada, 12, new Map())
    expect(segunda.estado).toBe('cambia')   // se reproduce desde el adjusted_gross guardado, no cae en no_reproducible
    expect(segunda.update).toBeNull()
    expect(segunda.despues).toEqual(primera.despues)
  })

  it('golpes por hoyo que no suman total_gross (hoyo ilegible): no se toca, nunca baja el diferencial', async () => {
    const conHueco = [...scores]; conHueco[0] = null as never   // el total de la tarjeta sí trae ese hoyo
    const r = await recalcularTopeDeFila(sb(), fila({ scores: conHueco }), 12, new Map())
    expect(r.estado).toBe('bruto_no_calza')
    expect(r.update).toBeNull()
  })

  it('sin hoyos sobre el tope y diferencial guardado con otro redondeo: queda el guardado', async () => {
    const bogeys = H18.map(h => PAR[h] + 1)
    const guardado = calcularDiferencial(90, 71.3, 128)! + 0.03
    const r = await recalcularTopeDeFila(sb(), fila({ scores: bogeys, total_gross: 90, diferencial: guardado }), 12, new Map())
    expect(r.estado).toBe('igual')
    expect(r.update?.diferencial).toBe(guardado)
  })

  it('bola compartida: sin tope, no se toca', async () => {
    const r = await recalcularTopeDeFila(sb(), fila({ formato_juego: 'scramble', diferencial: null }), 12, new Map())
    expect(r.estado).toBe('sin_tope')
    expect(r.update).toBeNull()
  })
})

describe('entraAlBackfill', () => {
  it('FedeGolf, sin golpes por hoyo, golpes en formato objeto y excluidas: no', () => {
    expect(entraAlBackfill(fila())).toBe(true)
    expect(entraAlBackfill(fila({ import_source: 'fedegolf' }))).toBe(false)
    expect(entraAlBackfill(fila({ scores: null }))).toBe(false)
    expect(entraAlBackfill(fila({ scores: [] }))).toBe(false)
    expect(entraAlBackfill(fila({ scores: { 1: 4 } as never }))).toBe(false)
    expect(entraAlBackfill(fila({ excluded_from_handicap: true }))).toBe(false)
  })
})

describe('indiceDelDia — índice vigente ANTES de la ronda', () => {
  const historial = [{ indice: 9.1, fecha: '2026-01-01T12:00:00Z' }, { indice: 8.6, fecha: '2026-08-01T12:00:00Z' }]
  it('federado: el registro más reciente hasta ese día; anterior a todos → el primero', () => {
    expect(indiceDelDia({ historial, playedAt: '2026-08-01', federadoActual: 5, golfersAntes: 20 })).toBe(8.6)
    expect(indiceDelDia({ historial, playedAt: '2026-07-31', federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
    expect(indiceDelDia({ historial, playedAt: '2025-06-01', federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
  })
  it('sin historial: federado del perfil → Golfers+ de las rondas anteriores → null (par + 5)', () => {
    expect(indiceDelDia({ historial: [], playedAt: '2026-08-01', federadoActual: 24, golfersAntes: 10 })).toBe(24)
    expect(indiceDelDia({ historial: [], playedAt: '2026-08-01', federadoActual: null, golfersAntes: 10 })).toBe(10)
    expect(indiceDelDia({ historial: [], playedAt: '2026-08-01', federadoActual: null, golfersAntes: null })).toBeNull()
  })
})

describe('indiceGolfersAntesDe — nunca el índice que salió de esa misma ronda', () => {
  const r = (played_at: string, diferencial: number) => ({ played_at, diferencial, slope_rating: 128, course_rating: 71.3 })
  it('sólo cuentan las fechas anteriores (no las del mismo día)', () => {
    const filas = [r('2026-01-01', 20), r('2026-02-01', 22), r('2026-03-01', 15), r('2026-03-01', 10)]
    expect(indiceGolfersAntesDe(filas, '2026-03-01')).toBeNull()   // 2 anteriores < 3
    expect(indiceGolfersAntesDe(filas, '2026-03-02')).toBe(9.6)    // mejor de 4 = 10 × 0.96
  })
  it('ultimosVeinte: mismo filtro que calcular_indice_golfers (sin slope/CR o excluida no cuenta; 20 más recientes)', () => {
    const muchas = Array.from({ length: 25 }, (_, i) => r(`2026-01-${String(i + 1).padStart(2, '0')}`, i))
    expect(ultimosVeinte(muchas)).toHaveLength(20)
    expect(ultimosVeinte(muchas)).not.toContain(0)
    expect(ultimosVeinte([{ ...r('2026-01-01', 5), slope_rating: null }, { ...r('2026-01-02', 6), excluded_from_handicap: true }])).toEqual([])
  })
})
