/**
 * El contexto del skins separa «no pude leer» (señal: releer lo arregla) de «la cancha no tiene el dato» o «la
 * consulta está mal» (permanente). Revisión Fable PR #888, vuelta 2: P1 (el rating que falla por red no puede quedar
 * como «tee sin rating» toda la ronda), P2.1 (sin rama `TypeError`) y P2.2 (con `code` de PostgREST es permanente).
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverCourseData } from '@/golf/core/course-handicap'
import { LecturaFallidaError } from '@/lib/red/lectura-fallida'
import {
  FalloDelContextoSkins, contextoSkinsDeRondaNueva, esFalloDeSenalDelContextoSkins, type RondaDelSkinsNuevo,
} from './skins-ronda-nueva'

type Respuesta = { data: unknown; error: { message: string; code: string } | null }
const ok = (data: unknown): Respuesta => ({ data, error: null })
/** Así devuelve `postgrest-js` 2.116 un fetch caído: no lanza, `code` vacío y `status` 0. */
const SIN_RED: Respuesta = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }
const SIN_PERMISO: Respuesta = { data: null, error: { message: 'permission denied for table courses', code: '42501' } }

function consulta(r: Respuesta) {
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q, in: () => q, ilike: () => q, order: () => q, limit: () => q,
    maybeSingle: () => Promise.resolve(r),
    then: (f: (v: Respuesta) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(r).then(f, rej),
  }
  return q
}

/** Cliente falso: por tabla, una cola de respuestas (la última se repite). */
function clienteFalso(tablas: Record<string, Respuesta[]>): SupabaseClient & { lecturas: Record<string, number> } {
  const lecturas: Record<string, number> = {}
  return {
    lecturas,
    from(tabla: string) {
      const cola = tablas[tabla] ?? [ok(null)]
      const n = lecturas[tabla] ?? 0
      lecturas[tabla] = n + 1
      return consulta(cola[Math.min(n, cola.length - 1)])
    },
  } as unknown as SupabaseClient & { lecturas: Record<string, number> }
}

const HOYOS = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))

const RONDA: RondaDelSkinsNuevo = {
  courseId: 'c1', holes: 18, hoyoInicio: 1, recorridos: null, tees: 'blanco', modo: 'neto',
  jugadores: [{ nombre: 'Ana', indice: 10 }, { nombre: 'Beto', indice: 20 }],
}

async function fallo(p: Promise<unknown>): Promise<FalloDelContextoSkins> {
  const err = await p.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(FalloDelContextoSkins)
  return err as FalloDelContextoSkins
}

describe('resolverCourseData — lanzarSiFalla', () => {
  it('por defecto un error de lectura sigue siendo «sin dato» (null): los otros llamadores no cambian', async () => {
    const supa = clienteFalso({ courses: [SIN_RED], course_tees: [SIN_RED] })
    expect(await resolverCourseData(supa, 'c1', 'blanco', 18, 72, null)).toBeNull()
  })

  it('con lanzarSiFalla, el error lanza LecturaFallidaError con el code de PostgREST', async () => {
    const sinRed = await resolverCourseData(clienteFalso({ courses: [SIN_RED] }), 'c1', 'blanco', 18, 72, null, { lanzarSiFalla: true })
      .catch((e: unknown) => e)
    expect(sinRed).toBeInstanceOf(LecturaFallidaError)
    expect((sinRed as LecturaFallidaError).deSenal).toBe(true)
    const sinPermiso = await resolverCourseData(clienteFalso({ courses: [SIN_PERMISO] }), 'c1', 'blanco', 18, 72, null, { lanzarSiFalla: true })
      .catch((e: unknown) => e)
    expect((sinPermiso as LecturaFallidaError).codigo).toBe('42501')
    expect((sinPermiso as LecturaFallidaError).deSenal).toBe(false)
  })

  it('con lanzarSiFalla y lectura sana sin dato, devuelve null (la cancha no lo tiene)', async () => {
    const supa = clienteFalso({ courses: [ok(null)], course_tees: [ok(null)] })
    expect(await resolverCourseData(supa, 'c1', 'blanco', 18, 72, null, { lanzarSiFalla: true })).toBeNull()
  })
})

describe('contextoSkinsDeRondaNueva — señal vs permanente', () => {
  it('neto: el rating que no se pudo leer por red es fallo de SEÑAL (antes: «tee sin rating», permanente)', async () => {
    const supa = clienteFalso({ course_holes: [ok(HOYOS)], courses: [SIN_RED], course_tees: [ok(null)] })
    const err = await fallo(contextoSkinsDeRondaNueva(supa, RONDA))
    expect(err.deSenal).toBe(true)
    expect(esFalloDeSenalDelContextoSkins(err)).toBe(true)
  })

  it('neto: el rating con error con code (42501) es permanente, con el mensaje para el jugador y el detalle en cause', async () => {
    const supa = clienteFalso({ course_holes: [ok(HOYOS)], courses: [SIN_PERMISO], course_tees: [ok(null)] })
    const err = await fallo(contextoSkinsDeRondaNueva(supa, RONDA))
    expect(err.deSenal).toBe(false)
    expect(err.message).toMatch(/rating y slope del tee/)
    expect(err.cause).toBeInstanceOf(LecturaFallidaError)
  })

  it('neto: leído bien y sin rating es permanente (la cancha no lo tiene)', async () => {
    const supa = clienteFalso({ course_holes: [ok(HOYOS)], courses: [ok(null)], course_tees: [ok(null)] })
    expect((await fallo(contextoSkinsDeRondaNueva(supa, RONDA))).deSenal).toBe(false)
  })

  it('gross: un rating que no se pudo leer no frena nada (el CH no reparte)', async () => {
    const supa = clienteFalso({ course_holes: [ok(HOYOS)], courses: [SIN_PERMISO], course_tees: [SIN_RED] })
    const ctx = await contextoSkinsDeRondaNueva(supa, { ...RONDA, modo: 'gross' })
    expect(ctx.hoyos).toHaveLength(18)
  })

  it('hoyos: sin code es señal; con code es permanente', async () => {
    const sinRed = await fallo(contextoSkinsDeRondaNueva(clienteFalso({ course_holes: [SIN_RED] }), RONDA))
    expect(sinRed.deSenal).toBe(true)
    const conCodigo = await fallo(contextoSkinsDeRondaNueva(
      clienteFalso({ course_holes: [{ data: null, error: { message: 'column "x" does not exist', code: '42703' } }] }), RONDA,
    ))
    expect(conCodigo.deSenal).toBe(false)
  })

  it('un TypeError suelto es un bug, no falta de señal: no se reintenta', () => {
    expect(esFalloDeSenalDelContextoSkins(new TypeError('x is undefined'))).toBe(false)
  })
})
