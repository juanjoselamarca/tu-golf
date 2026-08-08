// Tests de `@/golf/courses/vueltas` — el modelo de "18 hoyos = dos vueltas de 9".
//
// El caso que este módulo existe para arreglar: una cancha de 9 hoyos en un
// torneo de 18. Antes el motor rellenaba los hoyos 10-18 a par 4 con stroke
// index inventado; ahora repite la vuelta con los datos reales.

import { describe, it, expect } from 'vitest'
import {
  PAR_FALLBACK,
  esEscalaDe18Hoyos,
  parEnEscalaDe9,
  courseRatingEnEscalaDe9,
  hoyosDeUnaVuelta,
  vueltasDeLaRonda,
  strokeIndexDeVuelta,
  hoyosDeLaVuelta,
  sumaDeVueltas,
  ratingDeVueltas,
  parDeVariasVueltas,
  resolverRatingEnEscalaDe9,
} from './vueltas'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'

/** C.G. Río Blanco: par 35 real, 9 hoyos. */
const RIO_BLANCO_9 = [
  { numero: 1, par: 4, stroke_index: 5 },
  { numero: 2, par: 3, stroke_index: 9 },
  { numero: 3, par: 4, stroke_index: 1 },
  { numero: 4, par: 4, stroke_index: 7 },
  { numero: 5, par: 3, stroke_index: 8 },
  { numero: 6, par: 4, stroke_index: 2 },
  { numero: 7, par: 5, stroke_index: 4 },
  { numero: 8, par: 4, stroke_index: 6 },
  { numero: 9, par: 4, stroke_index: 3 },
]

/** El catálogo como sale de `hoyosDeLaVuelta` sin repetir: cada hoyo es su propio origen. */
const conOrigenPropio = <T extends { numero: number }>(hoyos: T[]) =>
  hoyos.map((h) => ({ ...h, origen: h.numero }))
const CANCHA_18 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: i % 3 === 0 ? 5 : 4,
  stroke_index: i + 1,
}))

describe('escala de la cancha', () => {
  it('el par decide la escala, no la magnitud del rating', () => {
    expect(esEscalaDe18Hoyos(72)).toBe(true)
    expect(esEscalaDe18Hoyos(35)).toBe(false)
    expect(courseRatingEnEscalaDe9(71.6, 72)).toBe(35.8)
    expect(parEnEscalaDe9(71)).toBe(36)
    expect(parEnEscalaDe9(35)).toBe(35)
  })

  it('la escala se decide por la RELACIÓN rating↔par, y dice cuál de las dos fue', () => {
    // Un rating que ya está en escala de 9 se respeta.
    expect(resolverRatingEnEscalaDe9(35.8, 36)).toEqual({ courseRating: 35.8, escala: 'ya_en_9' })
    // Los 9 loops de Brisas / Marbella / Rocas: 72 sobre par 36. La mitad cierra
    // contra el par, así que el dato se RECUPERA — no miente, está mal escalado.
    expect(resolverRatingEnEscalaDe9(72, 36)).toEqual({ courseRating: 36, escala: 'era_de_18' })
    // C.G. Río Blanco: 55 sobre par 35. No cierra en ninguna escala (+20 si ya
    // fuera de 9, −15 si fuera de 18). Se devuelve el par para que el término
    // `(CR − par)` se anule, pero la escala queda marcada IMPOSIBLE para que el
    // guardarrail no confunda ese 0 con un dato sano.
    expect(resolverRatingEnEscalaDe9(55, 35)).toEqual({ courseRating: 35, escala: 'imposible' })
  })

  it('el valor de `courseRatingEnEscalaDe9` es el de `resolverRatingEnEscalaDe9`', () => {
    // Un solo criterio de escala: si divergieran, el motor y el guardarrail
    // clasificarían distinto el mismo rating.
    for (const [cr, par] of [[35.8, 36], [72, 36], [55, 35], [71.6, 72], [64.4, 72]] as const) {
      expect(courseRatingEnEscalaDe9(cr, par)).toBe(resolverRatingEnEscalaDe9(cr, par).courseRating)
    }
  })

  it('hoyosDeUnaVuelta lee la misma señal', () => {
    expect(hoyosDeUnaVuelta(72)).toBe(18)
    expect(hoyosDeUnaVuelta(35)).toBe(9)
    // Sin par no se puede afirmar que sea de 9: se asume la cancha completa.
    expect(hoyosDeUnaVuelta(null)).toBe(18)
    expect(hoyosDeUnaVuelta(undefined)).toBe(18)
    expect(hoyosDeUnaVuelta(NaN)).toBe(18)
  })
})

