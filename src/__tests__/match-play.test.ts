import { describe, it, expect } from 'vitest'
import {
  calcularMatchPlay,
  calcularDiferenciaHandicap,
  strokesMatchPlayEnHoyo,
  displayDesdeJugador,
  colorResultadoHoyo,
  CONCEDE,
  type MatchPlayConfig,
} from '@/golf/formats/match-play'

// ─── Helpers ───

/** 18 hoyos estándar: par 4, SI 1-18 */
const holes18 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

/** 9 hoyos: par 4, SI 1-9 */
const holes9 = Array.from({ length: 9 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

/** Genera scores constantes para N hoyos */
function scoresConstantes(valor: number, n: number): Record<string, number> {
  const s: Record<string, number> = {}
  for (let i = 1; i <= n; i++) s[String(i)] = valor
  return s
}

/** Genera scores desde un array */
function scoresDesdeArray(arr: number[]): Record<string, number> {
  const s: Record<string, number> = {}
  arr.forEach((v, i) => { s[String(i + 1)] = v })
  return s
}

// ─── Tests ───

describe('calcularDiferenciaHandicap', () => {
  it('misma HCP → ambos 0', () => {
    expect(calcularDiferenciaHandicap(15, 15)).toEqual([0, 0])
  })

  it('A mayor HCP → A recibe strokes', () => {
    expect(calcularDiferenciaHandicap(20, 12)).toEqual([8, 0])
  })

  it('B mayor HCP → B recibe strokes', () => {
    expect(calcularDiferenciaHandicap(5, 18)).toEqual([0, 13])
  })

  it('scratch vs scratch → 0', () => {
    expect(calcularDiferenciaHandicap(0, 0)).toEqual([0, 0])
  })
})

describe('strokesMatchPlayEnHoyo', () => {
  it('diferencia 0 → nadie recibe', () => {
    expect(strokesMatchPlayEnHoyo(0, 1)).toBe(0)
  })

  it('diferencia 5 → recibe en SI 1-5', () => {
    expect(strokesMatchPlayEnHoyo(5, 1)).toBe(1)
    expect(strokesMatchPlayEnHoyo(5, 5)).toBe(1)
    expect(strokesMatchPlayEnHoyo(5, 6)).toBe(0)
  })

  it('diferencia 18 → recibe en todos los hoyos', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesMatchPlayEnHoyo(18, si)).toBe(1)
    }
  })

  it('diferencia 20 → 2 en SI 1-2, 1 en el resto', () => {
    expect(strokesMatchPlayEnHoyo(20, 1)).toBe(2)
    expect(strokesMatchPlayEnHoyo(20, 2)).toBe(2)
    expect(strokesMatchPlayEnHoyo(20, 3)).toBe(1)
  })
})

describe('calcularMatchPlay — casos básicos', () => {
  const cfg18: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }

  it('All Square si ambos juegan igual (mismo HCP)', () => {
    const scores = scoresConstantes(4, 18) // todos par
    const result = calcularMatchPlay(scores, scores, holes18, cfg18)

    expect(result.state).toBe(0)
    expect(result.isFinished).toBe(true)
    expect(result.winner).toBeNull()
    expect(result.display).toBe('All Square')
    expect(result.holesHalved).toBe(18)
    expect(result.holesWonA).toBe(0)
    expect(result.holesWonB).toBe(0)
  })

  it('A gana 1 UP si gana un hoyo más', () => {
    const scA = scoresConstantes(4, 18)
    const scB = scoresConstantes(4, 18)
    scA['1'] = 3 // A birdie en hoyo 1
    const result = calcularMatchPlay(scA, scB, holes18, cfg18)

    expect(result.state).toBe(1)
    expect(result.winner).toBe('a')
    expect(result.display).toBe('1 UP')
    expect(result.holesWonA).toBe(1)
    expect(result.holesWonB).toBe(0)
    expect(result.holesHalved).toBe(17)
  })

  it('B gana 1 UP si gana un hoyo más', () => {
    const scA = scoresConstantes(4, 18)
    const scB = scoresConstantes(4, 18)
    scB['18'] = 3 // B birdie en hoyo 18
    const result = calcularMatchPlay(scA, scB, holes18, cfg18)

    expect(result.state).toBe(-1)
    expect(result.winner).toBe('b')
    expect(result.display).toBe('1 UP')
  })
})

