// 09-nov-2026 (R4794T, revisión del PR #757) — Un Scramble de un solo equipo juega
// contra el par. El cuadro ganador de la pantalla ya lo decía, pero la imagen que
// se comparte por WhatsApp seguía titulando "EQUIPO GANADOR" con trofeo. Ahora las
// dos salen de `etiquetaDelResultadoDeEquipos`.
import { describe, it, expect } from 'vitest'
import { encabezadoDeRondaLibre, tarjetaDeEquipos, type LeaderboardShareData } from './share-card'

const base = (teams: LeaderboardShareData['teams']): LeaderboardShareData => ({
  players: [],
  courseName: 'Los Leones',
  fecha: '9 nov 2026',
  rondaCodigo: 'R4794T',
  isFinished: true,
  totalHoles: 18,
  formato_juego: 'scramble',
  modo_juego: 'gross',
  teams,
})

describe('tarjetaDeEquipos', () => {
  it('un solo equipo: la tarjeta sale contra el par, sin "ganador"', () => {
    const tarjeta = tarjetaDeEquipos(base([{ nombre: 'Equipo 1', jugadores: ['Cristián', 'Pedro'], score: 76, diff: 4 }]))
    expect(tarjeta?.contraElPar).toBe(true)
    expect(tarjeta?.esEmpate).toBe(false)
    expect(tarjeta?.teamNombre).toBe('Equipo 1')
    expect(encabezadoDeRondaLibre(tarjeta!)).toEqual({ emoji: '⛳', titulo: 'CONTRA EL PAR' })
  })

  it('dos equipos: hay equipo ganador con trofeo', () => {
    const tarjeta = tarjetaDeEquipos(base([
      { nombre: 'Los Cóndores', jugadores: ['A', 'B'], score: 70, diff: -2 },
      { nombre: 'Equipo 2', jugadores: ['C', 'D'], score: 74, diff: 2 },
    ]))
    expect(tarjeta?.contraElPar).toBe(false)
    expect(encabezadoDeRondaLibre(tarjeta!)).toEqual({ emoji: '🏆', titulo: 'EQUIPO GANADOR' })
  })

  it('dos equipos empatados: el título dice empate (antes decía "equipo ganador" igual)', () => {
    const tarjeta = tarjetaDeEquipos(base([
      { nombre: 'Uno', jugadores: ['A', 'B'], score: 72, diff: 0 },
      { nombre: 'Dos', jugadores: ['C', 'D'], score: 72, diff: 0 },
    ]))
    expect(tarjeta?.esEmpate).toBe(true)
    expect(tarjeta?.jugadores).toEqual(['Uno', 'Dos'])
    expect(encabezadoDeRondaLibre(tarjeta!)).toEqual({ emoji: '🤝', titulo: 'EMPATE' })
  })

  it('sin equipos o fuera de un formato por equipos no hay tarjeta', () => {
    expect(tarjetaDeEquipos(base([]))).toBeNull()
    expect(tarjetaDeEquipos({ ...base([{ nombre: 'X', jugadores: [], score: 72, diff: 0 }]), formato_juego: 'stroke_play' })).toBeNull()
  })
})

describe('encabezadoDeRondaLibre — individual', () => {
  it('ganador y empate como siempre', () => {
    expect(encabezadoDeRondaLibre({ esEmpate: false })).toEqual({ emoji: '🏆', titulo: 'GANADOR DE LA RONDA' })
    expect(encabezadoDeRondaLibre({ esEmpate: true })).toEqual({ emoji: '🤝', titulo: 'EMPATE ÉPICO' })
  })
})
