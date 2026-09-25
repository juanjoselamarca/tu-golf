import { describe, it, expect } from 'vitest'
import { aplicarCambioDeRonda, nuevaRondaDesde, siguienteNumeroDeRonda } from './rounds-defaults'
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

describe('aplicarCambioDeRonda — las rondas siguen a la 1 mientras no se cambien a mano', () => {
  const base = [
    ronda({ round_number: 1, course_id: 'A' }),
    ronda({ round_number: 2, course_id: 'A' }), // sigue a la 1
    ronda({ round_number: 3, course_id: 'C' }), // cambiada a mano
  ]

  it('cambiar la cancha de la ronda 1 arrastra a las que tenían la misma; respeta las distintas', () => {
    const out = aplicarCambioDeRonda(base, 0, { course_id: 'B' })
    expect(out.map((r) => r.course_id)).toEqual(['B', 'B', 'C'])
  })

  it('cambiar la cancha de una ronda ≥ 2 no toca a las demás', () => {
    const out = aplicarCambioDeRonda(base, 1, { course_id: 'B' })
    expect(out.map((r) => r.course_id)).toEqual(['A', 'B', 'C'])
  })

  it('un patch de la ronda 1 que NO cambia la cancha (fecha, hoyos) no arrastra nada', () => {
    const out = aplicarCambioDeRonda(base, 0, { date: '2026-10-10', hole_count: 9 })
    expect(out[0]).toMatchObject({ date: '2026-10-10', hole_count: 9, course_id: 'A' })
    expect(out[1]).toEqual(base[1])
    expect(out[2]).toEqual(base[2])
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
    // y cambiar la de posición 0 (que es la ronda 2) no arrastra
    const out2 = aplicarCambioDeRonda(desordenado, 0, { course_id: 'Z' })
    expect(out2.map((r) => r.course_id)).toEqual(['Z', 'A'])
  })

  it('idx fuera de rango devuelve una copia sin cambios', () => {
    expect(aplicarCambioDeRonda(base, 9, { course_id: 'B' })).toEqual(base)
  })

  it('no muta el array de entrada', () => {
    const copia = base.map((r) => ({ ...r }))
    aplicarCambioDeRonda(base, 0, { course_id: 'B' })
    expect(base).toEqual(copia)
  })
})