describe('calcularMatchPlay — terminación temprana', () => {
  const cfg18: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }

  it('A gana 5&4 si va 5 UP con 4 por jugar', () => {
    const scA = scoresDesdeArray([3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4])
    const scB = scoresConstantes(4, 18)
    // A gana primeros 5 hoyos → 5 UP con 13 por jugar, sigue
    // Empatan del 6 al 14 → 5 UP con 4 por jugar → 5 > 4 → match terminado
    const result = calcularMatchPlay(scA, scB, holes18, cfg18)

    expect(result.isFinished).toBe(true)
    expect(result.winner).toBe('a')
    expect(result.display).toBe('5&4')
    expect(result.holesPlayed).toBe(14)
    expect(result.holesRemaining).toBe(4)
    // Hoyos 15, 16, 17, 18 no se juegan
    expect(result.holes[14].afterMatchEnd).toBe(true)
    expect(result.holes[15].afterMatchEnd).toBe(true)
    expect(result.holes[16].afterMatchEnd).toBe(true)
    expect(result.holes[17].afterMatchEnd).toBe(true)
  })

  it('match termina inmediatamente si diferencia > hoyos restantes', () => {
    const scA = scoresDesdeArray([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4])
    const scB = scoresConstantes(4, 18)
    // A gana 10 hoyos seguidos → 10 UP con 8 por jugar → terminado en hoyo 10
    const result = calcularMatchPlay(scA, scB, holes18, cfg18)

    expect(result.isFinished).toBe(true)
    expect(result.winner).toBe('a')
    expect(result.holesPlayed).toBe(10)
    expect(result.display).toBe('10&8')
  })
})

describe('calcularMatchPlay — handicap neto', () => {
  it('jugador con mayor HCP recibe strokes y gana hoyo que perdería en gross', () => {
    // A: HCP 20, B: HCP 10 → A recibe 10 strokes (SI 1-10)
    const cfg: MatchPlayConfig = { courseHandicapA: 20, courseHandicapB: 10, totalHoles: 18 }

    // Hoyo 1 (SI 1): A=5, B=4 → gross A pierde. Pero A recibe 1 stroke.
    // Neto A = 5-1 = 4, Neto B = 4-0 = 4 → Halved
    const scA: Record<string, number> = { '1': 5 }
    const scB: Record<string, number> = { '1': 4 }

    // Solo hoyo 1 tiene score
    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    expect(result.holes[0].strokesA).toBe(1)
    expect(result.holes[0].strokesB).toBe(0)
    expect(result.holes[0].netoA).toBe(4)
    expect(result.holes[0].netoB).toBe(4)
    expect(result.holes[0].result).toBe('halved')
  })

  it('strokes solo en los hoyos con SI <= diferencia', () => {
    // A: HCP 15, B: HCP 10 → diferencia 5 → A recibe en SI 1-5
    const cfg: MatchPlayConfig = { courseHandicapA: 15, courseHandicapB: 10, totalHoles: 18 }

    const scA = scoresConstantes(5, 18) // bogey en todos
    const scB = scoresConstantes(4, 18) // par en todos

    const result = calcularMatchPlay(scA, scB, holes18, cfg)

    // En hoyos SI 1-5: A gross 5, recibe 1 → neto 4 = B → halved
    for (let i = 0; i < 5; i++) {
      expect(result.holes[i].result).toBe('halved')
    }
    // En hoyos SI 6-18: A gross 5, recibe 0 → neto 5 > 4 → B gana
    for (let i = 5; i < result.holes.length; i++) {
      if (!result.holes[i].afterMatchEnd) {
        expect(result.holes[i].result).toBe('won_b')
      }
    }
  })
})

