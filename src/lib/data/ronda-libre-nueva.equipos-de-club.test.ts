import { describe, it, expect } from 'vitest'
import { equiposDeClubDeLaRonda } from './ronda-libre-nueva'

describe('equiposDeClubDeLaRonda — repetir una ronda de scramble rápido', () => {
  it('devuelve los nombres en orden si todos los equipos son de club', () => {
    expect(equiposDeClubDeLaRonda([
      { nombre: 'Los Tigres', handicap_origen: 'club' },
      { nombre: 'Equipo 2', handicap_origen: 'club' },
    ])).toEqual(['Los Tigres', 'Equipo 2'])
  })

  it('una ronda con jugadores (o sin equipos) no es de club', () => {
    expect(equiposDeClubDeLaRonda([{ nombre: 'Equipo 1', handicap_origen: 'calculado' }])).toBeNull()
    expect(equiposDeClubDeLaRonda([])).toBeNull()
    expect(equiposDeClubDeLaRonda(null)).toBeNull()
    expect(equiposDeClubDeLaRonda(undefined)).toBeNull()
  })

  it('una mezcla (no debería existir) no se repite como de club', () => {
    expect(equiposDeClubDeLaRonda([
      { nombre: 'Los Tigres', handicap_origen: 'club' },
      { nombre: 'Equipo 2', handicap_origen: 'calculado' },
    ])).toBeNull()
  })
})
