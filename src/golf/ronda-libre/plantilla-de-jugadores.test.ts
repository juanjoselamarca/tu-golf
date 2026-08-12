import { describe, it, expect } from 'vitest'
import {
  MAX_JUGADORES_POR_RONDA,
  EQUIPOS_MINIMOS,
  maxRivales,
  maxEquipos,
  jugadoresMinimos,
  jugadoresPorEquipo,
  rivalesIniciales,
  exigeLlevarElScoreDelGrupo,
} from './plantilla-de-jugadores'
import { KNOWN_FORMAT_KEYS, TEAM_FORMAT_KEYS } from '@/golf/formats'
import type { FormatoJuego } from '@/golf/core/rules'

const FORMATOS = KNOWN_FORMAT_KEYS as ReadonlyArray<FormatoJuego>

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
    for (const formato of TEAM_FORMAT_KEYS as ReadonlyArray<FormatoJuego>) {
      expect(1 + maxRivales(formato)).toBeGreaterThanOrEqual(jugadoresMinimos(formato))
    }
  })
})

describe('jugadoresMinimos', () => {
  it('match play son dos', () => {
    expect(jugadoresMinimos('match_play')).toBe(2)
  })

  it('los formatos por equipo son dos equipos completos', () => {
    expect(jugadoresMinimos('best_ball')).toBe(4)
    expect(jugadoresMinimos('scramble')).toBe(4)
    expect(jugadoresMinimos('foursome')).toBe(4)
  })

  it('stroke play se puede jugar solo', () => {
    expect(jugadoresMinimos('stroke_play')).toBe(1)
  })
})

describe('jugadoresPorEquipo', () => {
  it('no propone equipos más grandes de lo que la ronda permite', () => {
    for (const formato of TEAM_FORMAT_KEYS as ReadonlyArray<FormatoJuego>) {
      const porEquipo = jugadoresPorEquipo(formato)
      expect(porEquipo).not.toBeNull()
      expect(porEquipo!.max * EQUIPOS_MINIMOS).toBeLessThanOrEqual(MAX_JUGADORES_POR_RONDA)
      expect(porEquipo!.min).toBeLessThanOrEqual(porEquipo!.max)
    }
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
    for (const formato of TEAM_FORMAT_KEYS as ReadonlyArray<FormatoJuego>) {
      const porEquipo = jugadoresPorEquipo(formato)!
      expect(maxEquipos(formato) * porEquipo.min).toBeLessThanOrEqual(MAX_JUGADORES_POR_RONDA)
    }
  })

  it('siempre deja armar al menos dos equipos', () => {
    for (const formato of FORMATOS) {
      expect(maxEquipos(formato)).toBeGreaterThanOrEqual(EQUIPOS_MINIMOS)
    }
  })
})

describe('rivalesIniciales', () => {
  it('match play crea el rival de entrada', () => {
    expect(rivalesIniciales('match_play')).toBe(1)
  })

  it('los formatos por equipo crean los tres rivales que faltan', () => {
    for (const formato of TEAM_FORMAT_KEYS as ReadonlyArray<FormatoJuego>) {
      expect(rivalesIniciales(formato)).toBe(3)
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
  it('todo formato que arranca con rivales obliga el modo grupo', () => {
    expect(exigeLlevarElScoreDelGrupo('match_play')).toBe(true)
    expect(exigeLlevarElScoreDelGrupo('stableford')).toBe(true)
    expect(exigeLlevarElScoreDelGrupo('best_ball')).toBe(true)
    expect(exigeLlevarElScoreDelGrupo('stroke_play')).toBe(false)
  })
})
