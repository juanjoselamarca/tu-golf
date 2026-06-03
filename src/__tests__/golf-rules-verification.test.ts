/**
 * Scanner de verificación de reglas oficiales R&A/USGA
 *
 * Este archivo verifica que TODAS las funciones del motor de golf
 * implementan correctamente las reglas oficiales del World Handicap System,
 * Stableford (Rule 32.1b), Match Play (Rule 6.2a), y distribución de strokes.
 *
 * Es una medida preventiva para detectar bugs de teoría del juego.
 */

import { describe, it, expect } from 'vitest'
import {
  puntosStablefordHoyo,
  strokesRecibidosEnHoyo,
  scoreNetoHoyo,
} from '@/golf/core/scoring'
import { calcularDiferenciaHandicap } from '@/golf/formats/match-play'
import { resolverCourseHandicap } from '@/golf/core/course-handicap'
import { FORMAT_META, type ModoJuego, type FormatoJuego } from '@/golf/core/rules'

describe('Verificación reglas oficiales R&A/USGA', () => {

  describe('Stableford — Rule 32.1b', () => {
    const hcp = 0, si = 1
    it('Hole in one en par 3 = eagle = 4pts', () => {
      // 1 en par 3 = -2 = eagle (no albatross)
      expect(puntosStablefordHoyo(1, 3, hcp, si)).toBe(4)
    })
    it('Hole in one en par 4 = albatross = 5pts', () => {
      // 1 en par 4 = -3 = albatross
      expect(puntosStablefordHoyo(1, 4, hcp, si)).toBe(5)
    })
    it('Albatross (3 bajo par neto) = 5pts', () => {
      // 2 en par 5 = -3 = albatross
      expect(puntosStablefordHoyo(2, 5, hcp, si)).toBe(5)
    })
    it('Eagle (2 bajo par neto) = 4pts', () => {
      expect(puntosStablefordHoyo(3, 5, hcp, si)).toBe(4)
    })
    it('Birdie (1 bajo par neto) = 3pts', () => {
      expect(puntosStablefordHoyo(3, 4, hcp, si)).toBe(3)
    })
    it('Par neto = 2pts', () => {
      expect(puntosStablefordHoyo(4, 4, hcp, si)).toBe(2)
    })
    it('Bogey (1 sobre par neto) = 1pt', () => {
      expect(puntosStablefordHoyo(5, 4, hcp, si)).toBe(1)
    })
    it('Double bogey (2+ sobre par neto) = 0pts', () => {
      expect(puntosStablefordHoyo(6, 4, hcp, si)).toBe(0)
    })
    it('Triple bogey = 0pts (nunca negativo)', () => {
      expect(puntosStablefordHoyo(7, 4, hcp, si)).toBe(0)
    })
    it('Quadruple bogey = 0pts', () => {
      expect(puntosStablefordHoyo(8, 4, hcp, si)).toBe(0)
    })
  })

  describe('Stableford Neto — con handicap', () => {
    it('HCP 18 en SI 1: bogey gross = par neto = 2pts', () => {
      // Gross 5 en par 4, SI 1, HCP 18 → recibe 1 stroke → neto 4 = par = 2pts
      expect(puntosStablefordHoyo(5, 4, 18, 1)).toBe(2)
    })
    it('HCP 36 en SI 1: doble bogey gross = par neto = 2pts', () => {
      // Gross 6 en par 4, SI 1, HCP 36 → recibe 2 strokes → neto 4 = par = 2pts
      expect(puntosStablefordHoyo(6, 4, 36, 1)).toBe(2)
    })
    it('HCP 18 en SI 18 (último): bogey gross = par neto = 2pts', () => {
      expect(puntosStablefordHoyo(5, 4, 18, 18)).toBe(2)
    })
    it('HCP 10 en SI 15 (no recibe): bogey = 1pt', () => {
      // HCP 10, SI 15 → no recibe stroke → gross 5 = bogey = 1pt
      expect(puntosStablefordHoyo(5, 4, 10, 15)).toBe(1)
    })
  })

  describe('Match Play — Rule 6.2a', () => {
    it('Diferencia de handicap: 100% de la diferencia', () => {
      const [a, b] = calcularDiferenciaHandicap(10, 20)
      expect(a).toBe(0)
      expect(b).toBe(10)
    })
    it('Mismo handicap: nadie recibe strokes', () => {
      const [a, b] = calcularDiferenciaHandicap(15, 15)
      expect(a).toBe(0)
      expect(b).toBe(0)
    })
    it('Jugador A mayor HCP: A recibe la diferencia', () => {
      const [a, b] = calcularDiferenciaHandicap(25, 10)
      expect(a).toBe(15)
      expect(b).toBe(0)
    })
  })

  describe('Course Handicap — WHS Formula', () => {
    it('CH es siempre entero', () => {
      const ch = resolverCourseHandicap(10.5, { slope: 128, courseRating: 71.2, par: 72 })
      expect(Number.isInteger(ch)).toBe(true)
    })
    it('Scratch player en cancha difícil puede tener CH negativo', () => {
      // round(0 * (128/113) + (71.2 - 72)) = round(-0.8) = -1
      const ch = resolverCourseHandicap(0, { slope: 128, courseRating: 71.2, par: 72 })
      expect(ch).toBe(-1)
    })
    it('Sin datos de cancha: fallback = round(índice)', () => {
      expect(resolverCourseHandicap(10.5, null)).toBe(11)
      expect(resolverCourseHandicap(10.4, null)).toBe(10)
    })
  })

  describe('Stroke distribution — WHS', () => {
    it('HCP 18 recibe 1 stroke en cada hoyo (SI 1-18)', () => {
      for (let si = 1; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(18, si, 18)).toBe(1)
      }
    })
    it('HCP 36 recibe 2 strokes en cada hoyo', () => {
      for (let si = 1; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(36, si, 18)).toBe(2)
      }
    })
    it('HCP 10 recibe 1 stroke en SI 1-10, 0 en SI 11-18', () => {
      for (let si = 1; si <= 10; si++) {
        expect(strokesRecibidosEnHoyo(10, si, 18)).toBe(1)
      }
      for (let si = 11; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(10, si, 18)).toBe(0)
      }
    })
    it('HCP 19 recibe 2 strokes en SI 1, 1 en SI 2-18', () => {
      expect(strokesRecibidosEnHoyo(19, 1, 18)).toBe(2)
      for (let si = 2; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(19, si, 18)).toBe(1)
      }
    })
    it('Max 54 strokes (3 per hole) — WHS cap', () => {
      for (let si = 1; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(54, si, 18)).toBe(3)
      }
    })
    it('HCP > 54 se capea a 54', () => {
      expect(strokesRecibidosEnHoyo(60, 1, 18)).toBe(3)
    })
  })

  describe('Neto score', () => {
    it('Neto = gross - strokes recibidos', () => {
      expect(scoreNetoHoyo(5, 18, 1, 18)).toBe(4)
    })
    it('Plus handicap: neto > gross (dan strokes)', () => {
      expect(scoreNetoHoyo(4, -2, 18, 18)).toBe(5)
    })
  })

  describe('9 hoyos — distribución de strokes', () => {
    it('HCP 9 recibe 1 stroke en SI 1-9 para 9 hoyos', () => {
      for (let si = 1; si <= 9; si++) {
        expect(strokesRecibidosEnHoyo(9, si, 9)).toBe(1)
      }
    })
    it('HCP 18 recibe 2 strokes en cada hoyo de 9', () => {
      for (let si = 1; si <= 9; si++) {
        expect(strokesRecibidosEnHoyo(18, si, 9)).toBe(2)
      }
    })
    it('HCP 5 en 9 hoyos: 1 stroke en SI 1-5, 0 en SI 6-9', () => {
      for (let si = 1; si <= 5; si++) {
        expect(strokesRecibidosEnHoyo(5, si, 9)).toBe(1)
      }
      for (let si = 6; si <= 9; si++) {
        expect(strokesRecibidosEnHoyo(5, si, 9)).toBe(0)
      }
    })
  })
})