describe('calcularMatchPlay — concesiones', () => {
  const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }

  it('A concede hoyo 1 → B gana ese hoyo', () => {
    const scA: Record<string, number> = { '1': CONCEDE, '2': 4 }
    const scB: Record<string, number> = { '1': 5, '2': 4 }
    const result = calcularMatchPlay(scA, scB, holes18, cfg)

    expect(result.holes[0].result).toBe('conceded_a')
    expect(result.state).toBe(-1) // B va 1 UP después de concesión + empate
    // Wait, after hole 1: state = -1 (B won), after hole 2: halved, state = -1
    // But holesPlayed is only 2, so match is in progress
    expect(result.holesPlayed).toBe(2)
    expect(result.holesWonB).toBe(1)
  })

  it('B concede hoyo → A gana ese hoyo', () => {
    const scA: Record<string, number> = { '1': 4 }
    const scB: Record<string, number> = { '1': CONCEDE }
    const result = calcularMatchPlay(scA, scB, holes18, cfg)

    expect(result.holes[0].result).toBe('conceded_b')
    expect(result.holesWonA).toBe(1)
  })
})

describe('calcularMatchPlay — 9 hoyos', () => {
  it('funciona correctamente en ronda de 9', () => {
    const cfg9: MatchPlayConfig = { courseHandicapA: 5, courseHandicapB: 5, totalHoles: 9 }
    const scA = scoresDesdeArray([3, 4, 4, 4, 4, 4, 4, 4, 4])
    const scB = scoresConstantes(4, 9)

    const result = calcularMatchPlay(scA, scB, holes9, cfg9)
    expect(result.isFinished).toBe(true)
    expect(result.winner).toBe('a')
    expect(result.display).toBe('1 UP')
    expect(result.holesPlayed).toBe(9)
  })

  it('terminación temprana en 9 hoyos', () => {
    const cfg9: MatchPlayConfig = { courseHandicapA: 5, courseHandicapB: 5, totalHoles: 9 }
    const scA = scoresDesdeArray([3, 3, 3, 3, 3, 3, 3, 4, 4])
    const scB = scoresConstantes(4, 9)
    // A gana 5 seguidos → 5 UP con 4 por jugar → 5 > 4 → terminado en hoyo 5
    const result = calcularMatchPlay(scA, scB, holes9, cfg9)

    expect(result.isFinished).toBe(true)
    expect(result.winner).toBe('a')
    expect(result.display).toBe('5&4')
    expect(result.holesPlayed).toBe(5)
  })
})

describe('calcularMatchPlay — match en curso (scores parciales)', () => {
  const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }

  it('muestra estado en curso cuando faltan hoyos', () => {
    // Solo 5 hoyos jugados, A gana 2
    const scA = scoresDesdeArray([3, 3, 4, 4, 4])
    const scB = scoresDesdeArray([4, 4, 4, 4, 4])

    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    expect(result.holesPlayed).toBe(5)
    expect(result.isFinished).toBe(false)
    expect(result.winner).toBeNull()
    expect(result.state).toBe(2)
    expect(result.display).toBe('2 UP A con 13 por jugar')
  })

  it('All Square en curso', () => {
    const scA = scoresDesdeArray([3, 5, 4])
    const scB = scoresDesdeArray([5, 3, 4])

    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    expect(result.state).toBe(0)
    expect(result.isFinished).toBe(false)
    expect(result.display).toBe('All Square')
  })
})

describe('calcularMatchPlay — hoyos con par variado', () => {
  it('funciona con par 3, 4, 5 mezclados', () => {
    const mixedHoles = [
      { numero: 1, par: 4, stroke_index: 7 },
      { numero: 2, par: 3, stroke_index: 15 },
      { numero: 3, par: 5, stroke_index: 1 },
      { numero: 4, par: 4, stroke_index: 11 },
    ]
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 4 }

    // Ambos juegan par en todo
    const scA = scoresDesdeArray([4, 3, 5, 4])
    const scB = scoresDesdeArray([4, 3, 5, 4])
    const result = calcularMatchPlay(scA, scB, mixedHoles, cfg)

    expect(result.state).toBe(0)
    expect(result.display).toBe('All Square')
    expect(result.holesHalved).toBe(4)
  })
})

describe('displayDesdeJugador', () => {
  it('A perspectiva: positivo = UP, negativo = DN', () => {
    expect(displayDesdeJugador(2, 'a')).toBe('2 UP')
    expect(displayDesdeJugador(-1, 'a')).toBe('1 DN')
    expect(displayDesdeJugador(0, 'a')).toBe('AS')
  })

  it('B perspectiva: invertido', () => {
    expect(displayDesdeJugador(2, 'b')).toBe('2 DN')
    expect(displayDesdeJugador(-1, 'b')).toBe('1 UP')
    expect(displayDesdeJugador(0, 'b')).toBe('AS')
  })
})

