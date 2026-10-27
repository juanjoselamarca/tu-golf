// #511 — cuándo el scorer NO puede calcular el neto en el teléfono.
import { describe, it, expect } from 'vitest'
import { netoNoDisponibleSinSesion } from './permisos'

const conPerfil = { user_id: 'u1', handicap: null }
const invitado = { user_id: null, handicap: 12 }
const conCuentaYTarjeta = { user_id: 'u2', handicap: 9.4 }

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
  it('todos con índice en la tarjeta → false', () => {
    expect(netoNoDisponibleSinSesion({ modo_juego: 'neto', ronda_libre_jugadores: [invitado, conCuentaYTarjeta] }, false)).toBe(false)
  })
})
