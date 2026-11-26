/**
 * Golpes congelados del Skins (campeonato de Los Leones, plata real): la tabla y el scorer leen el course handicap y
 * los hoyos guardados al crear, no el rating que la cancha tenga después. Las rondas viejas, sin `congelado`, siguen
 * recalculando como antes.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
import { clienteFalso, ok } from '@/__tests__/helpers/postgrest-falso'
import { CONFIG_SKINS_POR_DEFECTO } from '@/golf/formats/skins'
import { skinsParaCrearRonda, type RondaDelSkinsNuevo } from './skins-ronda-nueva'
import { contextoDelSkinsDeLaRonda } from './skins-contexto-guardado'

const HOYOS = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: i % 6 === 0 ? 3 : 4, stroke_index: ((i * 7) % 18) + 1 }))
const tee = (slope: number, rating: number) => ok({ rating, slope, front_course_rating: null, front_slope_rating: null })
const cancha = (slope: number, rating: number) => ok({ slope_rating: slope, course_rating: rating, par_total: 69 })
/** La cancha tal como estaba al crear y tal como queda si alguien corrige el rating del tee a mitad del campeonato. */
const AL_CREAR = () => ({ course_holes: [ok(HOYOS)], courses: [cancha(140, 73)], course_tees: [tee(140, 73)] })
const CORREGIDA = () => ({ course_holes: [ok(HOYOS.map(h => ({ ...h, stroke_index: 19 - h.stroke_index })))], courses: [cancha(113, 69)], course_tees: [tee(113, 69)] })

const RONDA: RondaDelSkinsNuevo = {
  courseId: 'c1', holes: 18, hoyoInicio: 1, recorridos: null, tees: 'blanco', modo: 'neto',
  jugadores: [{ nombre: 'Ana', indice: 10.2 }, { nombre: 'Beto', indice: 24 }, { nombre: 'Coni', indice: 3.1, tees: 'Azul' }],
}

async function crear() {
  let n = 0
  const r = await skinsParaCrearRonda(clienteFalso(AL_CREAR()), {
    ...RONDA, reglasJuego: CONFIG_SKINS_POR_DEFECTO, modoDeLaRonda: 'neto', adminMode: true, nuevoId: () => `j${++n}`,
  })
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('Skins: golpes congelados al crear', () => {
  it('la creación guarda los hoyos y el course handicap de cada jugador, del mismo contexto que validó', async () => {
    const r = await crear()
    expect(r.reglas.congelado).toBeDefined()
    expect(r.reglas.congelado!.hoyos).toHaveLength(18)
    expect(Object.keys(r.reglas.congelado!.golpes)).toEqual(['j1', 'j2', 'j3'])
    // Lo congelado es exactamente lo que la ronda hubiera recalculado ese mismo momento.
    const recalculado = await contextoDelSkinsDeLaRonda(clienteFalso(AL_CREAR()), RONDA, { reglasJuego: {}, jugadorIds: r.jugadorIds })
    expect(r.reglas.congelado!.golpes).toEqual({
      j1: recalculado.jugadores[0].courseHandicap, j2: recalculado.jugadores[1].courseHandicap, j3: recalculado.jugadores[2].courseHandicap,
    })
  })

  it('corregir el rating y el SI de la cancha después de crear NO mueve la tabla (ni la lee)', async () => {
    const r = await crear()
    const antes = await contextoDelSkinsDeLaRonda(clienteFalso(AL_CREAR()), RONDA, { reglasJuego: r.reglas, jugadorIds: r.jugadorIds })
    const supa = clienteFalso(CORREGIDA())
    const despues = await contextoDelSkinsDeLaRonda(supa, RONDA, { reglasJuego: r.reglas, jugadorIds: r.jugadorIds })
    expect(despues).toEqual(antes)
    expect(supa.lecturas).toEqual({})
    // Control: recalculando, la corrección SÍ cambiaba los golpes (si no, el test no discriminaría nada).
    const vivo = await contextoDelSkinsDeLaRonda(clienteFalso(CORREGIDA()), RONDA, { reglasJuego: {}, jugadorIds: r.jugadorIds })
    expect(vivo.jugadores.map(j => j.courseHandicap)).not.toEqual(antes.jugadores.map(j => j.courseHandicap))
    expect(vivo.hoyos).not.toEqual(antes.hoyos)
  })

  it('una ronda sin congelado (creada antes de este cambio) sigue recalculando con la cancha vigente', async () => {
    const r = await crear()
    const supa = clienteFalso(CORREGIDA())
    const vivo = await contextoDelSkinsDeLaRonda(supa, RONDA, { reglasJuego: { config: r.reglas.config, jugadorIds: r.jugadorIds }, jugadorIds: r.jugadorIds })
    expect(supa.lecturas.course_holes).toBe(1)
    expect(vivo.hoyos[0].si).toBe(19 - HOYOS[0].stroke_index)
  })

  it('si el índice o el tee de un jugador cambió antes del primer golpe, lo congelado ya no calza: recalcula', async () => {
    const r = await crear()
    const conOtroIndice = { ...RONDA, jugadores: RONDA.jugadores.map((j, i) => (i === 1 ? { ...j, indice: 18 } : j)) }
    const supa = clienteFalso(AL_CREAR())
    await contextoDelSkinsDeLaRonda(supa, conOtroIndice, { reglasJuego: r.reglas, jugadorIds: r.jugadorIds })
    expect(supa.lecturas.course_holes).toBe(1)
    const conOtroTee = { ...RONDA, jugadores: RONDA.jugadores.map((j, i) => (i === 0 ? { ...j, tees: 'rojo' } : j)) }
    const supa2 = clienteFalso(AL_CREAR())
    await contextoDelSkinsDeLaRonda(supa2, conOtroTee, { reglasJuego: r.reglas, jugadorIds: r.jugadorIds })
    expect(supa2.lecturas.course_holes).toBe(1)
  })

  it('la ronda leída de la base (índice a un decimal, tee en minúscula, recorridos vacíos) calza con lo congelado', async () => {
    const r = await crear()
    const comoLaBase = {
      ...RONDA, recorridos: [],
      jugadores: [{ nombre: 'Ana', indice: 10.2, tees: null }, { nombre: 'Beto ', indice: 24.0, tees: 'blanco' }, { nombre: 'Coni', indice: 3.1, tees: 'azul' }],
    }
    const supa = clienteFalso(CORREGIDA())
    const ctx = await contextoDelSkinsDeLaRonda(supa, comoLaBase, { reglasJuego: r.reglas, jugadorIds: r.jugadorIds })
    expect(supa.lecturas).toEqual({})
    expect(ctx.jugadores[1].nombre).toBe('Beto')
  })

  it('un jugador agregado a las reglas que no está en lo congelado: recalcula (nunca un jugador sin golpes)', async () => {
    const r = await crear()
    const con4 = { ...RONDA, jugadores: [...RONDA.jugadores, { nombre: 'Dani', indice: 15 }] }
    const supa = clienteFalso(AL_CREAR())
    const ctx = await contextoDelSkinsDeLaRonda(supa, con4, { reglasJuego: r.reglas, jugadorIds: [...r.jugadorIds, 'j4'] })
    expect(supa.lecturas.course_holes).toBe(1)
    expect(ctx.jugadores).toHaveLength(4)
  })
})
