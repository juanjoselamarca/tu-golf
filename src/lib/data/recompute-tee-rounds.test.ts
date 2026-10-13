import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyDefaultTeeToRounds, recomputeRoundsFromCatalog } from './recompute-tee-rounds'
import { calcularDiferencial } from '@/lib/indice-golfers'

/**
 * Stub de supabase: el query de rondas y el de tees resuelven sus datos; los
 * .update() se capturan en `updates`. Evita tocar prod (mutaría rondas reales).
 */
function stub(roundsData: unknown[], teesData: unknown[], updates: Record<string, unknown>[]): SupabaseClient {
  return {
    from(table: string) {
      let updatePayload: Record<string, unknown> | null = null
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        is: () => b,
        not: () => b,
        update: (p: Record<string, unknown>) => {
          updatePayload = p
          return b
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (updatePayload) {
            updates.push(updatePayload)
            return Promise.resolve({ error: null }).then(resolve)
          }
          if (table === 'course_tees') return Promise.resolve({ data: teesData }).then(resolve)
          return Promise.resolve({ data: roundsData }).then(resolve)
        },
      }
      return b
    },
  } as unknown as SupabaseClient
}

const TEES = [
  { nombre: 'azul', genero: 'M', rating: 73.7, slope: 137, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null },
]

describe('applyDefaultTeeToRounds', () => {
  it('recomputa una ronda sin tee con el color por defecto (CR/slope + diferencial)', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub([{ id: 'r1', course_id: 'c1', total_gross: 90, holes_played: 18 }], TEES, updates)
    const n = await applyDefaultTeeToRounds(sb, 'u1', 'azul')
    expect(n).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].tee_color).toBe('azul')
    expect(updates[0].course_rating).toBe(73.7)
    expect(updates[0].slope_rating).toBe(137)
    expect(Number(updates[0].diferencial)).toBeCloseTo(calcularDiferencial(90, 73.7, 137, 18)!, 2)
  })

  it('sin rondas sin tee → 0 actualizaciones', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub([], TEES, updates)
    const n = await applyDefaultTeeToRounds(sb, 'u1', 'azul')
    expect(n).toBe(0)
    expect(updates).toHaveLength(0)
  })

  it('color que no matchea ningún tee → no actualiza (no inventa rating)', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub([{ id: 'r1', course_id: 'c1', total_gross: 90, holes_played: 18 }], TEES, updates)
    const n = await applyDefaultTeeToRounds(sb, 'u1', 'inexistente')
    expect(n).toBe(0)
    expect(updates).toHaveLength(0)
  })
})

// Tee real de Los Leones azul/M (course_tees prod, course 8f64cd3a, 2026-06-09):
// 18h 73.7/137, front-9 37.2/132. El front-9 manda el diferencial de 9h.
const TEES_LEONES_AZUL = [
  { nombre: 'azul', genero: 'M', rating: 73.7, slope: 137, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: 36.5, back_slope_rating: 142 },
]

