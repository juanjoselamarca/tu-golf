/**
 * Tests de computePlayingHandicapForCoach — causa E / captura #1 del P0 de campo:
 * el coach confundía índice con handicap de juego e inventaba números. Ahora lo
 * computa con el motor WHS o degrada honesto, nunca inventa.
 */
import { describe, it, expect } from 'vitest'
import { computePlayingHandicapForCoach } from './coach-handicap'
import { executeTool, TAIGER_TOOLS, type ToolExecutionContext } from '@/golf/coach/tools'
import type { SupabaseClient } from '@supabase/supabase-js'

const LOMAS_ID = 'dff847e1-34d9-4805-85a7-01ec3e554f65'

type FakeData = {
  profile?: { indice: number | null; genero: string | null; default_tee_color: string | null } | null
  catalog?: Array<{ id: string; nombre: string; fuente: string; canonical_course_id: string | null }>
  tees?: Array<Record<string, unknown>>
  parTotal?: number | null
}

/** Fake supabase cubriendo: profiles (.eq.maybeSingle), courses (matchCourseInDB
 *  .ilike + par_total .eq.maybeSingle) y course_tees (.eq). */
function fakeSupabase(d: FakeData): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: d.profile ?? null, error: null }) }) }),
        }
      }
      if (table === 'courses') {
        return {
          select: (cols: string) => ({
            // matchCourseInDB → .ilike('nombre', %word%) (devuelve lista)
            ilike: (_c: string, pattern: string) => {
              const needle = pattern.replace(/%/g, '').toLowerCase()
              const data = (d.catalog ?? []).filter(c => c.nombre.toLowerCase().includes(needle))
              return Promise.resolve({ data, error: null })
            },
            // par_total → .eq('id', id).maybeSingle() ; o resolución UUID → id+nombre
            eq: (_c: string, id: string) => ({
              maybeSingle: () => {
                if (cols.includes('par_total')) {
                  return Promise.resolve({ data: { par_total: d.parTotal ?? 72 }, error: null })
                }
                const c = (d.catalog ?? []).find(x => x.id === id) ?? null
                return Promise.resolve({ data: c ? { id: c.id, nombre: c.nombre, canonical_course_id: c.canonical_course_id } : null, error: null })
              },
            }),
          }),
        }
      }
      if (table === 'course_tees') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: d.tees ?? [], error: null }) }),
        }
      }
      throw new Error(`tabla inesperada: ${table}`)
    },
  } as unknown as SupabaseClient
}

const LOMAS = { id: LOMAS_ID, nombre: 'Club de Golf Lomas de La Dehesa', fuente: 'fedegolf', canonical_course_id: null }
const teeBlanco = {
  nombre: 'Blanco', genero: 'M', rating: 72.4, slope: 130,
  front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null,
}
const teeBlancoCon9 = {
  nombre: 'Blanco', genero: 'M', rating: 72.4, slope: 130,
  front_course_rating: 36.2, front_slope_rating: 128, back_course_rating: 36.2, back_slope_rating: 128,
}

