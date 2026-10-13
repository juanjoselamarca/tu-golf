import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importRound, metadataDelImport, tarjetaDelFormularioManual, tarjetaDelImport } from '@/lib/import-round'
import { hoyosConGolpes } from '@/golf/core/hoyos-jugados'
import { esScoreDe9Disperso } from '@/golf/core/ajuste-whs'
import * as fs from 'fs'
import * as path from 'path'
import * as resolveCourseModule from '@/lib/resolve-course'

vi.mock('@/lib/resolve-course')

// Columnas REALES de `historical_rounds` (information_schema, jun-2026).
// El mock las usa para simular el error 42703 de Postgres si el código intenta
// escribir una columna inexistente — exactamente el bug que dejó a un usuario
// nuevo con 0 de 125 rondas importadas (se escribía `source` en vez de
// `import_source`). Mantener sincronizada con la tabla si se agregan columnas.
const HISTORICAL_ROUNDS_COLUMNS = new Set([
  'id', 'user_id', 'course_name', 'tee_color', 'played_at', 'scores',
  'total_gross', 'notes', 'privacy', 'created_at', 'total_neto',
  'total_stableford', 'course_id', 'import_confidence', 'holes_played',
  'import_source', 'course_rating', 'slope_rating', 'metadata',
  'garmin_scorecard_id', 'diferencial', 'formato_juego', 'modo_juego',
  'par_per_hole', 'excluded_from_handicap', 'adjusted_gross',
])

function mockSupabase(opts: { courseId?: string; existingHoles?: Array<{ numero: number; par: number }>; profileIndice?: number; insertId?: string; capture?: { payload?: Record<string, unknown> } }) {
  const mock: any = {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { indice: opts.profileIndice ?? null }, error: null }) }) }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        }
      }
      if (table === 'course_holes') {
        return {
          // Forma de `fetchHoyosDeLaRonda`: .eq(course_id).order(recorrido).order(numero).
          select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: opts.existingHoles ?? null, error: null }) }) }) }),
        }
      }
      if (table === 'courses') {
        return {
          select: () => ({ eq: () => ({ limit: async () => ({ data: opts.courseId ? [{ id: opts.courseId }] : null, error: null }) }) }),
        }
      }
      if (table === 'historical_rounds') {
        return {
          insert: (payload: Record<string, unknown>) => {
            if (opts.capture) opts.capture.payload = payload
            // Simular Postgres: columna inexistente → error 42703 (no lanza,
            // devuelve { error } como supabase-js).
            const unknownCol = Object.keys(payload).find(k => !HISTORICAL_ROUNDS_COLUMNS.has(k))
            if (unknownCol) {
              const error = { code: '42703', message: `column "${unknownCol}" of relation "historical_rounds" does not exist` }
              return { select: () => ({ single: async () => ({ data: null, error }) }) }
            }
            return { select: () => ({ single: async () => ({ data: { id: opts.insertId ?? 'inserted-id' }, error: null }) }) }
          },
          select: () => ({ eq: async () => ({ count: 0, error: null }) }),
        }
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }
    }),
  }
  return mock
}