describe('recomputeRoundsFromCatalog', () => {
  it('rondas idénticas (mismo score/tee/hoyos) con diferencial congelado distinto → todas re-derivan al MISMO valor del catálogo', async () => {
    // El bug reportado: 3 rondas Los Leones azul, 9h, score 38, con diferencial
    // congelado 0.70 / 1.37 / 2.24. Deben converger al único valor correcto.
    const updates: Record<string, unknown>[] = []
    const rounds = [
      { id: 'r1', course_id: 'leones', tee_color: 'azul', holes_played: 9, total_gross: 38, course_rating: 37.2, slope_rating: 132, diferencial: 0.70 },
      { id: 'r2', course_id: 'leones', tee_color: 'azul', holes_played: 9, total_gross: 38, course_rating: 73.3, slope_rating: 136, diferencial: 1.37 },
      { id: 'r3', course_id: 'leones', tee_color: 'azul', holes_played: 9, total_gross: 38, course_rating: 73.3, slope_rating: 136, diferencial: 2.24 },
    ]
    const sb = stub(rounds, TEES_LEONES_AZUL, updates)

    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: true, genero: null })

    // El valor canónico del catálogo (front-9 37.2/132, escalado a equivalente-18h).
    const esperado = calcularDiferencial(38, 73.7, 137, 9, { cr9h: 37.2, slope9h: 132 })!
    expect(esperado).toBeCloseTo(1.37, 2)

    // Las 3 rondas re-derivan al MISMO diferencial (consistencia = el fix).
    expect(result.rounds).toHaveLength(3)
    const distintos = new Set(result.rounds.map(r => r.after.diferencial))
    expect(distintos.size).toBe(1)
    for (const r of result.rounds) {
      expect(r.after.diferencial).toBeCloseTo(esperado, 2)
      expect(r.after.course_rating).toBe(73.7)
      expect(r.after.slope_rating).toBe(137)
    }

    // El diferencial cambia en las 2 que estaban mal (0.70 y 2.24); la de 1.37 ya
    // tenía el valor correcto. (El CR/slope 18h se corrige en las 3 pero es
    // cosmético en 9h: no entra al diferencial.)
    const cambiaronDif = result.rounds.filter(r => r.before.diferencial !== r.after.diferencial)
    expect(cambiaronDif).toHaveLength(2)

    // dryRun: NO escribe en la BD.
    expect(result.applied).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it('dryRun:false aplica el update (escribe CR/slope/diferencial del catálogo)', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'r1', course_id: 'leones', tee_color: 'azul', holes_played: 9, total_gross: 38, course_rating: 73.3, slope_rating: 136, diferencial: 2.24 }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(result.applied).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].course_rating).toBe(73.7)
    expect(updates[0].slope_rating).toBe(137)
    expect(Number(updates[0].diferencial)).toBeCloseTo(1.37, 2)
  })

  it('score físicamente imposible (46 en 18h) → implausible, no recomputa y SE EXCLUYE en apply', async () => {
    // Caso real (ronda c314a556 de Juanjo): 18h con total 46. Su diferencial NO se
    // recomputa (es absurdo), pero en apply debe EXCLUIRSE del handicap: si no, el
    // RPC lo tomaría como "el mejor" y hundiría el índice. Esa exclusión es la
    // única forma de que el endpoint repare el índice por sí solo.
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'bad', course_id: 'leones', tee_color: 'azul', holes_played: 18, total_gross: 46, course_rating: null, slope_rating: null, diferencial: null }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(result.implausible).toHaveLength(1)
    expect(result.implausible[0].id).toBe('bad')
    expect(result.rounds.find(r => r.id === 'bad')).toBeUndefined()
    expect(result.excludedImplausible).toBe(1)
    expect(result.failedUpdates).toBe(0)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual({ excluded_from_handicap: true })
  })

  it('implausible con diferencial congelado NEGATIVO → se excluye (no hunde el índice vía RPC)', async () => {
    // El escenario que corrompe de verdad: la ronda ya trae un diferencial
    // congelado absurdo (−22.85) del import. El recompute no lo toca; el apply
    // DEBE excluirla para que el RPC no la consuma como mejor diferencial.
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'frozen', course_id: 'leones', tee_color: 'azul', holes_played: 18, total_gross: 46, course_rating: 75.1, slope_rating: 142, diferencial: -22.85 }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(result.implausible.map(i => i.id)).toEqual(['frozen'])
    expect(result.excludedImplausible).toBe(1)
    expect(updates).toEqual([{ excluded_from_handicap: true }])
  })

  it('en dryRun una implausible se detecta pero NO se escribe nada', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'bad', course_id: 'leones', tee_color: 'azul', holes_played: 18, total_gross: 46, course_rating: null, slope_rating: null, diferencial: -22.85 }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: true, genero: null })
    expect(result.implausible).toHaveLength(1)
    expect(result.excludedImplausible).toBe(0)
    expect(updates).toHaveLength(0)
  })

  it('tee que no matchea el catálogo → unresolved, no se toca (no inventa rating)', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'r1', course_id: 'leones', tee_color: 'inexistente', holes_played: 9, total_gross: 38, course_rating: 73.3, slope_rating: 136, diferencial: 2.24 }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(result.resolved).toBe(0)
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].id).toBe('r1')
    expect(updates).toHaveLength(0)
  })
})

