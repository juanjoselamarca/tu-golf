/**
 * Tests de get_course_scorecard — el coach pide el scorecard por NOMBRE o UUID.
 *
 * Regresión del P0 de campo (inbox 2026-06-09): el coach le pedía al jugador los
 * pares de Lomas de la Dehesa porque solo existía get_course_details(UUID) y él
 * solo conocía el nombre. Ahora resuelve nombre→cancha y degrada honesto si no
 * está en el catálogo (sin pedirle los pares al jugador).
 */
import { describe, it, expect } from 'vitest'
import { executeTool, type ToolExecutionContext } from './tools'

const LOMAS_ID = 'dff847e1-34d9-4805-85a7-01ec3e554f65'

const CATALOG = [
  { id: LOMAS_ID, nombre: 'Club de Golf Lomas de La Dehesa', fuente: 'fedegolf', canonical_course_id: null, ciudad: 'Santiago', par_total: 72 },
  { id: 'other-0000-0000-0000-000000000001', nombre: 'Club de Golf Los Leones', fuente: 'fedegolf', canonical_course_id: null, ciudad: 'Santiago', par_total: 71 },
]

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  course_id: LOMAS_ID,
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

/** Fake supabase que cubre los chains de matchCourseInDB + getCourseDetails. */
function fakeSupabase(): ToolExecutionContext['supabase'] {
  return {
    from(table: string) {
      if (table === 'courses') {
        return {
          select() {
            return {
              // matchCourseInDB → .ilike('nombre', %word%)
              ilike(_col: string, pattern: string) {
                const needle = pattern.replace(/%/g, '').toLowerCase()
                const data = CATALOG.filter(c => c.nombre.toLowerCase().includes(needle))
                return Promise.resolve({ data, error: null })
              },
              // getCourseDetails → .eq('id', id).maybeSingle()
              eq(_col: string, id: string) {
                return {
                  maybeSingle() {
                    const c = CATALOG.find(x => x.id === id) ?? null
                    return Promise.resolve({ data: c, error: null })
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'course_holes') {
        return {
          select() {
            return {
              eq(_col: string, cid: string) {
                return {
                  order() {
                    return Promise.resolve({ data: HOLES.filter(h => h.course_id === cid), error: null })
                  },
                }
              },
            }
          },
        }
      }
      throw new Error(`tabla inesperada: ${table}`)
    },
  } as unknown as ToolExecutionContext['supabase']
}

function ctx(): ToolExecutionContext {
  return { supabase: fakeSupabase(), userId: 'u-juanjo' }
}

describe('get_course_scorecard', () => {
  it('resuelve la cancha por NOMBRE y devuelve los pares hoyo por hoyo', async () => {
    const out = await executeTool('get_course_scorecard', { course: 'Lomas de la Dehesa' }, ctx())
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const data = out.data as { nombre: string; par_total: number; hoyos: unknown[]; resolved_from: string }
    expect(data.nombre).toBe('Club de Golf Lomas de La Dehesa')
    expect(data.par_total).toBe(72)
    expect(data.hoyos).toHaveLength(18)
    expect(data.resolved_from).toBe('Lomas de la Dehesa')
  })

  it('acepta también el UUID directo', async () => {
    const out = await executeTool('get_course_scorecard', { course: LOMAS_ID }, ctx())
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const data = out.data as { hoyos: unknown[] }
    expect(data.hoyos).toHaveLength(18)
  })

  it('si la cancha NO está en el catálogo, degrada honesto y NO pide los pares al jugador', async () => {
    const out = await executeTool('get_course_scorecard', { course: 'Cancha Inexistente XYZ' }, ctx())
    expect(out.ok).toBe(false)
    if (out.ok) return
    // El mensaje guía al coach a NO pedirle los pares al jugador.
    expect(out.error.toLowerCase()).toContain('no le pidas los pares')
  })

  it('rechaza input vacío', async () => {
    const out = await executeTool('get_course_scorecard', { course: '   ' }, ctx())
    expect(out.ok).toBe(false)
  })
})
