import { describe, it, expect } from 'vitest'
import {
  MAX_JUGADORES_POR_RONDA,
  EQUIPOS_MINIMOS,
  EQUIPOS_PARA_COMPETIR,
  maxRivales,
  maxEquipos,
  jugadoresMinimos,
  jugadoresPorEquipo,
  puedeSumarCompanero,
  puedeSumarEquipo,
  rivalesIniciales,
  exigeLlevarElScoreDelGrupo,
} from './plantilla-de-jugadores'
import { KNOWN_FORMAT_KEYS, TEAM_FORMAT_KEYS } from '@/golf/formats'
import type { FormatoJuego } from '@/golf/core/rules'

const FORMATOS = KNOWN_FORMAT_KEYS as ReadonlyArray<FormatoJuego>
const DE_EQUIPO = TEAM_FORMAT_KEYS as ReadonlyArray<FormatoJuego>

describe('maxRivales', () => {
  it('match play admite exactamente un rival', () => {
    expect(maxRivales('match_play')).toBe(1)
  })

  it('ningún formato deja pasar del techo de la API', () => {
    // La API valida `jugadores: z.array(...).max(4)`. Un techo más alto acá
    // produce rondas que el servidor rechaza recién al enviar.
    for (const formato of FORMATOS) {
      expect(1 + maxRivales(formato)).toBeLessThanOrEqual(MAX_JUGADORES_POR_RONDA)
    }
  })

  it('los formatos por equipo permiten llegar a su mínimo jugable', () => {
    for (const formato of DE_EQUIPO) {
      expect(1 + maxRivales(formato)).toBeGreaterThanOrEqual(jugadoresMinimos(formato))
    }
  })
})

describe('jugadoresMinimos', () => {
  it('match play son dos', () => {
    expect(jugadoresMinimos('match_play')).toBe(2)
  })

  // Un equipo solo juega contra el par. Antes eran dos equipos obligatorios
  // (4 jugadores): un usuario que jugaba scramble de a dos no podía crear la
  // ronda, y al volver a stroke play el formulario quedaba en modo grupo.
  it('los formatos por equipo son UN equipo completo: se puede jugar contra el par', () => {
    expect(EQUIPOS_MINIMOS).toBe(1)
    expect(jugadoresMinimos('best_ball')).toBe(2)
    expect(jugadoresMinimos('scramble')).toBe(2)
    expect(jugadoresMinimos('foursome')).toBe(2)
  })

  it('stroke play se puede jugar solo', () => {
    expect(jugadoresMinimos('stroke_play')).toBe(1)
  })
})

describe('jugadoresPorEquipo', () => {
  it('un equipo nunca propone más jugadores de los que admite la ronda', () => {
    for (const formato of DE_EQUIPO) {
      const porEquipo = jugadoresPorEquipo(formato)
      expect(porEquipo).not.toBeNull()
      expect(porEquipo!.max).toBeLessThanOrEqual(MAX_JUGADORES_POR_RONDA)
      expect(porEquipo!.min).toBeLessThanOrEqual(porEquipo!.max)
    }
  })

  it('un scramble de 4 contra el par cabe en un solo equipo (tiene tabla oficial de handicap)', () => {
    expect(jugadoresPorEquipo('scramble')).toEqual({ min: 2, max: 4 })
    expect(jugadoresPorEquipo('best_ball')).toEqual({ min: 2, max: 4 })
  })

  it('foursome es exactamente de a dos', () => {
    expect(jugadoresPorEquipo('foursome')).toEqual({ min: 2, max: 2 })
  })

  it('los formatos individuales no tienen equipos', () => {
    expect(jugadoresPorEquipo('stroke_play')).toBeNull()
    expect(jugadoresPorEquipo('match_play')).toBeNull()
  })
})

describe('maxEquipos', () => {
  it('no ofrece un equipo que nunca se podría completar', () => {
    // Cada equipo extra exige `min` jugadores más. Ofrecer uno que no entra
    // deja la ronda sin poder crearse: la validación exige el mínimo en TODOS.
    for (const formato of DE_EQUIPO) {
      const porEquipo = jugadoresPorEquipo(formato)!
      expect(maxEquipos(formato) * porEquipo.min).toBeLessThanOrEqual(MAX_JUGADORES_POR_RONDA)
    }
  })

  it('siempre deja armar un rival: con un rival hay ganador', () => {
    for (const formato of FORMATOS) {
      expect(maxEquipos(formato)).toBeGreaterThanOrEqual(EQUIPOS_PARA_COMPETIR)
    }
  })
})

describe('puedeSumarCompanero / puedeSumarEquipo', () => {
  it('a un equipo de dos en scramble se le suma un tercero mientras la ronda tenga cupo', () => {
    expect(puedeSumarCompanero('scramble', 2, 2)).toBe(true)
    expect(puedeSumarCompanero('scramble', 4, 4)).toBe(false)
    // 2+2: ningún equipo puede crecer aunque le quede tabla (3, 4), la ronda está llena.
    expect(puedeSumarCompanero('scramble', 2, 4)).toBe(false)
  })

  it('foursome no admite un tercero en la pareja', () => {
    expect(puedeSumarCompanero('foursome', 2, 2)).toBe(false)
  })

  it('un rival se abre sólo si caben sus dos jugadores', () => {
    expect(puedeSumarEquipo('scramble', 1, 2)).toBe(true)
    // Equipo de 3 contra el par: 3 + 2 > 4, no entra un rival.
    expect(puedeSumarEquipo('scramble', 1, 3)).toBe(false)
    // Ya hay dos equipos: no hay un tercero.
    expect(puedeSumarEquipo('scramble', 2, 4)).toBe(false)
  })

  it('los formatos individuales no suman compañeros ni equipos', () => {
    expect(puedeSumarCompanero('stroke_play', 1, 1)).toBe(false)
    expect(puedeSumarEquipo('match_play', 0, 1)).toBe(false)
  })
})

describe('rivalesIniciales', () => {
  it('match play crea el rival de entrada', () => {
    expect(rivalesIniciales('match_play')).toBe(1)
  })

  it('los formatos por equipo crean al compañero que falta, no a tres rivales', () => {
    for (const formato of DE_EQUIPO) {
      expect(rivalesIniciales(formato)).toBe(1)
    }
  })

  it('stableford crea un rival aunque el motor no lo exija — necesita los índices', () => {
    expect(rivalesIniciales('stableford')).toBe(1)
  })

  it('stroke play no fuerza a nadie', () => {
    expect(rivalesIniciales('stroke_play')).toBe(0)
  })

  it('nunca pide más rivales de los que se pueden agregar', () => {
    for (const formato of FORMATOS) {
      expect(rivalesIniciales(formato)).toBeLessThanOrEqual(maxRivales(formato))
    }
  })
})

describe('exigeLlevarElScoreDelGrupo', () => {
  it('todo formato que arranca con rivales se anota desde un solo celular', () => {
    expect(exigeLlevarElScoreDelGrupo('match_play')).toBe(true)
    expect(exigeLlevarElScoreDelGrupo('stableford')).toBe(true)
    for (const formato of DE_EQUIPO) expect(exigeLlevarElScoreDelGrupo(formato)).toBe(true)
    expect(exigeLlevarElScoreDelGrupo('stroke_play')).toBe(false)
  })
})