describe('colorResultadoHoyo', () => {
  it('won_a es verde para A, rojo para B', () => {
    expect(colorResultadoHoyo('won_a', 'a')).toBe('green')
    expect(colorResultadoHoyo('won_a', 'b')).toBe('red')
  })

  it('halved siempre gris', () => {
    expect(colorResultadoHoyo('halved', 'a')).toBe('gray')
    expect(colorResultadoHoyo('halved', 'b')).toBe('gray')
  })

  it('concesiones se tratan como win del otro', () => {
    expect(colorResultadoHoyo('conceded_a', 'a')).toBe('red')   // A concedió → A pierde
    expect(colorResultadoHoyo('conceded_a', 'b')).toBe('green') // A concedió → B gana
    expect(colorResultadoHoyo('conceded_b', 'a')).toBe('green')
    expect(colorResultadoHoyo('conceded_b', 'b')).toBe('red')
  })
})

describe('calcularMatchPlay — edge cases', () => {
  it('scores vacíos → 0 hoyos jugados, no terminado', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }
    const result = calcularMatchPlay({}, {}, holes18, cfg)

    expect(result.holesPlayed).toBe(0)
    expect(result.isFinished).toBe(false)
    expect(result.state).toBe(0)
  })

  it('solo A tiene score → hoyo no jugado aún', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }
    const result = calcularMatchPlay({ '1': 4 }, {}, holes18, cfg)

    expect(result.holesPlayed).toBe(0)
    expect(result.holes[0].result).toBe('not_played')
    expect(result.holes[0].grossA).toBe(4)
    expect(result.holes[0].grossB).toBeNull()
  })

  it('scratch vs HCP 36 — B recibe 2 strokes en todos los hoyos', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 0, courseHandicapB: 36, totalHoles: 18 }
    // B tira 6 gross en cada hoyo, A tira 4
    const scA = scoresConstantes(4, 18)
    const scB = scoresConstantes(6, 18)

    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    // B neto = 6 - 2 = 4 en cada hoyo = halved
    expect(result.holesHalved).toBe(18)
    expect(result.display).toBe('All Square')
  })

  it('HCP grande diferencia — match termina rápido', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 0, courseHandicapB: 0, totalHoles: 18 }
    // A tira 3 en todos (birdie), B tira 6 en todos (doble bogey)
    const scA = scoresConstantes(3, 18)
    const scB = scoresConstantes(6, 18)

    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    expect(result.isFinished).toBe(true)
    expect(result.winner).toBe('a')
    // A gana cada hoyo → 10 UP después de 10 hoyos (10 > 8 remaining) → 10&8
    expect(result.display).toBe('10&8')
  })
})

