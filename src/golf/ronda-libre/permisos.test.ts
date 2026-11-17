import { describe, it, expect } from 'vitest'
import { esMiTarjeta, handicapOcultoSinSesion, indiceVieneDelPerfil, puedeDescartarRonda, anotaLaRonda } from './permisos'

describe('puedeDescartarRonda — espejo de descartar_ronda_libre (P0003)', () => {
  const ronda = { creador_id: 'u1', es_demo: false }
  it('sólo el creador con sesión', () => {
    expect(puedeDescartarRonda(ronda, 'u1')).toBe(true)
    expect(puedeDescartarRonda(ronda, 'u2')).toBe(false)
    expect(puedeDescartarRonda(ronda, null)).toBe(false)
    expect(puedeDescartarRonda(ronda, undefined)).toBe(false)
  })
  it('nunca una demo, nunca sin ronda o sin creador', () => {
    expect(puedeDescartarRonda({ ...ronda, es_demo: true }, 'u1')).toBe(false)
    expect(puedeDescartarRonda(null, 'u1')).toBe(false)
    expect(puedeDescartarRonda({ creador_id: null }, 'u1')).toBe(false)
    expect(puedeDescartarRonda({}, 'u1')).toBe(false)
  })
})

describe('esMiTarjeta — fuente única de "es mi tarjeta" (finalizadores y máscara del GWI)', () => {
  it('sólo con el mismo user_id no vacío', () => {
    expect(esMiTarjeta({ user_id: 'u1' }, 'u1')).toBe(true)
    expect(esMiTarjeta({ user_id: 'u2' }, 'u1')).toBe(false)
  })
  it('user_id vacío, null o ausente nunca es propia (ni con visor vacío)', () => {
    expect(esMiTarjeta({ user_id: '' }, '')).toBe(false)
    expect(esMiTarjeta({ user_id: '' }, 'u1')).toBe(false)
    expect(esMiTarjeta({ user_id: 'u1' }, '')).toBe(false)
    expect(esMiTarjeta({ user_id: null }, null)).toBe(false)
    expect(esMiTarjeta({}, undefined)).toBe(false)
    expect(esMiTarjeta(null, 'u1')).toBe(false)
  })
})

// Tabla completa: user_id (con/sin) × handicap (null/0/número) × marca (true/false/null).
// [user_id, handicap, marca, indiceVieneDelPerfil, handicapOcultoSinSesion, caso]
const TABLA: Array<[string | null, number | null, boolean | null, boolean, boolean, string]> = [
  ['u1', null, false, true, true, 'cuenta sin handicap en la tarjeta (torneo raw individual): perfil y oculto'],
  ['u1', null, null, true, true, 'ídem con la marca null'],
  ['u1', null, true, false, true, 'torneo WHS sin índice inscrito: no cae al perfil (S/Ind), oculto'],
  ['u1', 12, false, false, false, 'creador de ronda libre que tipeó su índice: manda la tarjeta y se ve'],
  ['u1', 12, null, false, false, 'ídem con la marca null'],
  ['u1', 0, false, false, false, 'cuenta con handicap 0 tipeado: se ve'],
  ['u1', 12, true, false, true, 'torneo con hándicap inscrito: manda la tarjeta, pero oculto'],
  ['u1', 0, true, false, true, 'torneo con hándicap inscrito 0: oculto'],
  [null, 7, false, false, false, 'invitado de ronda libre'],
  [null, 7, true, false, false, 'invitado de torneo: su número se ve'],
  [null, 0, true, false, false, 'invitado de torneo con 0'],
  [null, null, false, false, false, 'invitado sin índice'],
  [null, null, true, false, false, 'invitado de torneo sin índice'],
  [null, null, null, false, false, 'invitado sin índice, marca null'],
]

describe('indiceVieneDelPerfil (FUENTE) y handicapOcultoSinSesion (PRIVACIDAD) — tabla completa', () => {
  it.each(TABLA)('user_id=%s handicap=%s marca=%s → perfil=%s oculto=%s (%s)', (user_id, handicap, marca, perfil, oculto) => {
    const fila = { user_id, handicap, handicap_de_inscripcion: marca }
    expect(indiceVieneDelPerfil(fila)).toBe(perfil)
    expect(handicapOcultoSinSesion(fila)).toBe(oculto)
  })
  it('handicap ausente (undefined) equivale a null', () => {
    expect(indiceVieneDelPerfil({ user_id: 'u1', handicap_de_inscripcion: false })).toBe(true)
    expect(handicapOcultoSinSesion({ user_id: 'u1', handicap_de_inscripcion: false })).toBe(true)
  })
  it('invariante: todo índice que sale del perfil está oculto sin sesión', () => {
    for (const [user_id, handicap, marca] of TABLA) {
      const fila = { user_id, handicap, handicap_de_inscripcion: marca }
      if (indiceVieneDelPerfil(fila)) expect(handicapOcultoSinSesion(fila)).toBe(true)
    }
  })
})

describe('anotaLaRonda (quién lleva el score del grupo: fuente única de las redirecciones del scorer)', () => {
  it('solo el admin de una ronda en modo admin', () => {
    expect(anotaLaRonda({ admin_mode: true, admin_user_id: 'u1' }, 'u1')).toBe(true)
    expect(anotaLaRonda({ admin_mode: true, admin_user_id: 'u1' }, 'u2')).toBe(false)
  })
  it('sin modo admin nadie anota el grupo, aunque admin_user_id coincida (era el bucle /score ↔ /score-grupo)', () => {
    expect(anotaLaRonda({ admin_mode: false, admin_user_id: 'u1' }, 'u1')).toBe(false)
  })
  it('sin sesión o sin ronda: no', () => {
    expect(anotaLaRonda({ admin_mode: true, admin_user_id: null }, null)).toBe(false)
    expect(anotaLaRonda(null, 'u1')).toBe(false)
  })
})