describe('recálculo del admin respeta la fuente única del diferencial (WHS 2.2, bola compartida)', () => {
  it('match de 9 decidido 5&4 (4 hoyos estimados por no jugarse): queda sin diferencial', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub([{
      id: 'r1', course_id: 'c1', total_gross: 40, holes_played: 9, formato_juego: 'match_play',
      metadata: { estimados: [1, 2, 3, 4].map(h => ({ hoyo: 5 + h, motivo: 'no_jugado' })) },
    }], TEES_LEONES_AZUL, updates)
    await applyDefaultTeeToRounds(sb, 'u1', 'azul')
    expect(updates[0].diferencial).toBeNull()
  })

  it('scramble: sin diferencial aunque haya ratings (el score es del equipo)', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub([{ id: 'r1', course_id: 'c1', total_gross: 70, holes_played: 18, formato_juego: 'scramble' }], TEES_LEONES_AZUL, updates)
    await applyDefaultTeeToRounds(sb, 'u1', 'azul')
    expect(updates[0].diferencial).toBeNull()
  })

  it('fila sin holes_played (columna NOT NULL; no debería existir): sin diferencial, no se adivina 9 vs 18', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub([{ id: 'r1', course_id: 'c1', total_gross: 90, holes_played: null }], TEES_LEONES_AZUL, updates)
    await applyDefaultTeeToRounds(sb, 'u1', 'azul')
    expect(updates[0].diferencial).toBeNull()
  })
})


/* ── Adjusted Gross Score WHS 3.1 (#545) ─────────────────────────────────── */

type Cadena = Array<[string, unknown[]]>
/** Cliente falso por tabla: el responder ve la cadena (p. ej. si terminó en maybeSingle). Captura los UPDATE. */
function fakeTablas(porTabla: Record<string, (c: Cadena) => { data?: unknown; error?: unknown }>) {
  const tablas: string[] = []
  const updates: Record<string, unknown>[] = []
  const sb = {
    from(tabla: string) {
      tablas.push(tabla)
      const cadena: Cadena = []
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (ok: (v: unknown) => unknown) => {
            const up = cadena.find(c => c[0] === 'update')
            if (up) { updates.push(up[1][0] as Record<string, unknown>); return Promise.resolve({ data: [{ id: 'x' }], error: null }).then(ok) }
            return Promise.resolve({ data: null, error: null, ...(porTabla[tabla]?.(cadena) ?? {}) }).then(ok)
          }
          return (...args: unknown[]) => { cadena.push([String(prop), args]); return proxy }
        },
      })
      return proxy
    },
  }
  return { sb: sb as unknown as SupabaseClient, tablas, updates }
}

