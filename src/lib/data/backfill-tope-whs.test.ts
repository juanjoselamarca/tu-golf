import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  entraAlBackfill,
  indiceDelDia,
  indiceGolfersAntesDe,
  recalcularTopeDeFila,
  sqlDelBackfill,
  differentialsBeforeBackfill,
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
  id: 'r1', user_id: 'u1', played_at: '2026-05-01', created_at: null, total_gross: 95, course_rating: 71.3, slope_rating: 128,
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
    expect(indiceDelDia({ historial, playedAt: '2026-08-01', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(8.6)
    expect(indiceDelDia({ historial, playedAt: '2026-07-31', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
    expect(indiceDelDia({ historial, playedAt: '2025-06-01', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
  })
  it('el día es el de Chile, no el UTC', () => {
    const h = [{ indice: 9.1, fecha: '2026-07-01T12:00:00Z' }, { indice: 8.6, fecha: '2026-08-02T02:00:00Z' }] // 01-ago 22:00 en Chile
    expect(indiceDelDia({ historial: h, playedAt: '2026-08-01', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(8.6)
    expect(indiceDelDia({ historial: h, playedAt: '2026-07-31', guardadaEn: null, federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
  })
  it('nunca un registro posterior a guardar la tarjeta: FedeGolf revisa el mismo día', () => {
    const h = [{ indice: 9.1, fecha: '2026-07-20T09:00:00Z' }, { indice: 8.6, fecha: '2026-07-26T23:00:00Z' }] // 26-jul 19:00 en Chile
    expect(indiceDelDia({ historial: h, playedAt: '2026-07-26', guardadaEn: '2026-07-26T21:00:00Z', federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
    expect(indiceDelDia({ historial: h, playedAt: '2026-07-26', guardadaEn: '2026-07-27T01:00:00Z', federadoActual: 5, golfersAntes: 20 })).toBe(8.6)
    // Importada semanas después: manda el fin del día de la ronda.
    expect(indiceDelDia({ historial: h, playedAt: '2026-07-25', guardadaEn: '2026-09-01T12:00:00Z', federadoActual: 5, golfersAntes: 20 })).toBe(9.1)
  })
  it('sin historial: federado del perfil → Golfers+ de las rondas anteriores → null (par + 5)', () => {
    expect(indiceDelDia({ historial: [], playedAt: '2026-08-01', guardadaEn: null, federadoActual: 24, golfersAntes: 10 })).toBe(24)
    expect(indiceDelDia({ historial: [], playedAt: '2026-08-01', guardadaEn: null, federadoActual: null, golfersAntes: 10 })).toBe(10)
    expect(indiceDelDia({ historial: [], playedAt: '2026-08-01', guardadaEn: null, federadoActual: null, golfersAntes: null })).toBeNull()
  })
})

describe('indiceGolfersAntesDe — nunca el índice que salió de esa misma ronda', () => {
  const r = (played_at: string, diferencial: number) => ({ id: `${played_at}/${diferencial}`, played_at, created_at: null, diferencial, slope_rating: 128, course_rating: 71.3, excluded_from_handicap: false, total_gross: 90, holes_played: 18 })
  it('sólo cuentan las fechas anteriores (no las del mismo día)', () => {
    const filas = [r('2026-01-01', 20), r('2026-02-01', 22), r('2026-03-01', 15), r('2026-03-01', 10)]
    expect(indiceGolfersAntesDe(filas, '2026-03-01')).toBeNull()   // 2 anteriores < 3
    expect(indiceGolfersAntesDe(filas, '2026-03-02')).toBe(9)      // best of 4 = 10, WHS adjustment -1.0
  })
})

describe('sqlDelBackfill — la escritura va como migración (CONVENCIONES_TECNICAS)', () => {
  const U = '11111111-1111-1111-1111-111111111111'
  const ID = '22222222-2222-2222-2222-222222222222'
  const res = (extra: Partial<Parameters<typeof sqlDelBackfill>[0][number]> = {}) => ({
    id: ID, user_id: U, played_at: '2026-05-01', estado: 'cambia' as const, hoyosTopados: 1,
    antes: { adjusted_gross: null, diferencial: 19.29 }, despues: { adjusted_gross: 92, diferencial: 16.666 },
    update: { adjusted_gross: 92, diferencial: 16.666, metadata: { nota: "O'Higgins", ajuste_whs: { indice: 12, nota: "d'x" } } },
    ...extra,
  })
  const antes = new Map([[ID, { id: ID, user_id: U, adjusted_gross: null, diferencial: 19.29, metadata: { nota: "O'Higgins" } }]])

  it('UPDATE condicionado a los valores leídos, diferencial a 2 decimales, sólo la clave ajuste_whs, comillas escapadas', () => {
    const { migracion, filas } = sqlDelBackfill([res()], antes)
    expect(filas).toBe(1)
    expect(migracion).toContain(`SET adjusted_gross = 92, diferencial = 16.67, `)
    expect(migracion).toContain(`WHERE id = '${ID}' AND diferencial IS NOT DISTINCT FROM 19.29 AND adjusted_gross IS NOT DISTINCT FROM NULL;`)
    expect(migracion).toContain(`jsonb_build_object('ajuste_whs', '{"indice":12,"nota":"d''x"}'::jsonb)`)
    expect(migracion).not.toContain('Higgins')   // la metadata viva no se pisa entera
    expect(migracion).toContain(`PERFORM public.calcular_indice_golfers('${U}'::uuid);`)
  })

  it('rollback: repone los valores de antes y quita ajuste_whs, sólo si la fila sigue como la dejó el backfill', () => {
    const { rollback } = sqlDelBackfill([res()], antes)
    expect(rollback).toContain(`SET adjusted_gross = NULL, diferencial = 19.29, metadata = (`)
    expect(rollback).toContain(`- 'ajuste_whs') WHERE id = '${ID}' AND diferencial IS NOT DISTINCT FROM 16.67 AND adjusted_gross IS NOT DISTINCT FROM 92;`)
    const conViejo = new Map([[ID, { ...antes.get(ID)!, metadata: { ajuste_whs: { indice: 9 } } }]])
    expect(sqlDelBackfill([res()], conViejo).rollback).toContain(`- 'ajuste_whs') || jsonb_build_object('ajuste_whs', '{"indice":9}'::jsonb)`)
  })

  it('diferencial que cambia: re-deriva las métricas del coach sólo si la fila se escribió (y el rollback las repone)', () => {
    const { migracion, rollback } = sqlDelBackfill([res()], antes)
    expect(migracion).toContain(`IF c > 0 THEN UPDATE public.round_metrics SET delta_vs_handicap_expected = floor((16.67 - handicap_at_time) * 10 + 0.5) / 10`)
    expect(migracion).toContain(`WHERE round_id = '${ID}' AND handicap_at_time IS NOT NULL; END IF;`)
    expect(rollback).toContain('floor((19.29 - handicap_at_time) * 10 + 0.5) / 10')
    const igual = res({ estado: 'igual', update: { adjusted_gross: 95, diferencial: 19.29, metadata: { ajuste_whs: {} } } })
    expect(sqlDelBackfill([igual], antes).migracion).not.toContain('round_metrics')
  })

  it('filas saltadas por edición concurrente: WARNING (db push no muestra NOTICE)', () => {
    expect(sqlDelBackfill([res()], antes).migracion).toContain("IF n < 1 THEN RAISE WARNING")
  })

  it('metadata NULL antes: el rollback la deja NULL otra vez (no {})', () => {
    const nula = new Map([[ID, { ...antes.get(ID)!, metadata: null }]])
    expect(sqlDelBackfill([res()], nula).rollback).toContain(`metadata = NULLIF(CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END - 'ajuste_whs', '{}'::jsonb) `)
  })

  it('filas sin update no entran; id que no es uuid o metadata con el delimitador: lanza', () => {
    expect(sqlDelBackfill([res({ update: null })], antes).filas).toBe(0)
    expect(() => sqlDelBackfill([res({ id: "x'; DROP TABLE t; --" })], new Map([["x'; DROP TABLE t; --", antes.get(ID)!]]))).toThrow()
    expect(() => sqlDelBackfill([res({ update: { adjusted_gross: 92, diferencial: 1, metadata: { ajuste_whs: { x: '$backfill_tope_whs$' } } } })], antes)).toThrow()
  })
})

describe('differentialsBeforeBackfill — rows a rollback restores, for --recompute-index', () => {
  const U = '11111111-1111-1111-1111-111111111111'
  const row = (id: string, diferencial: number | null) => ({ id, user_id: U, adjusted_gross: null, diferencial, metadata: null })
  const result = (id: string) => ({
    id, user_id: U, played_at: '2026-05-01', estado: 'cambia' as const, hoyosTopados: 1,
    antes: { adjusted_gross: null, diferencial: null }, despues: { adjusted_gross: 92, diferencial: 16.67 },
    update: { adjusted_gross: 92, diferencial: 16.67, metadata: { ajuste_whs: { indice: 12 } } },
  })

  it('reads back each row of the rollback sqlDelBackfill writes, with a NULL differential too', () => {
    const A = '22222222-2222-2222-2222-222222222222', B = '33333333-3333-3333-3333-333333333333'
    const { rollback } = sqlDelBackfill([result(A), result(B)], new Map([[A, row(A, 19.29)], [B, row(B, null)]]))
    expect(rollback).toContain('round_metrics')
    expect(differentialsBeforeBackfill(rollback)).toEqual(new Map([[A, 19.29], [B, null]]))
  })

  it('reads the 378 rows of the #555 rollback', () => {
    const rows = differentialsBeforeBackfill(readFileSync('supabase/migrations/rollback/20261014_backfill_tope_whs_545_rollback.sql', 'utf8'))
    expect(rows.size).toBe(378)
    expect(rows.get('56ca60c3-688a-4d63-afa6-f40b862bf5b1')).toBe(25.51)
  })
})
