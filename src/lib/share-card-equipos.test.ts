// 09-nov-2026 (R4794T, revisión del PR #757) — Un Scramble de un solo equipo juega
// contra el par. El cuadro ganador de la pantalla ya lo decía, pero la imagen que
// se comparte por WhatsApp seguía titulando "EQUIPO GANADOR" con trofeo. Ahora las
// dos salen de `etiquetaDelResultadoDeEquipos`.
import { describe, it, expect } from 'vitest'
import {
  encabezadoDeRondaLibre, nombreDeRondaLibre, partirEnDosLineas, scoreDelTextoParaCompartir, tamanoQueCabe, tarjetaDeEquipos,
  type LeaderboardShareData,
} from './share-card'

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
    const tarjeta = tarjetaDeEquipos(base([{ nombre: 'Equipo 1', jugadores: ['Cristián', 'Pedro'], score: 76, diff: 4, holesPlayed: 18 }]))
    expect(tarjeta?.contraElPar).toBe(true)
    expect(tarjeta?.esEmpate).toBe(false)
    expect(tarjeta?.teamNombre).toBe('Equipo 1')
    expect(encabezadoDeRondaLibre(tarjeta!)).toEqual({ emoji: '⛳', titulo: 'CONTRA EL PAR' })
  })

  it('dos equipos: hay equipo ganador con trofeo', () => {
    const tarjeta = tarjetaDeEquipos(base([
      { nombre: 'Los Cóndores', jugadores: ['A', 'B'], score: 70, diff: -2, holesPlayed: 18 },
      { nombre: 'Equipo 2', jugadores: ['C', 'D'], score: 74, diff: 2, holesPlayed: 18 },
    ]))
    expect(tarjeta?.contraElPar).toBe(false)
    expect(encabezadoDeRondaLibre(tarjeta!)).toEqual({ emoji: '🏆', titulo: 'EQUIPO GANADOR' })
  })

  it('dos equipos empatados: el título dice empate (antes decía "equipo ganador" igual)', () => {
    const tarjeta = tarjetaDeEquipos(base([
      { nombre: 'Uno', jugadores: ['A', 'B'], score: 72, diff: 0, holesPlayed: 18 },
      { nombre: 'Dos', jugadores: ['C', 'D'], score: 72, diff: 0, holesPlayed: 18 },
    ]))
    expect(tarjeta?.esEmpate).toBe(true)
    expect(tarjeta?.jugadores).toEqual(['Uno', 'Dos'])
    expect(encabezadoDeRondaLibre(tarjeta!)).toEqual({ emoji: '🤝', titulo: 'EMPATE' })
    // El nombre grande nombra a los dos, como el cuadro de la pantalla; no al primero solo.
    expect(nombreDeRondaLibre(tarjeta!)).toBe('Uno y Dos')
  })

  it('el empate se decide por diff (vs par), igual que en la pantalla, no por golpes', () => {
    const tarjeta = tarjetaDeEquipos(base([
      { nombre: 'Uno', jugadores: ['A', 'B'], score: 70, diff: -2, holesPlayed: 18 },
      { nombre: 'Dos', jugadores: ['C', 'D'], score: 68, diff: -2, holesPlayed: 17 },
    ]))
    expect(tarjeta?.esEmpate).toBe(true)
    expect(nombreDeRondaLibre(tarjeta!)).toBe('Uno y Dos')
  })

  it('un equipo que no anotó nada no empata con el líder aunque los dos digan E', () => {
    const tarjeta = tarjetaDeEquipos(base([
      { nombre: 'Jugó', jugadores: ['A', 'B'], score: 72, diff: 0, holesPlayed: 18 },
      { nombre: 'Vacío', jugadores: ['C', 'D'], score: 0, diff: 0, holesPlayed: 0 },
    ]))
    expect(tarjeta?.esEmpate).toBe(false)
    expect(tarjeta?.teamNombre).toBe('Jugó')
    expect(tarjeta?.ranking?.[1]).toMatchObject({ nombre: 'Vacío', holesPlayed: 0 })
  })

  it('tres equipos empatados se nombran "Uno, Dos y Tres"', () => {
    const tarjeta = tarjetaDeEquipos(base([
      { nombre: 'Uno', jugadores: ['A'], score: 72, diff: 0, holesPlayed: 18 },
      { nombre: 'Dos', jugadores: ['B'], score: 72, diff: 0, holesPlayed: 18 },
      { nombre: 'Tres', jugadores: ['C'], score: 72, diff: 0, holesPlayed: 18 },
    ]))
    expect(nombreDeRondaLibre(tarjeta!)).toBe('Uno, Dos y Tres')
  })

  it('sin empate el nombre es el del equipo; en individual, los nombres de pila empatados', () => {
    expect(nombreDeRondaLibre({ ganador: 'Equipo 1', esEmpate: false, teamNombre: 'Equipo 1' })).toBe('Equipo 1')
    expect(nombreDeRondaLibre({ ganador: 'Juan Pérez', esEmpate: true, jugadores: ['Juan Pérez', 'Max Undurraga'] })).toBe('Juan · Max')
    expect(nombreDeRondaLibre({ ganador: 'Juan Pérez', esEmpate: false })).toBe('Juan Pérez')
  })

  it('sin equipos o fuera de un formato por equipos no hay tarjeta', () => {
    expect(tarjetaDeEquipos(base([]))).toBeNull()
    // Ningún equipo anotó un hoyo: tampoco (sería un "ganador" sin score).
    expect(tarjetaDeEquipos(base([{ nombre: 'X', jugadores: [], score: 0, diff: 0, holesPlayed: 0 }]))).toBeNull()
    expect(tarjetaDeEquipos({ ...base([{ nombre: 'X', jugadores: [], score: 72, diff: 0, holesPlayed: 18 }]), formato_juego: 'stroke_play' })).toBeNull()
  })
})

