import { describe, it, expect } from 'vitest'
import {
  HANDICAP_INDEX_MAX,
  formatearIndice,
  HANDICAP_INDEX_MIN,
  MENSAJE_INDICE_FUERA_DE_RANGO,
  RANGO_INDICE,
  courseDataDeInscripcion,
  esHandicapDeInscripcionValido,
  esIndiceDeHandicapValido,
  formatearHandicap,
  mensajeHandicapFueraDeRango,
  parsearHandicap,
  rangoDeHandicapDeInscripcion,
} from './handicap-index-range'
import { resolverCourseHandicap } from './core/course-handicap'

describe('esIndiceDeHandicapValido', () => {
  it('acepta índices reales, incluido 0, plus y los bordes', () => {
    for (const v of [0, 18.5, 36, -2, HANDICAP_INDEX_MIN, HANDICAP_INDEX_MAX]) {
      expect(esIndiceDeHandicapValido(v)).toBe(true)
    }
  })

  it('rechaza el typo sin coma decimal ("185" por 18.5) y valores fuera de WHS', () => {
    for (const v of [185, 54.1, 99, -10.1, -59]) {
      expect(esIndiceDeHandicapValido(v)).toBe(false)
    }
  })

  it('rechaza lo que no es un número finito', () => {
    for (const v of [NaN, Infinity, -Infinity, '18', null, undefined, {}]) {
      expect(esIndiceDeHandicapValido(v)).toBe(false)
    }
  })

  it('el mensaje muestra el plus con signo + y el máximo WHS', () => {
    expect(MENSAJE_INDICE_FUERA_DE_RANGO).toContain('+10')
    expect(MENSAJE_INDICE_FUERA_DE_RANGO).toContain('54')
  })
})

// Revisión del PR #720: la columna guarda un COURSE HANDICAP en los torneos
// raw/legacy (`players/route.ts` lo pre-convierte), y ese número pasa de 54
// legítimamente. El rango no se inventa: es la imagen del rango de índice por
// la MISMA fórmula que usa el write-path.
describe('rangoDeHandicapDeInscripcion', () => {
  const cancha = { slope: 130, courseRating: 73.5, par: 72 }

  it('WHS: la columna guarda el índice → rango de índice', () => {
    expect(rangoDeHandicapDeInscripcion('whs', cancha)).toBe(RANGO_INDICE)
  })

  it('raw: la imagen del rango de índice por resolverCourseHandicap con la cancha', () => {
    const r = rangoDeHandicapDeInscripcion('raw', cancha)
    expect(r.guarda).toBe('course_handicap')
    expect(r.min).toBe(resolverCourseHandicap(HANDICAP_INDEX_MIN, cancha))
    expect(r.max).toBe(resolverCourseHandicap(HANDICAP_INDEX_MAX, cancha))
    // 54 × 130/113 + 1,5 = 63,6 → 64: un índice 54 en esta cancha ES un course handicap 64.
    expect(r.max).toBe(64)
    expect(r.max).toBeGreaterThan(HANDICAP_INDEX_MAX)
  })

  it('raw sin cancha creíble: la fórmula devuelve el índice → mismo rango que el de índice', () => {
    const r = rangoDeHandicapDeInscripcion('raw', null)
    expect(r.min).toBe(HANDICAP_INDEX_MIN)
    expect(r.max).toBe(HANDICAP_INDEX_MAX)
    expect(r.guarda).toBe('course_handicap')
  })

  it('raw en cancha fácil: el rango no deja afuera el índice que la columna guarda a los invitados', () => {
    const facil = { slope: 105, courseRating: 69, par: 72 }
    // −10 → −12 y 54 → 47 por la fórmula; la unión con el rango de índice cubre ambos.
    const r = rangoDeHandicapDeInscripcion('raw', facil)
    expect(r.min).toBe(-12)
    expect(r.max).toBe(HANDICAP_INDEX_MAX)
    expect(esHandicapDeInscripcionValido(50, r)).toBe(true)
  })

  it('modo nulo o desconocido se trata como raw (igual que el leaderboard)', () => {
    expect(rangoDeHandicapDeInscripcion(null, cancha).max).toBe(64)
    expect(rangoDeHandicapDeInscripcion('legacy', cancha).max).toBe(64)
  })

  it('el predicado y el mensaje siguen al rango, no a una constante', () => {
    const raw = rangoDeHandicapDeInscripcion('raw', cancha)
    expect(esHandicapDeInscripcionValido(60, raw)).toBe(true)
    expect(esHandicapDeInscripcionValido(60, RANGO_INDICE)).toBe(false)
    expect(esHandicapDeInscripcionValido(65, raw)).toBe(false)
    expect(mensajeHandicapFueraDeRango(RANGO_INDICE)).toBe(MENSAJE_INDICE_FUERA_DE_RANGO)
    expect(mensajeHandicapFueraDeRango(raw)).toContain('handicap de cancha')
    expect(mensajeHandicapFueraDeRango(raw)).toContain('64')
    expect(mensajeHandicapFueraDeRango(raw)).toContain('+10')
  })
})

