/**
 * El contexto del skins separa «no pude leer» (señal: releer lo arregla) de «la cancha no tiene el dato» o «la
 * consulta está mal» (permanente). Revisión Fable PR #888, vuelta 2: P1 (el rating que falla por red no puede quedar
 * como «tee sin rating» toda la ronda), P2.1 (sin rama `TypeError`) y P2.2 (con `code` de PostgREST es permanente).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
import {
  BASE_LENTA, SIN_PERMISO, SIN_RED, clienteFalso, ok, type RespuestaFalsa,
} from '@/__tests__/helpers/postgrest-falso'
import { resolverCourseData } from '@/golf/core/course-handicap'
import { LecturaFallidaError } from '@/lib/red/lectura-fallida'
import { captureError } from '@/lib/error-tracking'
import {
  FalloDelContextoSkins, MENSAJE_SKINS_SIN_DATOS_DE_CANCHA, contextoSkinsDeRondaNueva, esFalloDeSenalDelContextoSkins,
  mensajeSkinsSinRating, skinsParaCrearRonda, type RondaDelSkinsNuevo,
} from './skins-ronda-nueva'

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

  it('por defecto, el error en los recorridos (27 hoyos) no lanza: sigue al rating de la cancha', async () => {
    const cancha = ok({ slope_rating: 130, course_rating: 72, par_total: 72 })
    const supa = clienteFalso({ courses: [SIN_RED, cancha], course_tees: [ok(null)] })
    const r = await resolverCourseData(supa, 'c1', 'blanco', 18, 72, ['Norte', 'Sur'])
    expect(r).toMatchObject({ slope: 130 })
    const conLanzar = await resolverCourseData(clienteFalso({ courses: [SIN_RED, cancha], course_tees: [ok(null)] }),
      'c1', 'blanco', 18, 72, ['Norte', 'Sur'], { lanzarSiFalla: true }).catch((e: unknown) => e)
    expect(conLanzar).toBeInstanceOf(LecturaFallidaError)
  })

  it('por defecto, el error al leer el par de 9 (resolveNineHolePar) no lanza: usa la mitad del par de 18', async () => {
    const tee = ok({ rating: 72, slope: 130, front_course_rating: null, front_slope_rating: null })
    const cancha = ok({ slope_rating: 130, course_rating: 72, par_total: 72 })
    const tablas = () => ({ courses: [cancha], course_tees: [tee], course_holes: [SIN_RED] })
    const r = await resolverCourseData(clienteFalso(tablas()), 'c1', 'blanco', 9, 72, null)
    expect(r).toMatchObject({ par: 36, is9Hole: true })
    const conLanzar = await resolverCourseData(clienteFalso(tablas()), 'c1', 'blanco', 9, 72, null, { lanzarSiFalla: true })
      .catch((e: unknown) => e)
    expect(conLanzar).toBeInstanceOf(LecturaFallidaError)
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
      clienteFalso({ course_holes: [{ data: null, error: { message: 'column "x" does not exist', code: '42703' } } as RespuestaFalsa] }), RONDA,
    ))
    expect(conCodigo.deSenal).toBe(false)
  })

  it('un TypeError suelto es un bug, no falta de señal: no se reintenta', () => {
    expect(esFalloDeSenalDelContextoSkins(new TypeError('x is undefined'))).toBe(false)
  })
})

// Revisión Fable PR #888, vuelta 3: P1 (un `code` transitorio es de señal) y P2.2 (el mensaje es el de la lectura).
describe('contextoSkinsDeRondaNueva — base lenta (57014) y mensaje para el jugador', () => {
  it('neto: el rating con statement timeout (57014) es de SEÑAL (antes: permanente, VALE en «—» toda la ronda)', async () => {
    const supa = clienteFalso({ course_holes: [ok(HOYOS)], courses: [BASE_LENTA], course_tees: [ok(null)] })
    const err = await fallo(contextoSkinsDeRondaNueva(supa, RONDA))
    expect(err.deSenal).toBe(true)
    expect(esFalloDeSenalDelContextoSkins(err)).toBe(true)
  })

  it('hoyos con statement timeout (57014): de SEÑAL', async () => {
    expect((await fallo(contextoSkinsDeRondaNueva(clienteFalso({ course_holes: [BASE_LENTA] }), RONDA))).deSenal).toBe(true)
  })

  it('el rating que falla por señal muestra el mensaje del TEE (con «juega en gross»), no el de los hoyos', async () => {
    for (const r of [SIN_RED, BASE_LENTA, SIN_PERMISO]) {
      const supa = clienteFalso({ course_holes: [ok(HOYOS)], courses: [r], course_tees: [ok(null)] })
      expect((await fallo(contextoSkinsDeRondaNueva(supa, RONDA))).message).toBe(mensajeSkinsSinRating('blanco'))
    }
  })

  it('los hoyos que fallan (señal o permanente) muestran el mensaje de los hoyos', async () => {
    for (const r of [SIN_RED, BASE_LENTA, SIN_PERMISO]) {
      const err = await fallo(contextoSkinsDeRondaNueva(clienteFalso({ course_holes: [r] }), RONDA))
      expect(err.message).toBe(MENSAJE_SKINS_SIN_DATOS_DE_CANCHA)
    }
  })
})

describe('skinsParaCrearRonda — 503 con el mensaje de la lectura y el código en el reporte', () => {
  afterEach(() => { vi.mocked(captureError).mockClear() })
  const PEDIDO = {
    ...RONDA, modoDeLaRonda: 'neto', adminMode: true, nuevoId: () => 'x',
    reglasJuego: { modo: 'neto', hcpPct: 100, pozoPorJugador: 0 },
  }

  it('rating sin señal: 503 con el mensaje del tee (no el de los hoyos)', async () => {
    const supa = clienteFalso({ course_holes: [ok(HOYOS)], courses: [SIN_RED], course_tees: [ok(null)] })
    expect(await skinsParaCrearRonda(supa, PEDIDO)).toEqual({ ok: false, status: 503, error: mensajeSkinsSinRating('blanco') })
  })

  it('el reporte lleva el code de PostgREST (captureError no guarda cause)', async () => {
    const supa = clienteFalso({ course_holes: [ok(HOYOS)], courses: [SIN_PERMISO], course_tees: [ok(null)] })
    await skinsParaCrearRonda(supa, PEDIDO)
    expect(vi.mocked(captureError).mock.calls[0][1]?.meta).toMatchObject({
      codigo: '42501', causa: expect.stringContaining('permission denied'),
    })
  })
})