describe('Adjusted Gross Score WHS 3.1 en el recálculo (#545)', () => {
  const PAR = [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 3, 4, 4, 5, 5]
  const H18 = PAR.map((_, i) => i + 1)
  const TEE_AZUL = { nombre: 'azul', genero: 'M', rating: 71.3, slope: 128, front_course_rating: 35.6, front_slope_rating: 126, back_course_rating: 35.7, back_slope_rating: 130 }
  const scores = PAR.map(p => p + 1); scores[3] = 11 // 11 en el par 5 de SI 4
  const bruto = scores.reduce((a, b) => a + b, 0)
  const ronda = (extra: Record<string, unknown> = {}) => ({
    id: 'r1', course_id: 'c1', tee_color: 'azul', holes_played: 18, total_gross: bruto, course_rating: 71.3, slope_rating: 128, diferencial: null,
    scores, par_per_hole: Object.fromEntries(PAR.map((p, i) => [String(i + 1), p])), metadata: { hoyos: H18 },
    formato_juego: 'stroke_play', import_source: null, adjusted_gross: null, ...extra,
  })
  const tablas = (fila: Record<string, unknown>) => fakeTablas({
    historical_rounds: () => ({ data: [fila] }),
    course_tees: c => ({ data: c.some(x => x[0] === 'maybeSingle') ? TEE_AZUL : [TEE_AZUL] }),
    course_holes: () => ({ data: H18.map(n => ({ numero: n, par: PAR[n - 1], stroke_index: n, recorrido: null })) }),
    courses: () => ({ data: { slope_rating: 128, course_rating: 71.3, par_total: 72 } }),
    profiles: () => ({ data: { indice: 12, indice_golfers: null } }),
  })

  it('recomputeRoundsFromCatalog topa el 11 a 8 (índice 12 → CH 13) y escribe adjusted_gross + metadata.ajuste_whs', async () => {
    const { sb, updates } = tablas(ronda())
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(result.rounds[0].after.adjusted_gross).toBe(bruto - 3)
    expect(result.rounds[0].after.diferencial).toBeCloseTo(((bruto - 3) - 71.3) * 113 / 128, 1)
    expect(updates).toHaveLength(1)
    expect(updates[0].adjusted_gross).toBe(bruto - 3)
    expect((updates[0].metadata as { ajuste_whs: { hoyos_topados: unknown } }).ajuste_whs.hoyos_topados).toEqual([{ hoyo: 4, gross: 11, tope: 8 }])
  })

  it('applyDefaultTeeToRounds también usa el bruto ajustado', async () => {
    const { sb, updates } = tablas(ronda({ tee_color: null }))
    expect(await applyDefaultTeeToRounds(sb, 'u1', 'azul')).toBe(1)
    expect(updates[0].adjusted_gross).toBe(bruto - 3)
    expect(Number(updates[0].diferencial)).toBeCloseTo(((bruto - 3) - 71.3) * 113 / 128, 1)
  })

  it('el recálculo NO reutiliza el course handicap guardado (el catálogo pudo cambiar), sí el índice del día', async () => {
    const previo = { course_hcp: 10, indice: 12, si_fuente: 'catalogo', hoyos_topados: [], hoyos_sin_par: [], tee: 'azul', hoyos_reparto: 18 }
    const { sb, updates } = tablas(ronda({ metadata: { hoyos: H18, ajuste_whs: previo } }))
    await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    // Con el catálogo de hoy (128/71.3) e índice 12 el CH es 13, no el 10 guardado.
    expect((updates[0].metadata as { ajuste_whs: Record<string, unknown> }).ajuste_whs).toMatchObject({ course_hcp: 13, indice: 12 })
    expect(updates[0].adjusted_gross).toBe(bruto - 3)
  })

  it('género F: el CH del tope sale de la MISMA fila de course_tees que los ratings del diferencial (M y F con igual nombre)', async () => {
    const M = { ...TEE_AZUL, genero: 'M' }
    const F = { ...TEE_AZUL, genero: 'F', rating: 74.5, slope: 136 }
    const { sb, updates } = fakeTablas({
      historical_rounds: () => ({ data: [ronda()] }),
      // resolverCourseData (ilike + limit 1, sin ORDER BY) devolvería la fila M.
      course_tees: c => ({ data: c.some(x => x[0] === 'maybeSingle') ? M : [M, F] }),
      course_holes: () => ({ data: H18.map(n => ({ numero: n, par: PAR[n - 1], stroke_index: n, recorrido: null })) }),
      courses: () => ({ data: { slope_rating: 128, course_rating: 71.3, par_total: 72 } }),
      profiles: () => ({ data: { indice: 12, indice_golfers: null } }),
    })
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: 'F' })
    expect(result.rounds[0].after.course_rating).toBe(74.5)
    // CH F = round(12 × 136/113 + (74.5 − 72)) = 17 (con la fila M saldría 13).
    expect((updates[0].metadata as { ajuste_whs: Record<string, unknown> }).ajuste_whs).toMatchObject({ course_hcp: 17 })
  })

  it('FedeGolf nunca se topa: adjusted_gross null y ni siquiera se lee el índice', async () => {
    const { sb, updates, tablas: leidas } = tablas(ronda({ import_source: 'fedegolf' }))
    await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(leidas).not.toContain('profiles')
    expect(leidas).not.toContain('course_holes')
    expect(updates[0]?.adjusted_gross ?? null).toBeNull()
  })
})

describe('selects del recálculo (#545 P2-b)', () => {
  it('no repiten columnas', async () => {
    const selects: string[] = []
    const sb = {
      from() {
        const proxy: Record<string, unknown> = new Proxy({}, {
          get(_t, prop) {
            if (prop === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
            return (...args: unknown[]) => { if (prop === 'select') selects.push(String(args[0])); return proxy }
          },
        })
        return proxy
      },
    } as unknown as SupabaseClient
    await applyDefaultTeeToRounds(sb, 'u1', 'azul')
    await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: true, genero: null })
    expect(selects).toHaveLength(2)
    for (const s of selects) {
      const cols = s.split(',').map(c => c.trim())
      expect(cols.length).toBe(new Set(cols).size)
    }
  })
})