describe('Separación conceptual Formato vs Modo', () => {
  it('ModoJuego solo tiene gross y neto', () => {
    const modos: ModoJuego[] = ['gross', 'neto']
    expect(modos.length).toBe(2)
    // @ts-expect-error — 'stableford' NO es un ModoJuego válido
    const invalidMode: ModoJuego = 'stableford'
    expect(invalidMode).toBeDefined() // Just to use the variable
  })

  it('Stableford es un FORMATO, no un modo', () => {
    const formatos: FormatoJuego[] = ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome']
    expect(formatos).toContain('stableford')
    expect(formatos).toContain('match_play')
    expect(formatos.length).toBe(6)
  })

  it('FORMAT_META.stableford permite gross y neto', () => {
    expect(FORMAT_META.stableford.modosPermitidos).toEqual(['gross', 'neto'])
  })

  it('FORMAT_META.stroke_play permite gross y neto', () => {
    expect(FORMAT_META.stroke_play.modosPermitidos).toContain('gross')
    expect(FORMAT_META.stroke_play.modosPermitidos).toContain('neto')
  })

  it('FORMAT_META.match_play SOLO permite neto (cultura golf Chile)', () => {
    // Match Play en Chile se juega siempre con handicap (neto) — alineado con
    // Stableford (R&A 32.1b). El UI no debe ofrecer la opcion gross.
    expect(FORMAT_META.match_play.modosPermitidos).toEqual(['neto'])
    expect(FORMAT_META.match_play.modosPermitidos).not.toContain('gross')
  })

  it('FORMAT_META.best_ball permite gross y neto (stableford NO es modo)', () => {
    expect(FORMAT_META.best_ball.modosPermitidos).toEqual(['gross', 'neto'])
  })

  it('FORMAT_META.scramble permite gross y neto', () => {
    expect(FORMAT_META.scramble.modosPermitidos).toEqual(['gross', 'neto'])
  })

  it('FORMAT_META.foursome permite gross y neto', () => {
    expect(FORMAT_META.foursome.modosPermitidos).toEqual(['gross', 'neto'])
  })

  it('scorePrimario recibe formato y modo separados', async () => {
    const { scorePrimario, calcularResumenRonda } = await import('@/golf/core/scoring')
    const resumen = calcularResumenRonda(
      { '1': 4, '2': 5 },
      [
        { numero: 1, par: 4, stroke_index: 1 },
        { numero: 2, par: 4, stroke_index: 2 },
      ],
      0,
      8,
      18
    )
    // Stroke play gross
    expect(scorePrimario(resumen, 'stroke_play', 'gross')).toBe(resumen.overUnderGross)
    // Stroke play neto
    expect(scorePrimario(resumen, 'stroke_play', 'neto')).toBe(resumen.overUnderNeto)
    // Stableford: ignora modo, siempre devuelve puntos
    expect(scorePrimario(resumen, 'stableford', 'neto')).toBe(resumen.totalStableford)
  })

  it('ordenarJugadores respeta el formato (stableford DESC, otros ASC)', async () => {
    const { ordenarJugadores } = await import('@/golf/core/scoring')
    const jugadores = [
      { id: '1', overUnderGross: 5, overUnderNeto: 3, totalStableford: 20 },
      { id: '2', overUnderGross: 2, overUnderNeto: 1, totalStableford: 30 },
    ]
    // Stroke play gross: menor gross primero
    const strokePlay = ordenarJugadores(jugadores, 'stroke_play', 'gross')
    expect(strokePlay[0].id).toBe('2')
    // Stableford: mayor puntos primero
    const stableford = ordenarJugadores(jugadores, 'stableford', 'neto')
    expect(stableford[0].id).toBe('2') // también 2, tiene más puntos
    // Stroke play neto: menor neto primero
    const neto = ordenarJugadores(jugadores, 'stroke_play', 'neto')
    expect(neto[0].id).toBe('2')
  })
})