// Revisión del PR #720: un plus 2 se mostraba "-2" (el crudo de la base) y el
// mensaje pedía "+10" en un input que no acepta el "+". Una sola notación.
describe('formatearHandicap', () => {
  it('los plus van con signo +, nunca en negativo', () => {
    expect(formatearHandicap(-2)).toBe('+2')
    expect(formatearHandicap(-2.4)).toBe('+2.4')
    expect(formatearHandicap(-10)).toBe('+10')
  })

  it('los demás se muestran como vienen', () => {
    expect(formatearHandicap(0)).toBe('0')
    expect(formatearHandicap(12.4)).toBe('12.4')
    expect(formatearHandicap(54)).toBe('54')
    expect(formatearHandicap('18.5')).toBe('18.5')
  })

  it('sin dato → "--"', () => {
    for (const v of [null, undefined, '', NaN, 'abc']) {
      expect(formatearHandicap(v as never)).toBe('--')
    }
  })
})

describe('parsearHandicap', () => {
  it('acepta el plus con signo (+2 → −2) y el negativo con que lo guarda la app', () => {
    expect(parsearHandicap('+2')).toBe(-2)
    expect(parsearHandicap('+2.4')).toBe(-2.4)
    expect(parsearHandicap('-2')).toBe(-2)
    expect(parsearHandicap(' +10 ')).toBe(-10)
  })

  it('acepta la coma decimal chilena', () => {
    expect(parsearHandicap('18,5')).toBe(18.5)
    expect(parsearHandicap('12.4')).toBe(12.4)
    expect(parsearHandicap('12.')).toBe(12)
    expect(parsearHandicap('.5')).toBe(0.5)
  })

  it('+0 y -0 son 0, no −0', () => {
    expect(Object.is(parsearHandicap('+0'), 0)).toBe(true)
    expect(Object.is(parsearHandicap('-0'), 0)).toBe(true)
  })

  it('lo que no es un número es NaN (el caller muestra el mensaje)', () => {
    for (const t of ['', '   ', 'abc', '1e3', '+-2', '2+', '18.5.1', '1,2,3']) {
      expect(Number.isNaN(parsearHandicap(t))).toBe(true)
    }
  })

  it('ida y vuelta: lo que se muestra se puede volver a tipear', () => {
    for (const v of [-2, -2.4, 0, 12.4, 54]) {
      expect(parsearHandicap(formatearHandicap(v))).toBe(v)
    }
  })
})

describe('courseDataDeInscripcion', () => {
  it('arma la cancha del motor desde las columnas de courses, con par 72 si falta', () => {
    expect(courseDataDeInscripcion({ slope_rating: 130, course_rating: 73.5, par_total: 71 })).toEqual({ slope: 130, courseRating: 73.5, par: 71 })
    expect(courseDataDeInscripcion({ slope_rating: 130, course_rating: 73.5, par_total: null })?.par).toBe(72)
  })

  it('sin slope o sin course rating no hay cancha creíble', () => {
    expect(courseDataDeInscripcion({ slope_rating: null, course_rating: 73.5, par_total: 72 })).toBeNull()
    expect(courseDataDeInscripcion({ slope_rating: 130, course_rating: null, par_total: 72 })).toBeNull()
    expect(courseDataDeInscripcion(null)).toBeNull()
  })
})

describe('formatearIndice', () => {
  it('un decimal fijo y los plus con "+"', () => {
    expect(formatearIndice(18)).toBe('18.0')
    expect(formatearIndice(17.24)).toBe('17.2')
    expect(formatearIndice(0)).toBe('0.0')
    expect(formatearIndice(-1)).toBe('+1.0')
  })
})
