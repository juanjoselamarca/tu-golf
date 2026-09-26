import { describe, it, expect } from 'vitest'
import {
  aplicarCambioDeRonda,
  eliminarRonda,
  nuevaRondaDesde,
  renumerarRondas,
  rondasSonSecuenciales,
  siguienteNumeroDeRonda,
} from './rounds-defaults'
import type { RoundConfig } from '@/lib/draft/types'

function ronda(over: Partial<RoundConfig> & { round_number: number }): RoundConfig {
  return { date: null, course_id: null, hole_count: 18, tee_assignment_mode: 'per_player', ...over }
}

describe('nuevaRondaDesde — la ronda nueva precarga la cancha de la ronda 1', () => {
  it('hereda cancha, hoyos y modo de tee; la fecha queda vacía', () => {
    const r1 = ronda({ round_number: 1, course_id: 'A', hole_count: 9, tee_assignment_mode: 'per_category', date: '2026-10-10' })
    const nueva = nuevaRondaDesde([r1])
    expect(nueva).toEqual({
      round_number: 2, date: null, course_id: 'A', hole_count: 9, tee_assignment_mode: 'per_category',
    })
  })

  it('sin rondas: ronda 1 vacía con 18 hoyos', () => {
    expect(nuevaRondaDesde([])).toEqual({
      round_number: 1, date: null, course_id: null, hole_count: 18, tee_assignment_mode: 'per_player',
    })
  })

  it('hereda de la ronda 1 aunque el array esté desordenado, y numera después de la mayor', () => {
    const rounds = [ronda({ round_number: 2, course_id: 'B' }), ronda({ round_number: 1, course_id: 'A' })]
    const nueva = nuevaRondaDesde(rounds)
    expect(nueva.course_id).toBe('A')
    expect(nueva.round_number).toBe(3)
    expect(siguienteNumeroDeRonda(rounds)).toBe(3)
  })
})

describe('aplicarCambioDeRonda — las rondas siguen a la 1 mientras no se toquen a mano', () => {
  const base = [
    ronda({ round_number: 1, course_id: 'A', hole_count: 18 }),
    ronda({ round_number: 2, course_id: 'A', hole_count: 18 }), // sigue a la 1
    ronda({ round_number: 3, course_id: 'C', hole_count: 18 }), // cancha cambiada a mano
    ronda({ round_number: 4, course_id: 'A', hole_count: 9 }),  // hoyos cambiados a mano
  ]

  it('cambiar la cancha de la ronda 1 arrastra sólo a las que seguían (misma cancha Y hoyos)', () => {
    const out = aplicarCambioDeRonda(base, 0, { course_id: 'B' })
    expect(out.map((r) => r.course_id)).toEqual(['B', 'B', 'C', 'A'])
  })

  it('cambiar los hoyos de la ronda 1 arrastra los hoyos de las que seguían', () => {
    const out = aplicarCambioDeRonda(base, 0, { hole_count: 9 })
    expect(out.map((r) => r.hole_count)).toEqual([9, 9, 18, 9])
    expect(out[3]).toEqual(base[3]) // ya estaba en 9 por decisión propia: intacta
  })

  it('cambiar la cancha de una ronda ≥ 2 no toca a las demás', () => {
    const out = aplicarCambioDeRonda(base, 1, { course_id: 'B' })
    expect(out.map((r) => r.course_id)).toEqual(['A', 'B', 'C', 'A'])
  })

  it('un patch de la ronda 1 que no cambia cancha ni hoyos (fecha) no arrastra nada', () => {
    const out = aplicarCambioDeRonda(base, 0, { date: '2026-10-10' })
    expect(out[0]).toMatchObject({ date: '2026-10-10', course_id: 'A' })
    expect(out.slice(1)).toEqual(base.slice(1))
  })

  it('las rondas sin cancha (null) siguen a la 1 cuando la 1 tampoco tenía', () => {
    const sinCancha = [ronda({ round_number: 1 }), ronda({ round_number: 2 })]
    const out = aplicarCambioDeRonda(sinCancha, 0, { course_id: 'A' })
    expect(out.map((r) => r.course_id)).toEqual(['A', 'A'])
  })

  it('la "ronda 1" es la de menor round_number, no la posición 0', () => {
    const desordenado = [ronda({ round_number: 2, course_id: 'A' }), ronda({ round_number: 1, course_id: 'A' })]
    const out = aplicarCambioDeRonda(desordenado, 1, { course_id: 'B' })
    expect(out.map((r) => r.course_id)).toEqual(['B', 'B'])
    const out2 = aplicarCambioDeRonda(desordenado, 0, { course_id: 'Z' })
    expect(out2.map((r) => r.course_id)).toEqual(['Z', 'A'])
  })

  it('idx fuera de rango devuelve una copia sin cambios; no muta la entrada', () => {
    const copia = base.map((r) => ({ ...r }))
    expect(aplicarCambioDeRonda(base, 9, { course_id: 'B' })).toEqual(base)
    aplicarCambioDeRonda(base, 0, { course_id: 'B' })
    expect(base).toEqual(copia)
  })
})

describe('eliminarRonda — las que quedan siempre son 1..N', () => {
  const tres = [
    ronda({ round_number: 1, course_id: 'A', date: '2026-10-10' }),
    ronda({ round_number: 2, course_id: 'B', date: '2026-10-11' }),
    ronda({ round_number: 3, course_id: 'C', date: '2026-10-12', hole_count: 9 }),
  ]

  it('borrar la ronda 2 de {1,2,3}: la 3 pasa a ser la 2 con SU cancha, fecha y hoyos', () => {
    const out = eliminarRonda(tres, 1)
    expect(out.map((r) => r.round_number)).toEqual([1, 2])
    expect(out[1]).toEqual({ ...tres[2], round_number: 2 })
    expect(rondasSonSecuenciales(out)).toBe(true)
  })

  it('borrar la ronda 1: la 2 pasa a ser la 1 (y con ella la fecha de inicio la sincroniza el editor)', () => {
    const out = eliminarRonda(tres, 0)
    expect(out.map((r) => [r.round_number, r.course_id])).toEqual([[1, 'B'], [2, 'C']])
  })

  it('borrar la última no renumera nada', () => {
    const out = eliminarRonda(tres, 2)
    expect(out).toEqual(tres.slice(0, 2))
  })

  it('idx fuera de rango devuelve una copia sin cambios', () => {
    expect(eliminarRonda(tres, 7)).toEqual(tres)
  })
})

describe('renumerarRondas / rondasSonSecuenciales', () => {
  it('ordena por round_number y renumera; idempotente', () => {
    const out = renumerarRondas([ronda({ round_number: 5, course_id: 'B' }), ronda({ round_number: 2, course_id: 'A' })])
    expect(out.map((r) => [r.round_number, r.course_id])).toEqual([[1, 'A'], [2, 'B']])
    expect(renumerarRondas(out)).toEqual(out)
  })

  it('detecta huecos y repetidos', () => {
    expect(rondasSonSecuenciales([{ round_number: 1 }, { round_number: 2 }])).toBe(true)
    expect(rondasSonSecuenciales([{ round_number: 2 }, { round_number: 1 }])).toBe(true)
    expect(rondasSonSecuenciales([{ round_number: 1 }, { round_number: 3 }])).toBe(false)
    expect(rondasSonSecuenciales([{ round_number: 1 }, { round_number: 1 }])).toBe(false)
    expect(rondasSonSecuenciales([{ round_number: 2 }])).toBe(false)
    expect(rondasSonSecuenciales([])).toBe(true)
  })
})
