// #511 — cuándo el scorer NO puede calcular el neto en el teléfono.
import { describe, it, expect } from 'vitest'
import { netoNoDisponibleSinSesion } from './permisos'

const conPerfil = { user_id: 'u1', handicap: null, handicap_de_inscripcion: false }
const invitado = { user_id: null, handicap: 12, handicap_de_inscripcion: false }
const conCuentaYTarjeta = { user_id: 'u2', handicap: 9.4, handicap_de_inscripcion: false }
const inscritoDeTorneo = { user_id: 'u3', handicap: 9.4, handicap_de_inscripcion: true }
const invitadoDeTorneo = { user_id: null, handicap: 15, handicap_de_inscripcion: true }

describe('netoNoDisponibleSinSesion', () => {
  it('neto + sin sesión + jugador con índice en su perfil → true', () => {
    expect(netoNoDisponibleSinSesion({ modo_juego: 'neto', ronda_libre_jugadores: [invitado, conPerfil] }, false)).toBe(true)
  })
  it('con sesión → false (profiles es legible por authenticated)', () => {
    expect(netoNoDisponibleSinSesion({ modo_juego: 'neto', ronda_libre_jugadores: [conPerfil] }, true)).toBe(false)
  })
  it('gross → false (el handicap no entra en juego)', () => {
    expect(netoNoDisponibleSinSesion({ modo_juego: 'gross', ronda_libre_jugadores: [conPerfil] }, false)).toBe(false)
  })
  it('todos con índice tipeado en la tarjeta (ronda libre) → false', () => {
    expect(netoNoDisponibleSinSesion({ modo_juego: 'neto', ronda_libre_jugadores: [invitado, conCuentaYTarjeta] }, false)).toBe(false)
  })
  it('tarjeta de torneo con hándicap inscrito de un jugador con cuenta → true (su hándicap no viaja sin sesión)', () => {
    expect(netoNoDisponibleSinSesion({ modo_juego: 'neto', ronda_libre_jugadores: [invitadoDeTorneo, inscritoDeTorneo] }, false)).toBe(true)
    expect(netoNoDisponibleSinSesion({ modo_juego: 'neto', ronda_libre_jugadores: [inscritoDeTorneo] }, true)).toBe(false)
  })
  it('torneo solo con invitados → false (su hándicap se muestra)', () => {
    expect(netoNoDisponibleSinSesion({ modo_juego: 'neto', ronda_libre_jugadores: [invitadoDeTorneo] }, false)).toBe(false)
  })
})
