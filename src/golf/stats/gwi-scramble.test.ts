import { describe, it, expect } from 'vitest'
import { probabilidadDeGanarScramble, porcentajesDeGanarScramble, ritmoComun, SIGMA_HOYO_SCRAMBLE } from './gwi-scramble'

const E = (diff: number, holesPlayed: number) => ({ diff, holesPlayed })

/** RNG con semilla (mulberry32): la simulación da siempre lo mismo. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Simulación hoyo a hoyo con scores ENTEROS (−1, 0, +1 vs el ritmo) y el desvío del modelo: p(±1) = σ²/2.
 * Empate al final = medio triunfo (el countback es una moneda para el modelo).
 */
function simular(a: { diff: number; holesPlayed: number }, b: { diff: number; holesPlayed: number }, total: number, n = 40000) {
  const r = rng(12345)
  const p = SIGMA_HOYO_SCRAMBLE ** 2 / 2
  const hoyo = () => { const u = r(); return u < p ? -1 : u < 2 * p ? 1 : 0 }
  let gana = 0
  for (let k = 0; k < n; k++) {
    let fa = a.diff, fb = b.diff
    for (let h = a.holesPlayed; h < total; h++) fa += hoyo()
    for (let h = b.holesPlayed; h < total; h++) fb += hoyo()
    gana += fa < fb ? 1 : fa === fb ? 0.5 : 0
  }
  return gana / n
}

describe('probabilidadDeGanarScramble — contra la simulación', () => {
  // Ritmo común 0 (los diffs suman 0) para que el modelo y la simulación supongan lo mismo.
  const casos: Array<[string, ReturnType<typeof E>, ReturnType<typeof E>]> = [
    ['parejos al salir', E(0, 0), E(0, 0)],
    ['1 golpe arriba, mismos hoyos, media ronda', E(-1, 9), E(1, 9)],
    ['1 golpe arriba, el rival con 2 hoyos menos', E(-1, 11), E(1, 9)],
    ['3 golpes arriba con 4 por jugar', E(-2, 14), E(1, 14)],
    ['el de atrás en hoyos va adelante', E(1, 12), E(-1, 6)],
    ['uno terminó, el otro con 9 por jugar', E(-1, 18), E(1, 9)],
  ]
  for (const [nombre, a, b] of casos) {
    it(nombre, () => {
      // Con distinta cantidad de hoyos el ritmo pesa: esos casos suman 0 para que el modelo y la simulación coincidan.
      if (a.holesPlayed !== b.holesPlayed) expect(ritmoComun(a, b)).toBe(0)
      expect(Math.abs(probabilidadDeGanarScramble(a, b, 18) - simular(a, b, 18))).toBeLessThan(0.025)
    })
  }

  it('con pocos hoyos por jugar la aproximación se abre, pero poco (< 4 puntos)', () => {
    const a = E(-1, 17), b = E(0, 17)
    expect(Math.abs(probabilidadDeGanarScramble(a, b, 18) - simular(a, b, 18))).toBeLessThan(0.04)
  })
})

describe('probabilidadDeGanarScramble — propiedades', () => {
  it('simétrica: P(A) + P(B) = 1', () => {
    const a = E(-3, 11), b = E(-2, 9)
    expect(probabilidadDeGanarScramble(a, b, 18) + probabilidadDeGanarScramble(b, a, 18)).toBeCloseTo(1, 10)
  })
  it('más ventaja = más probabilidad; menos hoyos por jugar = más segura', () => {
    expect(probabilidadDeGanarScramble(E(-2, 9), E(0, 9), 18)).toBeGreaterThan(probabilidadDeGanarScramble(E(-1, 9), E(0, 9), 18))
    expect(probabilidadDeGanarScramble(E(-1, 15), E(0, 15), 18)).toBeGreaterThan(probabilidadDeGanarScramble(E(-1, 9), E(0, 9), 18))
  })
  it('los dos terminados: decidido, y el empate queda 50/50', () => {
    expect(probabilidadDeGanarScramble(E(-3, 18), E(-2, 18), 18)).toBe(1)
    expect(probabilidadDeGanarScramble(E(-2, 18), E(-2, 18), 18)).toBe(0.5)
  })
  it('el ritmo común pesa solo con distinta cantidad de hoyos, y encogido (3 hoyos no lo disparan)', () => {
    expect(ritmoComun(E(-3, 3), E(0, 0))).toBeCloseTo(-3 / 21)
    // Mismos hoyos: el ritmo se cancela.
    expect(probabilidadDeGanarScramble(E(-4, 9), E(-3, 9), 18)).toBeCloseTo(probabilidadDeGanarScramble(E(-1, 9), E(0, 9), 18), 10)
  })
})

describe('golpes de HCP por recibir (neto)', () => {
  it('el que ya jugó los hoyos donde recibe golpe tiene menos neto por delante', () => {
    // Mismo neto y mismos hoyos; A ya usó 6 de sus 8 golpes en 9 hoyos (le quedan 2), B usó 2 (le quedan 6).
    const a = { diff: 0, holesPlayed: 9, golpesHcpTotal: 8, golpesHcpRestantes: 2 }
    const b = { diff: 0, holesPlayed: 9, golpesHcpTotal: 8, golpesHcpRestantes: 6 }
    expect(probabilidadDeGanarScramble(a, b, 18)).toBeLessThan(0.1)
    // Repartidos parejo (4 y 4): queda como sin el dato.
    const parejo = { diff: 0, holesPlayed: 9, golpesHcpTotal: 8, golpesHcpRestantes: 4 }
    expect(probabilidadDeGanarScramble(parejo, parejo, 18)).toBeCloseTo(0.5, 6)
  })
  it('sin el dato (gross) no ajusta', () => {
    expect(probabilidadDeGanarScramble(E(-1, 9), E(0, 9), 18)).toBeCloseTo(
      probabilidadDeGanarScramble({ ...E(-1, 9), golpesHcpTotal: 8, golpesHcpRestantes: 4 }, { ...E(0, 9), golpesHcpTotal: 8, golpesHcpRestantes: 4 }, 18), 10)
  })
})

describe('porcentajesDeGanarScramble', () => {
  it('nadie con 3 hoyos: no se muestra', () => {
    expect(porcentajesDeGanarScramble(E(-1, 2), E(0, 0), 18)).toBeNull()
  })
  it('los dos terminados: no se muestra (el ganador, con countback, lo dice la tabla); uno solo terminado sí', () => {
    // Los dos terminados: ya no es probabilidad (el ganador, con countback, lo dice la tabla). Ni 50/50 ni 100/0.
    expect(porcentajesDeGanarScramble(E(-2, 18), E(-2, 18), 18)).toBeNull()
    expect(porcentajesDeGanarScramble(E(-3, 18), E(-2, 18), 18)).toBeNull()
    // Uno terminado y el otro no: sigue en juego.
    expect(porcentajesDeGanarScramble(E(-3, 18), E(-2, 16), 18)).not.toBeNull()
  })
  it('suman 100 y no llegan a 0/100 mientras quede ronda', () => {
    const [a, b] = porcentajesDeGanarScramble(E(-8, 17), E(2, 17), 18)!
    expect(a + b).toBe(100)
    expect(a).toBe(99)
  })
  it('caso del sábado: Lamarca −3 en 11, Ross −2 en 9 (neto)', () => {
    const [a, b] = porcentajesDeGanarScramble(E(-3, 11), E(-2, 9), 18)!
    expect(a + b).toBe(100)
    expect(a).toBeGreaterThan(50)
    expect(a).toBeLessThan(75)
  })
})
