import { describe, it, expect } from 'vitest'
import { CONFIG_SKINS_POR_DEFECTO, validarConfigSkins, opcionesDelMotor, esFormatoSkins, type ConfigSkins } from './index'

const dos = [{ nombre: 'Ana', courseHandicap: 12 }, { nombre: 'Beto', courseHandicap: 3 }]
const con = (cambios: Partial<ConfigSkins>) => ({ ...CONFIG_SKINS_POR_DEFECTO, ...cambios })

describe('reglas del skins (spec «Variantes»)', () => {
  it('los defaults de la spec: neto, 100 %, repartir, sin validación, sin pozo', () => {
    expect(validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, { jugadores: dos })).toEqual({ ok: true, config: CONFIG_SKINS_POR_DEFECTO })
  })

  it('acepta el caso del campeonato: 75 %, validación, pozo y especiales', () => {
    const c = con({ hcpPct: 75, validacion: true, pozoPorJugador: 30000, especiales: [{ id: 'g', tipo: 'greenie' }, { id: 'p', tipo: 'propio', nombre: 'Árbol' }] })
    expect(validarConfigSkins(c, { jugadores: dos }).ok).toBe(true)
    expect(opcionesDelMotor(c)).toEqual({ modo: 'neto', empateUltimoHoyo: 'repartir', validacion: true, pozoPorJugador: 30000 })
  })

  it.each([
    ['% fuera de las opciones', { hcpPct: 70 }],
    ['pozo con decimales', { pozoPorJugador: 1000.5 }],
    ['pozo negativo', { pozoPorJugador: -1 }],
    ['birdie como especial', { especiales: [{ id: 'b', tipo: 'birdie' }] }],
    ['versión desconocida', { version: 2 }],
  ])('rechaza %s', (_, cambios) => {
    expect(validarConfigSkins({ ...CONFIG_SKINS_POR_DEFECTO, ...cambios }, { jugadores: dos })).toMatchObject({ ok: false })
  })

  it('neto con un jugador sin índice: lo nombra y ofrece gross', () => {
    const r = validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, { jugadores: [...dos, { nombre: 'Coni', courseHandicap: null }] })
    expect(r).toEqual({ ok: false, errores: ['Coni no tiene hándicap: el skins neto lo necesita. Juega en gross o agrega su índice.'] })
    expect(validarConfigSkins(con({ modo: 'gross' }), { jugadores: [...dos, { nombre: 'Coni', courseHandicap: null }] }).ok).toBe(true)
  })

  it('menos de 2 jugadores, especial repetido o propio sin nombre: rechaza con el motivo', () => {
    expect(validarConfigSkins(CONFIG_SKINS_POR_DEFECTO, { jugadores: [dos[0]] })).toMatchObject({ errores: ['El skins es para 2 jugadores o más.'] })
    expect(validarConfigSkins(con({ especiales: [{ id: 'a', tipo: 'sandy' }, { id: 'b', tipo: 'sandy' }] }), { jugadores: dos }))
      .toMatchObject({ errores: ['Cada punto especial va una sola vez.'] })
    expect(validarConfigSkins(con({ especiales: [{ id: 'a', tipo: 'propio' }] }), { jugadores: dos }))
      .toMatchObject({ errores: ['Ponle nombre a tu punto especial.'] })
  })

  it('la clave del formato', () => {
    expect(esFormatoSkins('skins')).toBe(true)
    expect(esFormatoSkins('personalizado')).toBe(false)
    expect(esFormatoSkins(null)).toBe(false)
  })
})
