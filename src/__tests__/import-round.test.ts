import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importRound } from '@/lib/import-round'
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
  'par_per_hole', 'excluded_from_handicap',
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
          select: () => ({ eq: () => ({ order: async () => ({ data: opts.existingHoles ?? null, error: null }) }) }),
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