describe('vueltasDeLaRonda — LA decisión', () => {
  it('una cancha de 9 en una ronda de 18 se recorre dos veces', () => {
    expect(vueltasDeLaRonda(9, 18)).toBe(2)
    expect(vueltasDeLaRonda(9, 27)).toBe(3)
  })

  it('todo lo demás es una sola vuelta', () => {
    expect(vueltasDeLaRonda(9, 9)).toBe(1)
    expect(vueltasDeLaRonda(18, 18)).toBe(1)
    // Media cancha de 18 NO es media vuelta: sigue siendo una pasada.
    expect(vueltasDeLaRonda(18, 9)).toBe(1)
  })

  it('sólo se repite si la ronda es múltiplo EXACTO de la vuelta', () => {
    // Un catálogo de 15 hoyos en una ronda de 18 no son "1.2 vueltas": está
    // incompleto. Repetirlo copiaría los hoyos 1-3 al final con un par
    // plausible que nadie notaría.
    expect(vueltasDeLaRonda(15, 18)).toBe(1)
    expect(vueltasDeLaRonda(12, 18)).toBe(1)
    expect(vueltasDeLaRonda(10, 18)).toBe(1)
  })

  it('no explota con entradas basura', () => {
    expect(vueltasDeLaRonda(0, 18)).toBe(1)
    expect(vueltasDeLaRonda(-9, 18)).toBe(1)
    expect(vueltasDeLaRonda(9, NaN)).toBe(1)
  })
})

describe('strokeIndexDeVuelta — impares la primera vuelta, pares la segunda', () => {
  it('convierte el SI de 9 en la tarjeta de 18 que imprime el club', () => {
    expect(strokeIndexDeVuelta(1, 1, 2)).toBe(1)
    expect(strokeIndexDeVuelta(1, 2, 2)).toBe(2)
    expect(strokeIndexDeVuelta(5, 1, 2)).toBe(9)
    expect(strokeIndexDeVuelta(5, 2, 2)).toBe(10)
    expect(strokeIndexDeVuelta(9, 2, 2)).toBe(18)
  })

  it('a una sola vuelta no cambia nada', () => {
    for (let si = 1; si <= 9; si++) expect(strokeIndexDeVuelta(si, 1, 1)).toBe(si)
  })
})

