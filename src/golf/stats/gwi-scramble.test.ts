import { describe, it, expect } from 'vitest'
import {
  probabilidadDeGanarScramble, porcentajesDeGanarScramble, ritmoComun, distDeHoyo,
  SIGMA_HOYO_SCRAMBLE, TAU_NIVEL_EQUIPO, AJUSTE_POR_PAR, type EquipoGWIScramble,
} from './gwi-scramble'

const E = (diff: number, holesPlayed: number, extra: Partial<EquipoGWIScramble> = {}): EquipoGWIScramble => ({ diff, holesPlayed, ...extra })

/** Pares de una cancha par 72 típica (la de 4X2P3F, la ronda de prueba de Juanjo). */
const PARES = [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 3, 4, 4, 5, 5]
const conPares = (diff: number, jugados: number[], extra: Partial<EquipoGWIScramble> = {}): EquipoGWIScramble => {
  const restantes = PARES.map((_, i) => i).filter(i => !jugados.includes(i))
  return E(diff, jugados.length, { paresJugados: jugados.map(i => PARES[i]), paresRestantes: restantes.map(i => PARES[i]), ...extra })
}
const primeros = (n: number) => Array.from({ length: n }, (_, i) => i)
const ultimos = (n: number) => Array.from({ length: n }, (_, i) => 18 - n + i)

/** RNG con semilla (mulberry32): la simulación da siempre lo mismo. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function normal(r: () => number) {
  const u = Math.max(1e-12, r()), v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
function muestrear(d: { desde: number; p: number[] }, u: number) {
  let s = 0
  for (let i = 0; i < d.p.length; i++) { s += d.p[i]; if (u < s) return d.desde + i }
  return d.desde + d.p.length - 1
}

/**
 * Monte Carlo del MISMO modelo, armado aparte y hoyo a hoyo: nivel del equipo sorteado de su posterior, cada hoyo un
 * entero sorteado de la normal discretizada, golpes de HCP restados al final. Prueba la convolución y la cuadratura,
 * no la calibración (eso lo prueban los casos de golf de más abajo).
 */
function simular(a: EquipoGWIScramble, b: EquipoGWIScramble, total: number, n = 30000, sigma = SIGMA_HOYO_SCRAMBLE, tau = TAU_NIVEL_EQUIPO) {
  const r = rng(12345)
  const c = ritmoComun(a, b, total)
  const ajuste = (p: number) => AJUSTE_POR_PAR[p] ?? 0
  const lado = (e: EquipoGWIScramble) => {
    const resto = total - e.holesPlayed
    const ajJug = (e.paresJugados ?? []).reduce((s, p) => s + ajuste(p), 0)
    const g = e.golpesHcpTotal != null ? e.golpesHcpTotal / total : 0
    const exceso = e.golpesHcpTotal != null ? (e.golpesHcpTotal - (e.golpesHcpRestantes ?? 0)) - e.golpesHcpTotal * e.holesPlayed / total : 0
    const propio = e.holesPlayed > 0 ? (e.diff + exceso - ajJug) / e.holesPlayed - c : 0
    const peso = tau * tau * e.holesPlayed / (tau * tau * e.holesPlayed + sigma * sigma)
    const v = tau * tau * sigma * sigma / (sigma * sigma + tau * tau * e.holesPlayed)
    return () => {
      const delta = peso * propio + Math.sqrt(v) * normal(r)
      let f = e.diff - (e.golpesHcpRestantes ?? 0)
      for (let h = 0; h < resto; h++) f += muestrear(distDeHoyo(c + delta + g + ajuste(e.paresRestantes?.[h] ?? 4), sigma), r())
      return f
    }
  }
  const fa = lado(a), fb = lado(b)
  let gana = 0
  for (let k = 0; k < n; k++) { const x = fa(), y = fb(); gana += x < y ? 1 : x === y ? 0.5 : 0 }
  return gana / n
}

describe('distDeHoyo — el score de un hoyo', () => {
  for (const m of [-0.4, -0.37, 0, 0.25, 0.5, 1.13]) {
    it(`media ${m} y desvío σ exactos, en enteros`, () => {
      const d = distDeHoyo(m, SIGMA_HOYO_SCRAMBLE)
      const media = d.p.reduce((s, x, i) => s + x * (d.desde + i), 0)
      const varianza = d.p.reduce((s, x, i) => s + x * (d.desde + i - media) ** 2, 0)
      expect(d.p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10)
      expect(media).toBeCloseTo(m, 4)
      expect(Math.sqrt(varianza)).toBeCloseTo(SIGMA_HOYO_SCRAMBLE, 3)
    })
  }
})

