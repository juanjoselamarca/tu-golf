import { describe, it, expect } from 'vitest'
import {
  MAX_EQUIPOS_DE_CLUB,
  adminModeDeEquiposDeClub,
  esHandicapDeClubValido,
  esHoyosDeEquiposDeClub,
  handicapDeClubMaximo,
  handicapsDeEquipoDeClub,
  esEquipoDeClub,
  admiteEquiposDeClub,
  integrantesQueSeMuestran,
} from './equipos-de-club'

describe('equipos de club — reglas del modo', () => {
  it('hasta 4 equipos', () => {
    expect(MAX_EQUIPOS_DE_CLUB).toBe(4)
  })

  it('se juega a 9 o 18 hoyos, nunca a 27', () => {
    expect(esHoyosDeEquiposDeClub(9)).toBe(true)
    expect(esHoyosDeEquiposDeClub(18)).toBe(true)
    expect(esHoyosDeEquiposDeClub(27)).toBe(false)
    expect(esHoyosDeEquiposDeClub(0)).toBe(false)
  })

  it('el máximo es 36 en 18 hoyos y 18 en 9', () => {
    expect(handicapDeClubMaximo(18)).toBe(36)
    expect(handicapDeClubMaximo(9)).toBe(18)
  })

  it.each([
    [0, 18, true], [36, 18, true], [37, 18, false], [18, 9, true], [19, 9, false], [0, 9, true],
    [-1, 18, false], [8.5, 18, false], [NaN, 18, false], [Infinity, 18, false],
  ])('hándicap %s en %s hoyos → %s', (v, holes, esperado) => {
    expect(esHandicapDeClubValido(v, holes)).toBe(esperado)
  })

  it('null, string o undefined no son hándicap válido (vacío = falta, no 0)', () => {
    expect(esHandicapDeClubValido(null, 18)).toBe(false)
    expect(esHandicapDeClubValido('8', 18)).toBe(false)
    expect(esHandicapDeClubValido(undefined, 18)).toBe(false)
  })

  it('el número del club va igual a las dos columnas; gross va null en las dos', () => {
    expect(handicapsDeEquipoDeClub(8)).toEqual({ completo: 8, juego: 8 })
    expect(handicapsDeEquipoDeClub(0)).toEqual({ completo: 0, juego: 0 })
    expect(handicapsDeEquipoDeClub(null)).toEqual({ completo: null, juego: null })
  })

  it('admin_mode: un celular salvo que se pida uno por equipo con 2 o más equipos', () => {
    expect(adminModeDeEquiposDeClub('uno', 3)).toBe(true)
    expect(adminModeDeEquiposDeClub('cada_equipo', 3)).toBe(false)
    expect(adminModeDeEquiposDeClub('cada_equipo', 1)).toBe(true)
    expect(adminModeDeEquiposDeClub(null, 1)).toBe(true)
  })
})

describe('equipos de club — qué se muestra', () => {
  it('solo handicap_origen "club" es equipo de club; sin la columna o "calculado", no', () => {
    expect(esEquipoDeClub({ handicap_origen: 'club' })).toBe(true)
    expect(esEquipoDeClub({ handicap_origen: 'calculado' })).toBe(false)
    expect(esEquipoDeClub({ handicap_origen: null })).toBe(false)
    expect(esEquipoDeClub({})).toBe(false)
  })

  it('un equipo de club no muestra integrantes (el creador va en el primero solo por la tarjeta)', () => {
    expect(integrantesQueSeMuestran({ handicap_origen: 'club' }, ['Juanjo'])).toEqual([])
  })

  it('un equipo con jugadores muestra a los suyos, en el mismo orden', () => {
    expect(integrantesQueSeMuestran({ handicap_origen: 'calculado' }, ['Ana', 'Beto'])).toEqual(['Ana', 'Beto'])
    expect(integrantesQueSeMuestran({}, ['Ana'])).toEqual(['Ana'])
  })
})

describe('equipos de club — formato', () => {
  it('solo scramble admite equipos de club', () => {
    expect(admiteEquiposDeClub('scramble')).toBe(true)
    for (const f of ['best_ball', 'foursome', 'stroke_play', 'stableford', 'match_play', 'personalizado']) {
      expect(admiteEquiposDeClub(f)).toBe(false)
    }
  })
})