describe('Stableford Gross', () => {
  it('FORMAT_META permite gross en stableford', () => {
    expect(FORMAT_META.stableford.modosPermitidos).toContain('gross')
    expect(FORMAT_META.stableford.modosPermitidos).toContain('neto')
  })

  it('Stableford gross: puntos sin handicap (HCP 0)', () => {
    // Par 4, gross 5 (bogey) → neto = 5 (no strokes) → diff = +1 → 1 pt
    expect(puntosStablefordHoyo(5, 4, 0, 1, 18)).toBe(1)
    // Par 4, gross 4 (par) → 2 pts
    expect(puntosStablefordHoyo(4, 4, 0, 1, 18)).toBe(2)
    // Par 4, gross 3 (birdie) → 3 pts
    expect(puntosStablefordHoyo(3, 4, 0, 1, 18)).toBe(3)
  })

  it('Stableford neto vs gross: jugador HCP 18 en SI 1 tiene diferencia', () => {
    // Gross 5 en par 4, SI 1, HCP 18 → neto = 4 → diff = 0 → 2 pts (par neto)
    expect(puntosStablefordHoyo(5, 4, 18, 1, 18)).toBe(2)
    // Gross 5 en par 4, SI 1, HCP 0 → neto = 5 → diff = +1 → 1 pt (bogey)
    expect(puntosStablefordHoyo(5, 4, 0, 1, 18)).toBe(1)
  })
})