describe('probabilidadDeGanarScramble — el cálculo exacto contra la simulación', () => {
  const casos: Array<[string, EquipoGWIScramble, EquipoGWIScramble]> = [
    ['parejos al salir', E(0, 0), E(0, 0)],
    ['1 golpe arriba, mismos hoyos, media ronda', E(-1, 9), E(1, 9)],
    ['1 golpe arriba, el rival con 2 hoyos menos', E(-1, 11), E(1, 9)],
    ['3 golpes arriba con 4 por jugar', E(-2, 14), E(1, 14)],
    ['5 golpes arriba con 9 + 9 por jugar', E(-5, 9), E(0, 9)],
    ['el de atrás en hoyos va adelante', E(1, 12), E(-1, 6)],
    ['uno terminó, el otro con 9 por jugar', E(-1, 18), E(1, 9)],
    ['último hoyo, 1 golpe arriba', E(-1, 17), E(0, 17)],
    ['con pares: a uno le quedan los par 5', conPares(-1, primeros(9)), conPares(-1, ultimos(9))],
    ['neto con golpes por recibir', E(0, 9, { golpesHcpTotal: 8, golpesHcpRestantes: 2 }), E(0, 9, { golpesHcpTotal: 8, golpesHcpRestantes: 6 })],
    ['neto, salidas separadas', E(-5, 12, { golpesHcpTotal: 10, golpesHcpRestantes: 2 }), E(-1, 6, { golpesHcpTotal: 7, golpesHcpRestantes: 5 })],
  ]
  for (const [nombre, a, b] of casos) {
    it(nombre, () => {
      expect(Math.abs(probabilidadDeGanarScramble(a, b, 18) - simular(a, b, 18))).toBeLessThan(0.015)
    })
  }
})