describe('calcularMatchPlay — edge cases avanzados', () => {
  it('ganado exactamente en hoyo 18 muestra "1 UP" no "1&0"', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }
    const scA = scoresConstantes(4, 18)
    const scB = scoresConstantes(4, 18)
    scA['18'] = 3 // A birdie en hoyo 18
    const result = calcularMatchPlay(scA, scB, holes18, cfg)

    expect(result.isFinished).toBe(true)
    expect(result.winner).toBe('a')
    expect(result.holesRemaining).toBe(0)
    expect(result.display).toBe('1 UP')
  })

  it('ida y vuelta — A arriba, B remonta, A gana en 18', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }
    // A gana hoyos 1-3, B gana 4-6, empatan 7-17, A gana 18
    const scA = scoresDesdeArray([3, 3, 3, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3])
    const scB = scoresDesdeArray([4, 4, 4, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4])

    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    expect(result.state).toBe(1)
    expect(result.winner).toBe('a')
    expect(result.display).toBe('1 UP')
    expect(result.holesWonA).toBe(4)
    expect(result.holesWonB).toBe(3)
    expect(result.holesHalved).toBe(11)
  })

  it('dormie — A va 2 UP con 2 por jugar, B gana ambos → All Square', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }
    // A gana hoyos 1-2, empatan 3-16, B gana 17-18
    const scA = scoresDesdeArray([3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5])
    const scB = scoresDesdeArray([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3])

    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    expect(result.state).toBe(0)
    expect(result.winner).toBeNull()
    expect(result.display).toBe('All Square')
    expect(result.isFinished).toBe(true)
  })

  it('concesión del match — A concede todos los hoyos restantes', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 4 }
    const miniHoles = holes18.slice(0, 4)

    // A concede hoyo 1, B scores 4. A concede hoyo 2. → B 2 UP con 2 por jugar
    // A concede hoyo 3 → B 3 UP con 1 → match terminado
    const scA: Record<string, number> = { '1': CONCEDE, '2': CONCEDE, '3': CONCEDE }
    const scB: Record<string, number> = { '1': 4, '2': 4, '3': 4 }

    const result = calcularMatchPlay(scA, scB, miniHoles, cfg)
    expect(result.winner).toBe('b')
    expect(result.isFinished).toBe(true)
    expect(result.display).toBe('3&1')
  })

  it('ambos conceden el mismo hoyo → no debería pasar, pero B gana si A concede primero', () => {
    // En la práctica solo uno concede; si ambos pasan CONCEDE, A concede tiene prioridad
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }
    const scA: Record<string, number> = { '1': CONCEDE }
    const scB: Record<string, number> = { '1': CONCEDE }

    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    // A concede primero por orden de evaluación
    expect(result.holes[0].result).toBe('conceded_a')
  })

  it('hoyos desordenados se procesan en orden numérico', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 3 }
    const unorderedHoles = [
      { numero: 3, par: 4, stroke_index: 1 },
      { numero: 1, par: 4, stroke_index: 3 },
      { numero: 2, par: 4, stroke_index: 2 },
    ]
    const scA = scoresDesdeArray([3, 4, 4])
    const scB = scoresConstantes(4, 3)

    const result = calcularMatchPlay(scA, scB, unorderedHoles, cfg)
    expect(result.holes[0].numero).toBe(1)
    expect(result.holes[1].numero).toBe(2)
    expect(result.holes[2].numero).toBe(3)
    expect(result.holesWonA).toBe(1)
  })

  it('handicap con decimales se redondea correctamente', () => {
    // courseHandicap ya viene redondeado, pero verificar que diferencia funciona
    const cfg: MatchPlayConfig = { courseHandicapA: 15, courseHandicapB: 8, totalHoles: 18 }
    // Diferencia = 7, A recibe en SI 1-7
    const scA = scoresConstantes(5, 18) // bogey en todo
    const scB = scoresConstantes(4, 18) // par en todo

    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    // SI 1-7: A gross 5, recibe 1 → neto 4, B neto 4 → halved (7 hoyos)
    // SI 8-18: A gross 5, recibe 0 → neto 5, B neto 4 → B gana (11 hoyos)
    // B va ganando rápido: después de halved en 1-7, B gana 8, 9, 10, 11
    // Hoyo 11: B 4 UP con 7 por jugar. Sigue
    // Hoyo 12: B 5 UP con 6 por jugar. Sigue
    // Hoyo 13: B 6 UP con 5 por jugar. 6 > 5 → terminado
    expect(result.isFinished).toBe(true)
    expect(result.winner).toBe('b')
    expect(result.holesPlayed).toBe(13)
    expect(result.display).toBe('6&5')
  })

  it('match play con scores parciales intercalados (solo algunos hoyos)', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }
    // Solo hoyo 1 y 3 tienen score de ambos, hoyo 2 solo A
    const scA: Record<string, number> = { '1': 3, '2': 4, '3': 4 }
    const scB: Record<string, number> = { '1': 4, '3': 5 }

    const result = calcularMatchPlay(scA, scB, holes18, cfg)
    // Hoyo 1: A gana (3 vs 4) → 1 UP A
    // Hoyo 2: solo A tiene score → not_played, state stays 1
    // Hoyo 3: A gana (4 vs 5) → 2 UP A
    expect(result.holesPlayed).toBe(2) // solo 2 hoyos completos
    expect(result.state).toBe(2)
    expect(result.holes[1].result).toBe('not_played')
  })
})