describe('encabezadoDeRondaLibre — individual', () => {
  it('ganador y empate como siempre', () => {
    expect(encabezadoDeRondaLibre({ esEmpate: false })).toEqual({ emoji: '🏆', titulo: 'GANADOR DE LA RONDA' })
    expect(encabezadoDeRondaLibre({ esEmpate: true })).toEqual({ emoji: '🤝', titulo: 'EMPATE ÉPICO' })
  })
})

describe('scoreDelTextoParaCompartir', () => {
  const base = {
    tipo: 'ronda_libre' as const, ganador: 'A', esEmpate: false, courseName: 'C', fecha: '', jugadores: [],
    scoreGross: 37, scoreDiff: 5, formato_juego: 'scramble',
  }
  it('sin empate dice el bruto y el vs par', () => {
    expect(scoreDelTextoParaCompartir(base as never)).toBe('37 (+5)')
  })
  it('con empate dice el vs par, igual que la imagen: los brutos de los empatados pueden diferir', () => {
    expect(scoreDelTextoParaCompartir({ ...base, esEmpate: true } as never)).toBe('+5 sobre el par')
    expect(scoreDelTextoParaCompartir({ ...base, esEmpate: true, scoreDiff: 0 } as never)).toBe('en el par')
    expect(scoreDelTextoParaCompartir({ ...base, esEmpate: true, scoreDiff: -2 } as never)).toBe('-2 bajo el par')
  })
  it('stableford dice puntos, con o sin empate', () => {
    expect(scoreDelTextoParaCompartir({ ...base, esEmpate: true, formato_juego: 'stableford', scoreGross: 36 } as never)).toBe('36 pts')
  })
})

describe('el nombre grande cabe en el lienzo', () => {
  // Ancho simulado: 15 px por carácter a 68px, proporcional al tamaño.
  const medir = (texto: string) => (px: number) => texto.length * 15 * (px / 68)

  it('un nombre corto se queda en 68px', () => {
    expect(tamanoQueCabe(medir('Equipo 1'), 68, 40, 960)).toBe(68)
  })

  it('un nombre largo baja hasta caber, y no baja del mínimo', () => {
    const largo = 'Los Cóndores de Chicureo y Las Águilas del Sur' // 46 caracteres: 690 px a 68px → cabe a 68 en 960
    expect(tamanoQueCabe(medir(largo), 68, 40, 960)).toBe(68)
    expect(tamanoQueCabe(medir(largo), 68, 40, 600)).toBe(58) // 46·15·58/68 = 588 ≤ 600
    expect(tamanoQueCabe(medir(largo), 68, 40, 100)).toBe(40)
  })

  it('se parte en dos líneas por el espacio más cercano al medio', () => {
    expect(partirEnDosLineas('Los Cóndores de Chicureo y Las Águilas del Sur')).toEqual(['Los Cóndores de Chicureo', 'y Las Águilas del Sur'])
    expect(partirEnDosLineas('Equipo1yEquipo2')).toEqual(['Equipo1yEquipo2', ''])
  })
})

describe('tarjetaDeEquipos — posición del ranking de la imagen', () => {
  it('mismo vs par = T1 y T1 (como la tabla), no "1." y "2."; quien no anotó, sin número', () => {
    const tarjeta = tarjetaDeEquipos(base([
      { nombre: 'Uno', jugadores: ['A', 'B'], score: 70, diff: -2, holesPlayed: 18 },
      { nombre: 'Dos', jugadores: ['C', 'D'], score: 70, diff: -2, holesPlayed: 18 },
      { nombre: 'Tres', jugadores: ['E', 'F'], score: 75, diff: 3, holesPlayed: 18 },
      { nombre: 'Cuatro', jugadores: ['G', 'H'], score: 0, diff: 0, holesPlayed: 0 },
    ]))
    expect(tarjeta?.ranking?.map((r) => r.posicion)).toEqual(['T1', 'T1', '3', null])
  })
})