describe('probabilidadDeGanarScramble — propiedades', () => {
  it('simétrica: P(A) + P(B) = 1', () => {
    const a = conPares(-3, primeros(11), { golpesHcpTotal: 10, golpesHcpRestantes: 4 })
    const b = conPares(-2, primeros(9), { golpesHcpTotal: 12, golpesHcpRestantes: 7 })
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
  it('mismos hoyos y mismos pares: el ritmo común se cancela', () => {
    expect(probabilidadDeGanarScramble(E(-4, 9), E(-3, 9), 18, { tau: 0 }))
      .toBeCloseTo(probabilidadDeGanarScramble(E(-1, 9), E(0, 9), 18, { tau: 0 }), 3)
  })
  it('el ritmo común se encoge: 3 hoyos no lo disparan', () => {
    expect(ritmoComun(E(-3, 3), E(0, 0))).toBeCloseTo(-3 / 21)
  })
})

describe('golf — lo que la v2 corrige de la v1', () => {
  it('el empate es real: a falta de 1 hoyo con 1 golpe arriba, el de atrás todavía empata', () => {
    // Un hoyo cada uno: el de atrás empata si hace 1 menos (σ 0,6 → ~1 de cada 5). P(gana A) queda bajo 95 %.
    const p = probabilidadDeGanarScramble(E(-1, 17), E(0, 17), 18)
    expect(p).toBeGreaterThan(0.75)
    expect(p).toBeLessThan(0.95)
  })
  it('el nivel propio del equipo mueve poco: el HCP manda (≤ 2 puntos con media ronda, ≤ 5 al inicio)', () => {
    // Suma incertidumbre, pero el que va adelante probablemente es algo mejor: casi se compensan.
    for (const [a, b] of [[E(-5, 9), E(0, 9)], [E(-1, 9), E(0, 9)], [E(-3, 11), E(-2, 9)], [E(-2, 14), E(1, 14)]]) {
      const sinNivel = probabilidadDeGanarScramble(a, b, 18, { tau: 0 })
      expect(Math.abs(probabilidadDeGanarScramble(a, b, 18) - sinNivel)).toBeLessThan(0.02)
    }
    const inicio = probabilidadDeGanarScramble(E(-2, 3), E(0, 3), 18) - probabilidadDeGanarScramble(E(-2, 3), E(0, 3), 18, { tau: 0 })
    expect(inicio).toBeGreaterThan(0)
    expect(inicio).toBeLessThan(0.05)
  })
  it('salidas separadas: al que le quedan los par 5 tiene más chances con el mismo score', () => {
    // Los dos −1. A jugó la ida (con 2 par 5), B la vuelta (con 2 par 5): igual mezcla → 50 %.
    expect(probabilidadDeGanarScramble(conPares(-1, primeros(9)), conPares(-1, ultimos(9)), 18)).toBeCloseTo(0.5, 2)
    // A jugó 9 hoyos sin ningún par 5 (1-3, 5-8, 10-11); a B le falta la misma cantidad pero con los 4 par 5.
    const sinPar5 = [0, 1, 2, 4, 5, 6, 7, 9, 10]
    const conLosPar5 = [0, 1, 2, 4, 5, 6, 7, 9, 10].map(i => (i === 0 ? 3 : i === 1 ? 8 : i === 2 ? 16 : i === 4 ? 17 : i))
    const a = conPares(-1, sinPar5), b = conPares(-1, conLosPar5)
    // A tiene por delante 4 par 5; B ya los jugó: A va mejor con el mismo −1.
    expect(probabilidadDeGanarScramble(a, b, 18)).toBeGreaterThan(0.6)
  })
  it('sin el dato de pares (o con un largo que no calza) no ajusta por pares', () => {
    const malo = E(-1, 9, { paresJugados: [4, 4], paresRestantes: PARES.slice(9) })
    expect(probabilidadDeGanarScramble(malo, E(0, 9), 18)).toBeCloseTo(probabilidadDeGanarScramble(E(-1, 9), E(0, 9), 18), 10)
  })
  it('neto: el que ya jugó los hoyos donde recibe golpe tiene menos neto por delante', () => {
    const a = E(0, 9, { golpesHcpTotal: 8, golpesHcpRestantes: 2 })
    const b = E(0, 9, { golpesHcpTotal: 8, golpesHcpRestantes: 6 })
    expect(probabilidadDeGanarScramble(a, b, 18)).toBeLessThan(0.15)
    const parejo = E(0, 9, { golpesHcpTotal: 8, golpesHcpRestantes: 4 })
    expect(probabilidadDeGanarScramble(parejo, parejo, 18)).toBeCloseTo(0.5, 6)
  })
  it('neto: los golpes de HCP ya recibidos no cuentan como buen juego (mismo gross → 50 %)', () => {
    // Los dos con gross igual al par en 9 hoyos y HCP 8. A ya recibió 6 (neto −6, le quedan 2); B recibió 2 (neto −2,
    // le quedan 6). Terminan iguales en promedio: 50 %, también con el nivel propio (revisión Fable, P1).
    const a = E(-6, 9, { golpesHcpTotal: 8, golpesHcpRestantes: 2 })
    const b = E(-2, 9, { golpesHcpTotal: 8, golpesHcpRestantes: 6 })
    expect(probabilidadDeGanarScramble(a, b, 18)).toBeCloseTo(0.5, 6)
    // Ritmo neto común: gross = par con 8/18 de golpe por hoyo recibido.
    // Los dos aportan lo mismo (−4 cada uno, ya devueltos los golpes recibidos de más): −8 / (9 + 9 + 18).
    expect(ritmoComun(a, b, 18)).toBeCloseTo(-8 / 36, 10)
  })
  it('el cálculo es rápido: una tabla en vivo lo pide en cada render', () => {
    const t = performance.now()
    for (let k = 0; k < 20; k++) probabilidadDeGanarScramble(conPares(-3 - k % 3, primeros(11)), conPares(-2, primeros(9)), 18)
    expect((performance.now() - t) / 20).toBeLessThan(30)
  })
})

describe('porcentajesDeGanarScramble', () => {
  it('nadie con 3 hoyos: no se muestra', () => {
    expect(porcentajesDeGanarScramble(E(-1, 2), E(0, 0), 18)).toBeNull()
  })
  it('los dos terminados: no se muestra; uno solo terminado sí', () => {
    expect(porcentajesDeGanarScramble(E(-2, 18), E(-2, 18), 18)).toBeNull()
    expect(porcentajesDeGanarScramble(E(-3, 18), E(-2, 18), 18)).toBeNull()
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