describe('computePlayingHandicapForCoach — handicap de juego real, sin inventar', () => {
  it('computa el handicap de juego 18h con la fórmula WHS', async () => {
    const sb = fakeSupabase({
      profile: { indice: 9.6, genero: 'M', default_tee_color: 'Blanco' },
      catalog: [LOMAS],
      tees: [teeBlanco],
      parTotal: 72,
    })
    const r = await computePlayingHandicapForCoach(sb, 'u1', { course: 'Lomas de la Dehesa' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      // WHS: redondeo(9.6 × 130/113 + (72.4 − 72)) = redondeo(11.04 + 0.4) = 11
      expect(r.handicap_de_juego).toBe(11)
      expect(r.indice).toBe(9.6)
      expect(r.tee).toBe('Blanco')
      expect(r.handicap_de_juego).not.toBe(r.indice) // distinto del índice
    }
  })

  it('usa el tee por defecto del perfil si no se especifica', async () => {
    const sb = fakeSupabase({
      profile: { indice: 9.6, genero: 'M', default_tee_color: 'Blanco' },
      catalog: [LOMAS],
      tees: [teeBlanco],
      parTotal: 72,
    })
    const r = await computePlayingHandicapForCoach(sb, 'u1', { course: LOMAS_ID })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tee).toBe('Blanco')
  })

  it('por UUID de una ficha DUPLICADA resuelve a la cancha canónica (no los ratings del duplicado)', async () => {
    const DUP_ID = '11111111-1111-4111-8111-111111111111'
    const dup = { id: DUP_ID, nombre: 'Lomas (ficha fedegolf duplicada)', fuente: 'fedegolf', canonical_course_id: LOMAS_ID }
    const sb = fakeSupabase({
      profile: { indice: 9.6, genero: 'M', default_tee_color: 'Blanco' },
      catalog: [dup, LOMAS],
      tees: [teeBlanco],
      parTotal: 72,
    })
    const r = await computePlayingHandicapForCoach(sb, 'u1', { course: DUP_ID })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.course_id).toBe(LOMAS_ID) // canónica, NO el UUID duplicado
      expect(r.cancha).toBe(LOMAS.nombre)
    }
  })

  it('computa el handicap de juego 9h con el rating de 9 hoyos del tee', async () => {
    const sb = fakeSupabase({
      profile: { indice: 9.6, genero: 'M', default_tee_color: 'Blanco' },
      catalog: [LOMAS],
      tees: [teeBlancoCon9],
      parTotal: 72,
    })
    const r = await computePlayingHandicapForCoach(sb, 'u1', { course: 'Lomas', holes: 9 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      // WHS 9h: redondeo(9.6 × 128/113 + (36.2 − 36)) = redondeo(10.87 + 0.2) = 11
      expect(r.handicap_de_juego).toBe(11)
      expect(r.holes).toBe(9)
      expect(r.course_rating).toBe(36.2)
    }
  })

  it('degrada honesto a 9h si el tee no tiene rating de 9 hoyos', async () => {
    const sb = fakeSupabase({
      profile: { indice: 9.6, genero: 'M', default_tee_color: 'Blanco' },
      catalog: [LOMAS],
      tees: [teeBlanco], // solo rating 18h
      parTotal: 72,
    })
    const r = await computePlayingHandicapForCoach(sb, 'u1', { course: 'Lomas', holes: 9 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/9 hoyos|a 18 hoyos/i)
  })

  it('degrada honesto si el jugador no tiene índice (no inventa)', async () => {
    const sb = fakeSupabase({ profile: { indice: null, genero: 'M', default_tee_color: 'Blanco' }, catalog: [LOMAS], tees: [teeBlanco] })
    const r = await computePlayingHandicapForCoach(sb, 'u1', { course: 'Lomas' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/no tiene índice|sin índice/i)
  })

  it('degrada honesto si la cancha no está en el catálogo', async () => {
    const sb = fakeSupabase({ profile: { indice: 9.6, genero: 'M', default_tee_color: 'Blanco' }, catalog: [], tees: [] })
    const r = await computePlayingHandicapForCoach(sb, 'u1', { course: 'Cancha Inexistente XYZ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/no está en el catálogo/i)
  })

  it('degrada honesto si no hay un tee confiable (sin pedir que invente)', async () => {
    const sb = fakeSupabase({
      profile: { indice: 9.6, genero: 'M', default_tee_color: 'Azul' }, // tee que no existe en el catálogo
      catalog: [LOMAS],
      tees: [teeBlanco],
      parTotal: 72,
    })
    const r = await computePlayingHandicapForCoach(sb, 'u1', { course: 'Lomas' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/rating\/slope|ambiguo/i)
  })

  it('pide el color del tee solo cuando NO hay ni param ni default (dato que solo el jugador sabe)', async () => {
    const sb = fakeSupabase({ profile: { indice: 9.6, genero: 'M', default_tee_color: null }, catalog: [LOMAS], tees: [teeBlanco], parTotal: 72 })
    const r = await computePlayingHandicapForCoach(sb, 'u1', { course: 'Lomas' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/color del tee/i)
  })
})

describe('get_playing_handicap — tool registrada y cableada en executeTool', () => {
  it('está en el catálogo de tools que se le ofrece al coach', () => {
    expect(TAIGER_TOOLS.some(t => t.name === 'get_playing_handicap')).toBe(true)
  })

  it('executeTool computa el handicap de juego (prueba de consumo en runtime)', async () => {
    const sb = fakeSupabase({
      profile: { indice: 9.6, genero: 'M', default_tee_color: 'Blanco' },
      catalog: [LOMAS],
      tees: [teeBlanco],
      parTotal: 72,
    })
    const r = await executeTool('get_playing_handicap', { course: 'Lomas de la Dehesa' }, {
      supabase: sb, userId: 'u1', defaultRondaId: null, sessionId: null,
    } as ToolExecutionContext)
    expect(r.ok).toBe(true)
    const data = (r as { ok: true; data: { handicap_de_juego: number; indice: number } }).data
    expect(data.handicap_de_juego).toBe(11)
    expect(data.indice).toBe(9.6)
  })

  it('executeTool degrada honesto (ok:false con razón) sin tirar el turno', async () => {
    const sb = fakeSupabase({ profile: { indice: 9.6, genero: 'M', default_tee_color: 'Blanco' }, catalog: [], tees: [] })
    const r = await executeTool('get_playing_handicap', { course: 'No Existe' }, {
      supabase: sb, userId: 'u1', defaultRondaId: null, sessionId: null,
    } as ToolExecutionContext)
    expect(r.ok).toBe(false)
  })
})
