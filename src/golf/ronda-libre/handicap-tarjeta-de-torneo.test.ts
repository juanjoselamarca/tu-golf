import { describe, it, expect } from 'vitest'
import { filaDeHandicapDeTorneo, handicapDeLaTarjeta, type InscritoParaTarjeta } from './handicap-tarjeta-de-torneo'
import { handicapOcultoSinSesion, indiceVieneDelPerfil } from './permisos'
import { handicapDeLaTarjeta as reexportada } from '@/lib/data/tournaments/startTournament'

const conCuenta = (hcp: number | null, indicePerfil: number | null): InscritoParaTarjeta => ({
  user_id: 'u1', handicap_at_registration: hcp, profiles: { indice: indicePerfil },
})
const invitado = (hcp: number | null): InscritoParaTarjeta => ({ user_id: null, handicap_at_registration: hcp, profiles: null })

/** La fila tal como queda en `ronda_libre_jugadores` (sin columna escrita → default de la base: false). */
const filaEnLaBase = (player: InscritoParaTarjeta, modo: string | null, equipo: boolean) => {
  const f = filaDeHandicapDeTorneo(player, modo, equipo)
  return { user_id: player.user_id, handicap: null, handicap_de_inscripcion: false, ...f }
}

describe('filaDeHandicapDeTorneo — WHS', () => {
  it.each([
    ['cuenta, individual', conCuenta(12.3, 11.0), false, 12.3],
    ['cuenta, equipo', conCuenta(12.3, 11.0), true, 12.3],
    ['invitado, individual', invitado(20), false, 20],
    ['invitado, equipo', invitado(0), true, 0],
  ])('%s → lo inscrito con la marca (nunca el perfil vivo)', (_c, p, equipo, esperado) => {
    expect(filaDeHandicapDeTorneo(p, 'whs', equipo)).toEqual({ handicap: esperado, handicap_de_inscripcion: true })
  })
  it('sin índice inscrito → null con la marca (S/Ind, no un 0 que parece scratch), aunque el perfil tenga índice', () => {
    expect(filaDeHandicapDeTorneo(conCuenta(null, 8), 'whs', false)).toEqual({ handicap: null, handicap_de_inscripcion: true })
    expect(filaDeHandicapDeTorneo(invitado(null), 'whs', true)).toEqual({ handicap: null, handicap_de_inscripcion: true })
  })
  it('la fila de un jugador con cuenta queda oculta sin sesión y NO cae al perfil', () => {
    const f = filaEnLaBase(conCuenta(12.3, 11), 'whs', false)
    expect(handicapOcultoSinSesion(f)).toBe(true)
    expect(indiceVieneDelPerfil(f)).toBe(false)
    const sinIndice = filaEnLaBase(conCuenta(null, 11), 'whs', false)
    expect(handicapOcultoSinSesion(sinIndice)).toBe(true)
    expect(indiceVieneDelPerfil(sinIndice)).toBe(false)
  })
  it('la fila de un invitado se sigue mostrando', () => {
    expect(handicapOcultoSinSesion(filaEnLaBase(invitado(20), 'whs', false))).toBe(false)
  })
})

describe('filaDeHandicapDeTorneo — raw (y modo desconocido/null)', () => {
  it.each([['raw'], [null], ['otro']])('modo %s, individual con cuenta → nada: el índice sale del perfil, como hoy', (modo) => {
    expect(filaDeHandicapDeTorneo(conCuenta(14, 9.1), modo, false)).toEqual({})
    const f = filaEnLaBase(conCuenta(14, 9.1), modo, false)
    expect(indiceVieneDelPerfil(f)).toBe(true)
    expect(handicapOcultoSinSesion(f)).toBe(true)
  })
  it('individual sin cuenta → lo inscrito (sin perfil) con la marca; visible sin sesión', () => {
    expect(filaDeHandicapDeTorneo(invitado(14), 'raw', false)).toEqual({ handicap: 14, handicap_de_inscripcion: true })
    expect(filaDeHandicapDeTorneo(invitado(null), 'raw', false)).toEqual({ handicap: 0, handicap_de_inscripcion: true })
    expect(handicapOcultoSinSesion(filaEnLaBase(invitado(14), 'raw', false))).toBe(false)
  })
  it('equipo con cuenta → índice del perfil (lo inscrito en raw es course handicap) con la marca; oculto sin sesión', () => {
    expect(filaDeHandicapDeTorneo(conCuenta(14, 9.1), 'raw', true)).toEqual({ handicap: 9.1, handicap_de_inscripcion: true })
    expect(filaDeHandicapDeTorneo(conCuenta(14, null), 'raw', true)).toEqual({ handicap: 14, handicap_de_inscripcion: true })
    expect(filaDeHandicapDeTorneo(conCuenta(null, null), 'raw', true)).toEqual({ handicap: 0, handicap_de_inscripcion: true })
    expect(handicapOcultoSinSesion(filaEnLaBase(conCuenta(14, 9.1), 'raw', true))).toBe(true)
  })
  it('equipo invitado → lo inscrito con la marca; visible', () => {
    expect(filaDeHandicapDeTorneo(invitado(7), 'raw', true)).toEqual({ handicap: 7, handicap_de_inscripcion: true })
    expect(handicapOcultoSinSesion(filaEnLaBase(invitado(7), 'raw', true))).toBe(false)
  })
  it('el handicap escrito en raw es el mismo que antes (handicapDeLaTarjeta)', () => {
    for (const p of [conCuenta(14, 9.1), conCuenta(14, null), invitado(3), invitado(null)]) {
      const f = filaDeHandicapDeTorneo(p, 'raw', true)
      expect('handicap' in f && f.handicap).toBe(handicapDeLaTarjeta(p, 'raw'))
    }
  })
})

describe('handicapDeLaTarjeta', () => {
  it('se re-exporta desde startTournament (misma función)', () => {
    expect(reexportada).toBe(handicapDeLaTarjeta)
  })
  it('WHS: lo inscrito, 0 si falta; raw: perfil, si no lo inscrito, si no 0', () => {
    expect(handicapDeLaTarjeta(conCuenta(12, 8), 'whs')).toBe(12)
    expect(handicapDeLaTarjeta(conCuenta(null, 8), 'whs')).toBe(0)
    expect(handicapDeLaTarjeta(conCuenta(12, 8), 'raw')).toBe(8)
    expect(handicapDeLaTarjeta(invitado(null), 'raw')).toBe(0)
  })
})
