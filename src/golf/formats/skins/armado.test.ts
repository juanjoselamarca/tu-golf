import { describe, it, expect } from 'vitest'
import { CONFIG_SKINS_POR_DEFECTO } from './config'
import {
  HOYOS_SKINS, PUNTITOS_DEL_CATALOGO_SKINS, alternarPuntitoSkins, esCantidadDeHoyosDelSkins, leerPozoEscrito,
} from './armado'

describe('armado del skins', () => {
  it('los puntos especiales propuestos son los de la Timba sin birdie (el birdie ya gana el hoyo)', () => {
    expect(PUNTITOS_DEL_CATALOGO_SKINS).not.toContain('birdie')
    expect(PUNTITOS_DEL_CATALOGO_SKINS.length).toBeGreaterThan(0)
  })

  it('alternar agrega con id = tipo y vuelve a quitar', () => {
    const tipo = PUNTITOS_DEL_CATALOGO_SKINS[0]
    const con = alternarPuntitoSkins(CONFIG_SKINS_POR_DEFECTO, tipo)
    expect(con.puntitos).toEqual([{ id: tipo, tipo }])
    expect(alternarPuntitoSkins(con, tipo).puntitos).toEqual([])
  })

  it('18 o 9 hoyos, nada más', () => {
    expect(HOYOS_SKINS).toEqual([18, 9])
    expect(esCantidadDeHoyosDelSkins(18)).toBe(true)
    expect(esCantidadDeHoyosDelSkins(9)).toBe(true)
    expect(esCantidadDeHoyosDelSkins(27)).toBe(false)
    expect(esCantidadDeHoyosDelSkins(6)).toBe(false)
  })

  it('pozo escrito: miles con punto, $ y espacios; vacío = 0; lo que no es monto = null', () => {
    expect(leerPozoEscrito('20.000')).toBe(20000)
    expect(leerPozoEscrito('$ 5.000')).toBe(5000)
    expect(leerPozoEscrito('15000')).toBe(15000)
    expect(leerPozoEscrito('')).toBe(0)
    expect(leerPozoEscrito('abc')).toBeNull()
    expect(leerPozoEscrito('10,5')).toBeNull()
    expect(leerPozoEscrito('-100')).toBeNull()
  })
})
