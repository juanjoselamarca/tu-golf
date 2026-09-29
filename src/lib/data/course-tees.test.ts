import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSiblingVariantTees, getTeesWithGenderVariants, resolveTeeRatingsForCourse } from './course-tees'

/** Stub mínimo de supabase: from().select().eq() → { data }. */
function stubSupabase(rows: unknown[] | null): SupabaseClient {
  const builder = {
    select() { return this },
    eq() { return Promise.resolve({ data: rows, error: null }) },
  }
  return { from() { return builder } } as unknown as SupabaseClient
}

const teeRows = [
  { nombre: 'blanco', genero: 'M', rating: 71.6, slope: 129, front_course_rating: 35.8, front_slope_rating: 128, back_course_rating: 35.8, back_slope_rating: 130 },
]

describe('resolveTeeRatingsForCourse', () => {
  it('resuelve CR/slope 18h desde course_tees', async () => {
    const r = await resolveTeeRatingsForCourse(stubSupabase(teeRows), 'course-1', 'blanco', 18)
    expect(r).toEqual({ cr: 71.6, slope: 129, nineHoleRatings: null })
  })

  it('devuelve null sin course_id (no consulta)', async () => {
    const r = await resolveTeeRatingsForCourse(stubSupabase(teeRows), null, 'blanco', 18)
    expect(r).toBeNull()
  })

  it('devuelve null si la cancha no tiene tees', async () => {
    const r = await resolveTeeRatingsForCourse(stubSupabase([]), 'course-1', 'blanco', 18)
    expect(r).toBeNull()
  })

  it('devuelve null si el color no matchea (no inventa)', async () => {
    const r = await resolveTeeRatingsForCourse(stubSupabase(teeRows), 'course-1', 'morado', 18)
    expect(r).toBeNull()
  })
})

// ── Variante de género (fila DAMAS / VARONES hermana) ─────────────────────────

type Result = { data: unknown; error?: { message: string } | null }

/** Cliente falso ruteado por tabla; registra las tablas consultadas. */
function supabaseMock(byTable: Record<string, Result>) {
  const calls: string[] = []
  const from = vi.fn((table: string) => {
    calls.push(table)
    const result = { data: byTable[table]?.data ?? null, error: byTable[table]?.error ?? null }
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => Promise.resolve(result)),
      in: vi.fn(() => Promise.resolve(result)),
    }
    return chain
  })
  return { client: { from } as never, calls }
}

const VARONES = { id: 'lv', nombre: 'C.G. Los Leones - Los Leones (VARONES)', fedegolf_club_id: 5 }
const DAMAS = { id: 'ld', nombre: 'C.G. Los Leones - Los Leones (DAMAS)', fedegolf_club_id: 5 }
const OTRA = { id: 'lo', nombre: 'C.G. Los Leones - Norte (VARONES)', fedegolf_club_id: 5 }
const TEE_M = { id: 't-m', nombre: 'rojo', rating: 73.9, slope: 133, yardaje_total: 5300, genero: 'M' }
const TEE_F = { id: 't-f', nombre: 'rojo', rating: 73.9, slope: 133, yardaje_total: 5300, genero: 'F' }
const TEE_F_BLANCO = { id: 't-fb', nombre: 'blanco', rating: 78.6, slope: 142, yardaje_total: 6100, genero: 'F' }

/** Lo que devuelve la query única: tees del club con su ficha embebida. */
const CLUB_TEES = [
  { ...TEE_M, course_id: 'lv', courses: VARONES },
  { ...TEE_F, course_id: 'ld', courses: DAMAS },
  { ...TEE_F_BLANCO, course_id: 'ld', courses: DAMAS },
  { id: 't-o', nombre: 'azul', rating: 70, slope: 120, yardaje_total: 6000, genero: 'M', course_id: 'lo', courses: OTRA },
]

describe('getSiblingVariantTees', () => {
  it('trae los tees de la fila hermana (DAMAS de una VARONES) en UNA query, sin la propia ni otras del club', async () => {
    const { client, calls } = supabaseMock({ course_tees: { data: CLUB_TEES } })
    const tees = await getSiblingVariantTees(client, VARONES)
    expect(tees.map((t) => t.id)).toEqual(['t-fb', 't-f']) // orden determinista: (ficha, nombre)
    expect(tees[0]).not.toHaveProperty('courses')
    expect(calls).toEqual(['course_tees'])
  })

  it('cancha sin marcador de género o sin club: NO va a la BD', async () => {
    const { client, calls } = supabaseMock({})
    expect(await getSiblingVariantTees(client, { id: 'x', nombre: 'Club de Golf Los Leones', fedegolf_club_id: 5 })).toEqual([])
    expect(await getSiblingVariantTees(client, { ...VARONES, fedegolf_club_id: null })).toEqual([])
    expect(calls).toEqual([])
  })

  it('sin pareja en el club: vacío', async () => {
    const { client } = supabaseMock({ course_tees: { data: [CLUB_TEES[0], CLUB_TEES[3]] } })
    expect(await getSiblingVariantTees(client, VARONES)).toEqual([])
  })

  it('error de la BD → PROPAGA (no degrada el handicap de las jugadoras en silencio)', async () => {
    const { client } = supabaseMock({ course_tees: { data: null, error: { message: 'boom' } } })
    await expect(getSiblingVariantTees(client, VARONES)).rejects.toThrow(/variantes de género/)
  })
})

describe('getTeesWithGenderVariants', () => {
  it('la fila del torneo va PRIMERO y la hermana después', async () => {
    const { client } = supabaseMock({ course_tees: { data: CLUB_TEES } })
    const tees = await getTeesWithGenderVariants(client, VARONES, [TEE_M])
    expect(tees.map((t) => t.id)).toEqual(['t-m', 't-fb', 't-f'])
  })

  it('sin hermana devuelve los propios tal cual (misma referencia)', async () => {
    const { client } = supabaseMock({ course_tees: { data: [CLUB_TEES[0]] } })
    const own = [TEE_M]
    expect(await getTeesWithGenderVariants(client, VARONES, own)).toBe(own)
  })
})