describe('importRound — integración con resolveCourse', () => {
  beforeEach(() => {
    vi.mocked(resolveCourseModule.resolveCourse).mockReset()
  })

  it('persiste par_per_hole desde input cuando viene del OCR', async () => {
    vi.mocked(resolveCourseModule.resolveCourse).mockResolvedValue({
      courseId: 'course-123',
      courseCreated: false,
      holesPopulated: false,
      matchScore: 0.95,
      warnings: [],
    })

    const supabase = mockSupabase({})

    const result = await importRound(supabase as any, {
      userId: 'user-1',
      courseName: 'Los Leones',
      parPerHole: { '1': 4, '2': 4, '3': 3, '4': 5, '5': 4, '6': 3, '7': 4, '8': 4, '9': 5, '10': 4, '11': 3, '12': 4, '13': 4, '14': 3, '15': 4, '16': 4, '17': 5, '18': 5 },
      scores: [4,4,3,5,4,3,4,4,5,4,3,4,4,3,4,4,5,5],
      playedAt: '2026-05-13',
      source: 'photo_scan',
    })

    expect(result.success).toBe(true)
  })

  it('llama resolveCourse cuando courseId no viene en input', async () => {
    vi.mocked(resolveCourseModule.resolveCourse).mockResolvedValue({
      courseId: 'resolved-id',
      courseCreated: false,
      holesPopulated: false,
      matchScore: 0.9,
      warnings: [],
    })

    const supabase = mockSupabase({})
    await importRound(supabase as any, {
      userId: 'user-1',
      courseName: 'Cancha X',
      scores: [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
      playedAt: '2026-05-13',
      source: 'manual',
    })

    expect(resolveCourseModule.resolveCourse).toHaveBeenCalledWith(
      expect.objectContaining({ courseName: 'Cancha X' })
    )
  })

  it('no llama resolveCourse cuando courseId ya viene en input', async () => {
    const supabase = mockSupabase({ existingHoles: [] })
    await importRound(supabase as any, {
      userId: 'user-1',
      courseId: 'predefined-id',
      courseName: 'Cancha X',
      scores: [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
      playedAt: '2026-05-13',
      source: 'manual',
    })

    expect(resolveCourseModule.resolveCourse).not.toHaveBeenCalled()
  })

  // Regresión P0 (jun-2026): un usuario nuevo intentó importar 125 rondas 3 veces
  // y se guardaron 0 porque importRound escribía la columna `source` (inexistente)
  // en vez de `import_source` → Postgres 42703 → success:false silencioso.
  it('escribe la columna import_source (NO source) y persiste la ronda', async () => {
    const capture: { payload?: Record<string, unknown> } = {}
    const supabase = mockSupabase({ capture })

    const result = await importRound(supabase as any, {
      userId: 'user-1',
      courseId: 'predefined-id',
      courseName: 'Los Leones',
      scores: [4,5,4,6,5,4,4,5,7],
      playedAt: '2026-06-05',
      source: 'garmin',
    })

    // El insert debe tener éxito: si escribiera `source` el mock simula 42703.
    expect(result.success).toBe(true)
    expect(capture.payload).toBeDefined()
    expect(capture.payload).toHaveProperty('import_source', 'garmin')
    expect(capture.payload).not.toHaveProperty('source')
  })

  it('falla con warning claro si el insert intenta una columna inexistente (guardia 42703)', async () => {
    // Verifica que el guardia del mock realmente atrapa columnas inválidas,
    // para que el test anterior no sea un falso verde.
    const supabase = mockSupabase({})
    const badInsert = supabase.from('historical_rounds').insert({ source: 'x' })
    const { error } = await badInsert.select().single()
    expect(error?.code).toBe('42703')
  })
})

// ─── #545 — diferencial desde el Adjusted Gross Score (WHS 3.1) ──────────────

type Respuesta = { data?: unknown; error?: unknown; count?: number }

/** Cliente falso: cada `from(tabla)` resuelve `porTabla[tabla]` al hacer await; captura los insert. */
function fakeConCatalogo(porTabla: Record<string, Respuesta>, insertados: Record<string, unknown>[]) {
  return {
    rpc: async () => ({ data: null, error: null }),
    from(tabla: string) {
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null, ...(porTabla[tabla] ?? {}) }).then(ok, ko)
          if (prop === 'insert') return (payload: Record<string, unknown>) => {
            insertados.push(payload)
            return new Proxy({}, { get: (_x, p) => p === 'then'
              ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: { id: 'nueva' }, error: null }).then(ok)
              : () => proxy })
          }
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
const PERFIL = { indice: 12, indice_golfers: null, default_tee_color: null, genero: 'M' }
const tablas = (extra: Record<string, Respuesta> = {}) => ({
  profiles: { data: PERFIL }, course_holes: { data: CATALOGO }, course_tees: { data: [TEE_AZUL] },
  historical_rounds: { count: 1 }, ...extra,
})
// 18 bogeys (90) con un 11 en el hoyo 4 (par 5, SI 4): bruto 95. CH 13 → tope 8 → ajustado 92.
const conUnOnce = () => { const s = H18.map(h => PAR[h] + 1); s[3] = 11; return s }
const dif = (gross: number) => parseFloat(((gross - 71.3) * 113 / 128).toFixed(2))

describe('importRound — Adjusted Gross Score (WHS 3.1, #545)', () => {
  it('el diferencial sale del gross ajustado de la MISMA fila y escribe adjusted_gross + metadata.ajuste_whs', async () => {
    const insertados: Record<string, unknown>[] = []
    const sb = fakeConCatalogo(tablas(), insertados)
    const r = await importRound(sb as never, {
      userId: 'u1', courseId: 'c1', courseName: 'Los Leones', teeColor: 'azul',
      scores: conUnOnce(), playedAt: '2026-10-01', source: 'photo_scan',
    })
    expect(r.success).toBe(true)
    const fila = insertados[0]
    expect(fila.total_gross).toBe(95)
    expect(fila.adjusted_gross).toBe(92)
    expect(fila.diferencial).toBe(dif(92))
    expect((fila.metadata as { ajuste_whs?: { course_hcp: number; hoyos_topados: unknown[] } }).ajuste_whs)
      .toMatchObject({ course_hcp: 13, hoyos_topados: [{ hoyo: 4, gross: 11, tope: 8 }] })
    expect(fila).not.toHaveProperty('total_stableford')
  })

  it('sin índice en el perfil: tope par + 5 (Regla 3.1a), nunca el índice inventado', async () => {
    const insertados: Record<string, unknown>[] = []
    const sb = fakeConCatalogo(tablas({ profiles: { data: { ...PERFIL, indice: null } } }), insertados)
    await importRound(sb as never, {
      userId: 'u1', courseId: 'c1', courseName: 'Los Leones', teeColor: 'azul',
      scores: conUnOnce(), playedAt: '2026-10-01', source: 'photo_scan',
    })
    // tope del hoyo 4 = 5 + 5 = 10 → ajustado 94
    expect(insertados[0].adjusted_gross).toBe(94)
    expect(insertados[0].diferencial).toBe(dif(94))
  })

  it('índice Golfers+ cuando el perfil no tiene índice oficial', async () => {
    const insertados: Record<string, unknown>[] = []
    const sb = fakeConCatalogo(tablas({ profiles: { data: { ...PERFIL, indice: null, indice_golfers: 12 } } }), insertados)
    await importRound(sb as never, {
      userId: 'u1', courseId: 'c1', courseName: 'Los Leones', teeColor: 'azul',
      scores: conUnOnce(), playedAt: '2026-10-01', source: 'photo_scan',
    })
    expect(insertados[0].adjusted_gross).toBe(92)
  })

  it('bola compartida (scramble): diferencial null, como en la ronda libre', async () => {
    const insertados: Record<string, unknown>[] = []
    const sb = fakeConCatalogo(tablas(), insertados)
    await importRound(sb as never, {
      userId: 'u1', courseId: 'c1', courseName: 'Los Leones', teeColor: 'azul', formatoJuego: 'scramble',
      scores: conUnOnce(), playedAt: '2026-10-01', source: 'photo_scan',
    })
    expect(insertados[0].diferencial).toBeNull()
    expect(insertados[0].adjusted_gross).toBeNull()
  })

  it('back 9 (metadata.hoyos 10..18): el reparto usa los hoyos reales', async () => {
    const insertados: Record<string, unknown>[] = []
    const sb = fakeConCatalogo(tablas(), insertados)
    const hoyos = H18.slice(9)
    const scores = hoyos.map(h => PAR[h] + 1); scores[7] = 12 // hoyo 17, par 5
    await importRound(sb as never, {
      userId: 'u1', courseId: 'c1', courseName: 'Los Leones', teeColor: 'azul',
      scores, playedAt: '2026-10-01', source: 'manual', metadata: { hoyos },
    })
    const aj = (insertados[0].metadata as { ajuste_whs: { hoyos_topados: Array<{ hoyo: number }>; si_fuente: string } }).ajuste_whs
    expect(aj.si_fuente).toBe('catalogo')
    expect(aj.hoyos_topados.map(h => h.hoyo)).toEqual([17])
  })
})

describe('tarjetaDelFormularioManual', () => {
  const vacias = (): (number | null)[] => Array(18).fill(null)
  it('18 casillas llenas → 18 scores, hoyos 1..18', () => {
    const t = tarjetaDelFormularioManual(H18.map(() => 5))
    expect(t?.scores).toHaveLength(18)
    expect(t?.hoyos).toEqual(H18)
  })
  it('back 9 → 9 scores con los hoyos 10..18', () => {
    const c = vacias(); for (let i = 9; i < 18; i++) c[i] = 5
    expect(tarjetaDelFormularioManual(c)).toEqual({ scores: Array(9).fill(5), hoyos: H18.slice(9) })
  })
  it('10 a 17 hoyos → null (una tarjeta a medias bajaría el diferencial)', () => {
    const c = vacias(); for (let i = 0; i < 12; i++) c[i] = 5
    expect(tarjetaDelFormularioManual(c)).toBeNull()
  })
})

describe('tarjetaDelImport — golpes por número real de hoyo (#545 revisión 2 P2-d)', () => {
  const por = (hoyos: number[], g = 5) => Object.fromEntries(hoyos.map(h => [String(h), g]))
  const PAR18 = Object.fromEntries(H18.map(h => [String(h), h % 3 === 0 ? 3 : 4]))
  it('18 hoyos 1..18: posicional como antes, sin metadata.hoyos', () => {
    const t = tarjetaDelImport(por(H18), PAR18)
    expect(t.scores).toHaveLength(18)
    expect(t.hoyos).toBeNull()
    expect(t.parPerHole).toEqual(PAR18)
  })
  it('back 9 (claves 10..18): 9 golpes con hoyos 10..18 y par re-numerado a posiciones (antes: 0 golpes)', () => {
    const t = tarjetaDelImport(por(H18.slice(9)), PAR18)
    expect(t.scores).toEqual(Array(9).fill(5))
    expect(t.hoyos).toEqual(H18.slice(9))
    expect(t.parPerHole).toEqual(Object.fromEntries(H18.slice(9).map((h, i) => [String(i + 1), PAR18[String(h)]])))
  })
  it('par ya posicional (claves 1..9) en un back 9: se deja como vino', () => {
    const par9 = Object.fromEntries(H18.slice(0, 9).map(h => [String(h), 4]))
    expect(tarjetaDelImport(por(H18.slice(9)), par9).parPerHole).toEqual(par9)
  })
  it('9 hoyos de las dos mitades: guarda sus números, así esScoreDe9Disperso los ve (antes se compactaban a 1..5)', () => {
    const t = tarjetaDelImport(por([1, 2, 3, 4, 5, 10, 11, 12, 13]), null)
    expect(t.hoyos).toEqual([1, 2, 3, 4, 5, 10, 11, 12, 13])
    expect(esScoreDe9Disperso(9, hoyosConGolpes(t.scores, t.hoyos))).toBe(true)
  })
  it('metadataDelImport: el hoyos lo decide el servidor, nunca el cliente (#545)', () => {
    const cliente = { putts: 30, hoyos: [10, 11, 12] }
    expect(metadataDelImport(cliente, { hoyos: null })).toEqual({ putts: 30 })
    expect(metadataDelImport(cliente, { hoyos: [10, 11] })).toEqual({ putts: 30, hoyos: [10, 11] })
    expect(metadataDelImport(null, { hoyos: null })).toEqual({})
  })
  it('el confirm del import arma la tarjeta con tarjetaDelImport, no leyendo las claves 1..N', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/app/api/import/confirm/route.ts'), 'utf-8')
    expect(src).toContain('tarjetaDelImport(round.scores, round.par_per_hole)')
    expect(src).toContain('metadataDelImport(round.metadata, tarjeta)')
    expect(src).not.toMatch(/for \(let h = 1; h <= holeCount/)
  })
})