describe('hoyosDeLaVuelta — los hoyos que se juegan de verdad', () => {
  it('cancha de 9 en torneo de 18: repite la vuelta con el par REAL', () => {
    const hoyos = hoyosDeLaVuelta(RIO_BLANCO_9, 18)
    expect(hoyos).toHaveLength(18)
    expect(hoyos.map((h) => h.numero)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
    // El hoyo 10 es el hoyo 1 otra vez, con SU par — no par 4.
    expect(hoyos[9].par).toBe(RIO_BLANCO_9[0].par)
    expect(hoyos[10].par).toBe(3) // hoyo 11 = hoyo 2, un par 3
    // Par de la ronda = 35 + 35 = 70. Antes daba 35 + 9×4 = 71... y con el
    // relleno completo, 72. Los dos números eran mentira.
    expect(hoyos.reduce((s, h) => s + h.par, 0)).toBe(70)
  })

  it('el stroke index de las dos vueltas es una permutación exacta de 1..18', () => {
    const sis = hoyosDeLaVuelta(RIO_BLANCO_9, 18).map((h) => h.stroke_index).sort((a, b) => a - b)
    expect(sis).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
  })

  it('el hoyo más difícil de la cancha sigue siendo el más difícil de la ronda', () => {
    const hoyos = hoyosDeLaVuelta(RIO_BLANCO_9, 18)
    // Río Blanco: el SI 1 es el hoyo 3. En 18 hoyos, SI 1 y SI 2.
    expect(hoyos.find((h) => h.stroke_index === 1)!.numero).toBe(3)
    expect(hoyos.find((h) => h.stroke_index === 2)!.numero).toBe(12)
  })

  it('cancha de 18 en torneo de 18: no toca nada', () => {
    expect(hoyosDeLaVuelta(CANCHA_18, 18)).toEqual(conOrigenPropio(CANCHA_18))
  })

  it('cancha de 18 en torneo de 9: NO recorta — la ronda puede jugar el Back 9', () => {
    // `generarOrdenHoyos(10, 9)` da [10..18]. Si acá se devolvieran "los
    // primeros 9", esos nueve hoyos quedarían sin par ni stroke index y se
    // puntuarían contra par 4 con el neto igual al gross.
    const hoyos = hoyosDeLaVuelta(CANCHA_18, 9)
    expect(hoyos).toEqual(conOrigenPropio(CANCHA_18))
    const porNumero = new Map(hoyos.map((h) => [h.numero, h]))
    for (const n of [10, 11, 12, 13, 14, 15, 16, 17, 18]) {
      expect(porNumero.get(n)?.par, `hoyo ${n}`).toBe(CANCHA_18[n - 1].par)
    }
  })

  it('sin catálogo: cancha neutra a par 4, igual que antes', () => {
    const hoyos = hoyosDeLaVuelta([], 18)
    expect(hoyos).toHaveLength(18)
    expect(hoyos.every((h) => h.par === PAR_FALLBACK)).toBe(true)
    expect(hoyos.map((h) => h.stroke_index)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
  })

  it('catálogo incompleto (ni 9 ni 18): completa a par 4, NO repite la vuelta', () => {
    // 15 hoyos en una ronda de 18: los que faltan salen a par 4. Repetirlos
    // desde el hoyo 1 daría un par plausible y falso.
    const parcial = CANCHA_18.slice(0, 15)
    const hoyos = hoyosDeLaVuelta(parcial, 18)
    expect(hoyos).toHaveLength(18)
    expect(hoyos.map((h) => h.numero)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
    // Los hoyos 16, 17 y 18 son relleno neutro, no copias de los hoyos 1-3.
    expect(hoyos.slice(15).map((h) => h.par)).toEqual([PAR_FALLBACK, PAR_FALLBACK, PAR_FALLBACK])
    expect(hoyos.slice(15).map((h) => h.stroke_index)).toEqual([16, 17, 18])
    expect(hoyos[0].par).toBe(CANCHA_18[0].par)
  })

  it('un catálogo con filas repetidas por número NO se trata como cancha de 9', () => {
    // Una cancha 27h puede venir como 27 filas numeradas 1..9 tres veces: son
    // TRES recorridos distintos, no uno repetido. Repetir el primero dos veces
    // daría un par plausible y equivocado.
    const tresLoops = [
      ...RIO_BLANCO_9,
      ...RIO_BLANCO_9.map((h) => ({ ...h, par: 5 })),
      ...RIO_BLANCO_9.map((h) => ({ ...h, par: 3 })),
    ]
    const hoyos = hoyosDeLaVuelta(tresLoops, 18)
    // Se queda con la primera fila de cada número (9 hoyos) y completa a par 4.
    expect(hoyos.slice(0, 9)).toEqual(conOrigenPropio(RIO_BLANCO_9))
    expect(hoyos.slice(9).every((h) => h.par === PAR_FALLBACK)).toBe(true)
  })

  it('origen dice de qué hoyo del catálogo salió cada uno, en las cuatro ramas', () => {
    // Es lo que usan los dos scorers de ronda libre para saber de qué hoyo sacar
    // el yardaje. Antes lo re-derivaban con su propio `vueltasDeLaRonda`, sin la
    // guarda de catálogo sucio: en una cancha 27h los dos cálculos divergen y el
    // hoyo 10 mostraba el yardaje equivocado.

    // 1. Sin catálogo: no hay origen que declarar.
    expect(hoyosDeLaVuelta([], 18).every((h) => h.origen === null)).toBe(true)

    // 2. Vuelta repetida: el hoyo 10 es el hoyo 1 otra vez.
    const dosVueltas = hoyosDeLaVuelta(RIO_BLANCO_9, 18)
    expect(dosVueltas.map((h) => h.origen)).toEqual([
      ...RIO_BLANCO_9.map((h) => h.numero),
      ...RIO_BLANCO_9.map((h) => h.numero),
    ])
    // Y el par del hoyo de origen es el mismo, que es lo que hace válida la
    // correspondencia de yardajes.
    for (const h of dosVueltas) {
      expect(h.par).toBe(RIO_BLANCO_9.find((c) => c.numero === h.origen)!.par)
    }

    // 3. Sin repetir: cada hoyo es su propio origen.
    expect(hoyosDeLaVuelta(CANCHA_18, 18).every((h) => h.origen === h.numero)).toBe(true)

    // 4. Relleno de un catálogo incompleto: no salió de ningún hoyo real.
    const parcial = hoyosDeLaVuelta(CANCHA_18.slice(0, 15), 18)
    expect(parcial.slice(0, 15).every((h) => h.origen === h.numero)).toBe(true)
    expect(parcial.slice(15).every((h) => h.origen === null)).toBe(true)
  })

  it('dedup por número: una cancha multi-recorrido no infla el par', () => {
    const conDuplicados = [...RIO_BLANCO_9, { numero: 1, par: 4, stroke_index: 5 }]
    expect(hoyosDeLaVuelta(conDuplicados, 9).reduce((s, h) => s + h.par, 0)).toBe(35)
  })

  it('una cancha de 9 con el SI de la tarjeta de 18 (impares) igual da 1..18', () => {
    // 166 canchas del catálogo publican el front-9 con SI 1,3,5…17. Sin
    // normalizar, la tarjeta de dos vueltas llegaría a SI 33.
    const siImpar = RIO_BLANCO_9.map((h, i) => ({ ...h, stroke_index: i * 2 + 1 }))
    const sis = hoyosDeLaVuelta(siImpar, 18).map((h) => h.stroke_index).sort((a, b) => a - b)
    expect(sis).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
  })

  it('un hoyo sin par ni SI cargado no rompe la vuelta', () => {
    const sucio = [{ numero: 1, par: null, stroke_index: null }, { numero: 2, par: 3 }]
    const hoyos = hoyosDeLaVuelta(sucio, 2)
    expect(hoyos[0]).toEqual({ numero: 1, origen: 1, par: PAR_FALLBACK, stroke_index: 1 })
    expect(hoyos[1].par).toBe(3)
  })
})

describe('el motor de golpes acepta la vuelta repetida sin corregirla', () => {
  it('normalizedStrokeIndexByHole es no-op sobre los 18 hoyos de dos vueltas', () => {
    const hoyos = hoyosDeLaVuelta(RIO_BLANCO_9, 18)
    const norm = normalizedStrokeIndexByHole(hoyos, 18)
    for (const h of hoyos) expect(norm[h.numero]).toBe(h.stroke_index)
  })

  it('los golpes de handicap se reparten COMPLETOS y parejos entre las dos vueltas', () => {
    const hoyos = hoyosDeLaVuelta(RIO_BLANCO_9, 18)
    for (const hcp of [0, 1, 5, 9, 12, 18, 24, 36]) {
      const porHoyo = hoyos.map((h) => strokesRecibidosEnHoyo(hcp, h.stroke_index, 18))
      // Σ golpes repartidos == course handicap: ni se pierden ni se inventan.
      expect(porHoyo.reduce((a, b) => a + b, 0), `hcp ${hcp}`).toBe(hcp)
      // Y ninguna vuelta se lleva más de un golpe de diferencia respecto a la otra.
      const primera = porHoyo.slice(0, 9).reduce((a, b) => a + b, 0)
      const segunda = porHoyo.slice(9).reduce((a, b) => a + b, 0)
      expect(Math.abs(primera - segunda), `hcp ${hcp}`).toBeLessThanOrEqual(1)
    }
  })
})

describe('sumaDeVueltas / ratingDeVueltas', () => {
  it('el Course Rating y el par son aditivos por vuelta', () => {
    const r = ratingDeVueltas(34.8, 35, 2)
    expect(r.courseRating).toBeCloseTo(69.6, 5)
    expect(r.par).toBe(70)
  })

  it('a una vuelta devuelve el valor tal cual', () => {
    expect(sumaDeVueltas(71.6, 1)).toBe(71.6)
    expect(ratingDeVueltas(71.6, 72, 1)).toEqual({ courseRating: 71.6, par: 72 })
  })

  it('parDeVariasVueltas sale del par propio de la cancha, en su escala', () => {
    expect(parDeVariasVueltas(35, 2)).toBe(70)
    expect(parDeVariasVueltas(36, 2)).toBe(72)
    // Una cancha de 18 nunca da dos vueltas, pero si se pidiera, el par de UNA
    // vuelta es 72 — no 36.
    expect(parDeVariasVueltas(72, 1)).toBe(72)
    // Sin par de cancha se asume la vuelta estándar de 36.
    expect(parDeVariasVueltas(null, 2)).toBe(72)
  })
})
