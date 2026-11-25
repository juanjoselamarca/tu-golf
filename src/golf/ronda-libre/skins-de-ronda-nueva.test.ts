import { describe, it, expect } from 'vitest'
import { CONFIG_SKINS_POR_DEFECTO, type ContextoValidacionSkins } from '../formats/skins'
import {
  MENSAJE_SKINS_HOYOS, MENSAJE_SKINS_SIN_CANCHA, MENSAJE_SKINS_UN_CELULAR, hoyosDelSkins, prepararSkinsDeRondaNueva,
  problemasDeLaRondaDelSkins,
} from './skins-de-ronda-nueva'

const NOMBRES = ['Ana', 'Beto', 'Caro', 'Dani']
const hoyos = (n: number) => Array.from({ length: n }, (_, i) => ({ numero: i + 1, par: 4, si: i + 1 }))
const contexto = (chs: (number | null)[], n = 18): ContextoValidacionSkins => ({
  jugadores: chs.map((courseHandicap, i) => ({ nombre: NOMBRES[i], courseHandicap })),
  hoyos: hoyos(n),
})
let k = 0
type Input = Parameters<typeof prepararSkinsDeRondaNueva>[0]
const base = (over: Partial<Input> = {}): Input => ({
  reglasJuego: CONFIG_SKINS_POR_DEFECTO, modoDeLaRonda: 'neto', contexto: contexto([10, 20]), holes: 18,
  courseId: 'c1', adminMode: true, nuevoId: () => `id${++k}`, ...over,
})
const errores = (r: ReturnType<typeof prepararSkinsDeRondaNueva>) => (r.ok ? '' : r.errores.join(' '))

describe('problemasDeLaRondaDelSkins', () => {
  it('un celular, cancha del catálogo y 18 o 9 hoyos, en ese orden', () => {
    expect(problemasDeLaRondaDelSkins({ adminMode: false, courseId: null, holes: 27 })).toEqual([MENSAJE_SKINS_UN_CELULAR])
    expect(problemasDeLaRondaDelSkins({ adminMode: true, courseId: null, holes: 27 })).toEqual([MENSAJE_SKINS_SIN_CANCHA])
    expect(problemasDeLaRondaDelSkins({ adminMode: true, courseId: 'c', holes: 27 })).toEqual([MENSAJE_SKINS_HOYOS])
    expect(problemasDeLaRondaDelSkins({ adminMode: true, courseId: 'c', holes: 9 })).toEqual([])
  })
})

describe('hoyosDelSkins', () => {
  it('en el orden de juego; sin par o sin SI entra 0 (el motor lo bloquea en neto)', () => {
    expect(hoyosDelSkins([10, 11], { 10: 4 }, { 11: 3 })).toEqual([
      { numero: 10, par: 4, si: 0 }, { numero: 11, par: 0, si: 3 },
    ])
  })
})

describe('prepararSkinsDeRondaNueva', () => {
  it('ok: guarda { config, jugadorIds } con un id por jugador, en el orden de la pantalla', () => {
    k = 0
    const r = prepararSkinsDeRondaNueva(base())
    expect(r).toMatchObject({ ok: true, jugadorIds: ['id1', 'id2'] })
    if (r.ok) expect(r.reglas).toEqual({ config: CONFIG_SKINS_POR_DEFECTO, jugadorIds: ['id1', 'id2'] })
  })

  it('neto con un jugador sin hándicap: bloqueo con su nombre; en gross pasa', () => {
    expect(errores(prepararSkinsDeRondaNueva(base({ contexto: contexto([10, null]) })))).toContain('Beto no tiene hándicap')
    expect(prepararSkinsDeRondaNueva(base({
      contexto: contexto([10, null]), modoDeLaRonda: 'gross', reglasJuego: { ...CONFIG_SKINS_POR_DEFECTO, modo: 'gross' },
    })).ok).toBe(true)
  })

  it('neto con SI que no es permutación: bloqueo', () => {
    const ctx = { ...contexto([10, 20]), hoyos: hoyos(18).map(h => (h.numero === 4 ? { ...h, si: 0 } : h)) }
    expect(errores(prepararSkinsDeRondaNueva(base({ contexto: ctx })))).toContain('índices de dificultad')
  })

  it('más de 3 golpes por hoyo: 28 de diferencia bloquea en 9 hoyos y no en 18', () => {
    expect(errores(prepararSkinsDeRondaNueva(base({ holes: 9, contexto: contexto([0, 28], 9) })))).toContain('más de 3 golpes por hoyo')
    expect(prepararSkinsDeRondaNueva(base({ contexto: contexto([0, 28]) })).ok).toBe(true)
    expect(prepararSkinsDeRondaNueva(base({ contexto: contexto([0, 55]) })).ok).toBe(false)
  })

  it('el modo del skins tiene que ser el de la ronda', () => {
    expect(errores(prepararSkinsDeRondaNueva(base({ modoDeLaRonda: 'gross' })))).toContain('no coincide')
  })

  it('un solo jugador o lo de la ronda mal: no se arma', () => {
    expect(prepararSkinsDeRondaNueva(base({ contexto: contexto([10]) })).ok).toBe(false)
    expect(prepararSkinsDeRondaNueva(base({ adminMode: false }))).toEqual({ ok: false, errores: [MENSAJE_SKINS_UN_CELULAR] })
  })
})
