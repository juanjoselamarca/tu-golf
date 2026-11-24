import { describe, it, expect } from 'vitest'
import { CONFIG_SKINS_POR_DEFECTO, validarConfigSkins, opcionesDelMotor, esFormatoSkins, type ConfigSkins } from './index'

const dos = [{ nombre: 'Ana', courseHandicap: 12 }, { nombre: 'Beto', courseHandicap: 3 }]
const hoyos = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, si: i + 1 }))
const ctx = (jugadores: readonly { nombre: string; courseHandicap: number | null }[] = dos) => ({ jugadores, hoyos })
const con = (cambios: Partial<ConfigSkins>) => ({ ...CONFIG_SKINS_POR_DEFECTO, ...cambios })

describe('reglas del skins (spec «Variantes»)', () => {
  it('los defaults de la spec: neto, 100 %, repartir, sin validación, sin pozo', () => {
    expect(validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, ctx())).toEqual({ ok: true, config: CONFIG_SKINS_POR_DEFECTO })
  })

  it('acepta el caso del campeonato: 75 %, validación, pozo y especiales', () => {
    const c = con({ hcpPct: 75, validacion: true, pozoPorJugador: 30000, puntitos: [{ id: 'g', tipo: 'greenie' }, { id: 'p', tipo: 'propio', nombre: 'Árbol' }] })
    expect(validarConfigSkins(c, ctx()).ok).toBe(true)
    expect(opcionesDelMotor(c)).toEqual({ modo: 'neto', empateUltimoHoyo: 'repartir', validacion: true, pozoPorJugador: 30000 })
  })

  it.each([
    ['% fuera de las opciones', { hcpPct: 70 }],
    ['pozo con decimales', { pozoPorJugador: 1000.5 }],
    ['pozo negativo', { pozoPorJugador: -1 }],
    ['birdie como especial', { puntitos: [{ id: 'b', tipo: 'birdie' }] }],
    ['versión desconocida', { version: 2 }],
  ])('rechaza %s', (_, cambios) => {
    expect(validarConfigSkins({ ...CONFIG_SKINS_POR_DEFECTO, ...cambios }, ctx())).toMatchObject({ ok: false })
  })

  it('neto con un jugador sin índice: lo nombra y ofrece gross', () => {
    const r = validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, ctx([...dos, { nombre: 'Coni', courseHandicap: null }]))
    expect(r).toEqual({ ok: false, errores: ['Coni no tiene hándicap: el skins neto lo necesita. Juega en gross o agrega su índice.'] })
    expect(validarConfigSkins(con({ modo: 'gross' }), ctx([...dos, { nombre: 'Coni', courseHandicap: null }])).ok).toBe(true)
  })

  it('menos de 2 jugadores, especial repetido o propio sin nombre: rechaza con el motivo', () => {
    expect(validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, ctx([dos[0]]))).toMatchObject({ errores: ['El skins es para 2 jugadores o más.'] })
    expect(validarConfigSkins(con({ puntitos: [{ id: 'a', tipo: 'sandy' }, { id: 'b', tipo: 'sandy' }] }), ctx()))
      .toMatchObject({ errores: ['Cada punto especial va una sola vez.'] })
    expect(validarConfigSkins(con({ puntitos: [{ id: 'a', tipo: 'propio' }] }), ctx()))
      .toMatchObject({ errores: ['Ponle nombre a tu punto especial.'] })
  })

  it('bloqueos del motor: SI de 18 en una ronda de 9, golpes sobre el tope, sin hoyos', () => {
    const nueve = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, si: 2 * i + 1 }))
    expect(validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, { jugadores: dos, hoyos: nueve })).toMatchObject({
      errores: ['La cancha no tiene bien los índices de dificultad de estos hoyos. Juega en gross o elige otro recorrido.'],
    })
    expect(validarConfigSkins(con({ modo: 'gross' }), { jugadores: dos, hoyos: nueve }).ok).toBe(true)
    const nueveBien = nueve.map((h, i) => ({ ...h, si: i + 1 }))
    expect(validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, { jugadores: [{ nombre: 'Plus', courseHandicap: -2 }, { nombre: 'Tito', courseHandicap: 28 }], hoyos: nueveBien }))
      .toMatchObject({ errores: ['Tito recibe más de 3 golpes por hoyo: baja el % de hándicap o juega en gross.'] })
    expect(validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, { jugadores: dos, hoyos: [] }))
      .toMatchObject({ errores: ['Elige la cancha y los hoyos antes de armar el skins.'] })
  })

  it('dos sin hándicap: un mensaje por jugador', () => {
    const r = validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, ctx([{ nombre: 'Ana', courseHandicap: null }, { nombre: 'Beto', courseHandicap: null }]))
    expect(r).toMatchObject({ errores: [expect.stringMatching(/^Ana no tiene/), expect.stringMatching(/^Beto no tiene/)] })
  })

  it('la clave del formato', () => {
    expect(esFormatoSkins('skins')).toBe(true)
    expect(esFormatoSkins('personalizado')).toBe(false)
    expect(esFormatoSkins(null)).toBe(false)
  })
})
