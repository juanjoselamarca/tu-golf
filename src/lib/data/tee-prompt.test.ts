import { describe, it, expect } from 'vitest'
import { getTeePromptStatus } from './tee-prompt'
import type { TeeRow } from '@/golf/courses/tee-resolver'

/**
 * Red de seguridad del tee por defecto: el banner solo aparece si el jugador
 * NO fijó su tee Y tiene rondas que el catálogo puede recuperar de verdad
 * (sin tee, con course_id, y con un color resoluble en `course_tees`).
 *
 * El conteo es HONESTO: una ronda en una cancha fuera de catálogo, o en un
 * recorrido multi-loop donde el color es ambiguo, NO se cuenta como recuperable
 * — porque el recompute no la podría tocar y el banner mentiría al prometer
 * "calculamos tu índice al instante".
 */
interface RoundRow { id: string; course_id: string; holes_played: number | null }

function mockSupabase(opts: {
  defaultTee?: string | null
  genero?: 'M' | 'F' | null
  rounds?: RoundRow[]
  teesByCourse?: Record<string, TeeRow[]>
}) {
  const rounds = opts.rounds ?? []
  const teesByCourse = opts.teesByCourse ?? {}
  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { default_tee_color: opts.defaultTee ?? null, genero: opts.genero ?? null } }) }) }),
        }
      }
      if (table === 'historical_rounds') {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          is: () => chain,
          not: () => chain,
          then: (resolve: (v: { data: RoundRow[] }) => unknown) => resolve({ data: rounds }),
        }
        return { select: () => chain }
      }
      if (table === 'course_tees') {
        let courseId: string | null = null
        const chain: Record<string, unknown> = {
          eq: (_col: string, val: string) => { courseId = val; return chain },
          then: (resolve: (v: { data: TeeRow[] }) => unknown) =>
            resolve({ data: courseId ? (teesByCourse[courseId] ?? []) : [] }),
        }
        return { select: () => chain }
      }
      return {}
    },
  } as never
}

/** Un tee de catálogo mínimo (lo que el resolver necesita). */
function tee(nombre: string, genero: 'M' | 'F', rating: number, slope: number): TeeRow {
  return {
    nombre, genero, rating, slope,
    front_course_rating: null, front_slope_rating: null,
    back_course_rating: null, back_slope_rating: null,
  } as TeeRow
}

const COURSE_OK = 'course-resoluble'
const COURSE_SIN_TEES = 'course-sin-tees'
const COURSE_AMBIGUO = 'course-ambiguo'

describe('getTeePromptStatus', () => {
  it('show=false: ya fijó su tee (no se vuelve a preguntar)', async () => {
    const s = await getTeePromptStatus(mockSupabase({ defaultTee: 'azul' }), 'u1')
    expect(s.show).toBe(false)
  })

  it('show=false: sin tee fijado pero 0 rondas candidatas', async () => {
    const s = await getTeePromptStatus(mockSupabase({ defaultTee: null, rounds: [] }), 'u1')
    expect(s.show).toBe(false)
    expect(s.recoverableRounds).toBe(0)
  })

  it('show=true: ronda en cancha con un color resoluble del catálogo', async () => {
    const s = await getTeePromptStatus(mockSupabase({
      defaultTee: null, genero: 'M',
      rounds: [{ id: 'r1', course_id: COURSE_OK, holes_played: 18 }],
      teesByCourse: { [COURSE_OK]: [tee('azul', 'M', 72, 130)] },
    }), 'u1')
    expect(s.show).toBe(true)
    expect(s.recoverableRounds).toBe(1)
  })

  it('show=false: ronda en cancha SIN tees en catálogo (Paico/Inkas) — no recuperable', async () => {
    const s = await getTeePromptStatus(mockSupabase({
      defaultTee: null, genero: 'M',
      rounds: [{ id: 'r1', course_id: COURSE_SIN_TEES, holes_played: 18 }],
      teesByCourse: { [COURSE_SIN_TEES]: [] },
    }), 'u1')
    expect(s.show).toBe(false)
    expect(s.recoverableRounds).toBe(0)
  })

  it('show=false: cancha multi-loop con todos los colores ambiguos (Las Brisas) — no recuperable', async () => {
    // Las Brisas real: cada color es 3 recorridos (Norte-Sur / Norte-Este /
    // Sur-Este) con ratings distintos. Para CUALQUIER color del banner el resolver
    // tiene varios candidatos con ratings distintos y no adivina cuál se jugó →
    // null para todos. Ni siquiera el rojo (F) resuelve: 3 loops F ambiguos.
    const s = await getTeePromptStatus(mockSupabase({
      defaultTee: null, genero: 'M',
      rounds: [{ id: 'r1', course_id: COURSE_AMBIGUO, holes_played: 18 }],
      teesByCourse: {
        [COURSE_AMBIGUO]: [
          tee('azul_norte_sur', 'M', 71.9, 132),
          tee('azul_norte_este', 'M', 72, 128),
          tee('azul_sur_este', 'M', 72.3, 128),
          tee('blanco_norte_sur', 'M', 70.5, 130),
          tee('blanco_norte_este', 'M', 70.4, 127),
          tee('blanco_sur_este', 'M', 70.2, 126),
          tee('negras_norte_sur', 'M', 74, 136),
          tee('negras_norte_este', 'M', 74.7, 138),
          tee('negras_sur_este', 'M', 74.7, 132),
          tee('rojo_norte_sur', 'F', 72.7, 130),
          tee('rojo_norte_este', 'F', 72.3, 124),
          tee('rojo_sur_este', 'F', 73, 127),
        ],
      },
    }), 'u1')
    expect(s.show).toBe(false)
    expect(s.recoverableRounds).toBe(0)
  })

  it('cuenta solo las rondas recuperables de verdad (mezcla recuperable + irrecuperables)', async () => {
    const s = await getTeePromptStatus(mockSupabase({
      defaultTee: null, genero: 'M',
      rounds: [
        { id: 'r1', course_id: COURSE_OK, holes_played: 18 },        // recuperable
        { id: 'r2', course_id: COURSE_SIN_TEES, holes_played: 18 },  // no
        { id: 'r3', course_id: COURSE_AMBIGUO, holes_played: 18 },   // no
      ],
      teesByCourse: {
        [COURSE_OK]: [tee('azul', 'M', 72, 130)],
        [COURSE_SIN_TEES]: [],
        [COURSE_AMBIGUO]: [tee('azul_a', 'M', 71.9, 132), tee('azul_b', 'M', 72.3, 128)],
      },
    }), 'u1')
    expect(s.show).toBe(true)
    expect(s.recoverableRounds).toBe(1)
  })

  it('devuelve el género del perfil aunque no haya nada recuperable (para pre-seleccionarlo)', async () => {
    const s = await getTeePromptStatus(mockSupabase({
      defaultTee: null, genero: 'M',
      rounds: [{ id: 'r1', course_id: COURSE_SIN_TEES, holes_played: 18 }],
      teesByCourse: { [COURSE_SIN_TEES]: [] },
    }), 'u1')
    expect(s.genero).toBe('M')
  })

  it('género null si el perfil no lo tiene (el banner lo pedirá)', async () => {
    const s = await getTeePromptStatus(mockSupabase({
      defaultTee: null, genero: null,
      rounds: [{ id: 'r1', course_id: COURSE_OK, holes_played: 18 }],
      teesByCourse: { [COURSE_OK]: [tee('azul', 'M', 72, 130)] },
    }), 'u1')
    expect(s.genero).toBeNull()
  })
})
