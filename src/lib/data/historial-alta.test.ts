import { describe, it, expect } from 'vitest'
import { agregarRondaManual, filaRondaManual, type RondaManualInput } from './historial-alta'

type Cadena = Array<[string, unknown[]]>

/** Cliente falso: cada tabla responde lo indicado; registra las cadenas para afirmar sobre el INSERT. */
function fake(porTabla: Record<string, (c: Cadena) => { data?: unknown; error?: unknown }>) {
  const llamadas: Array<{ tabla: string; cadena: Cadena }> = []
  return {
    llamadas,
    from(tabla: string) {
      const cadena: Cadena = []
      llamadas.push({ tabla, cadena })
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, ...(porTabla[tabla]?.(cadena) ?? {}) }).then(res)
          return (...args: unknown[]) => { cadena.push([String(prop), args]); return proxy }
        },
      })
      return proxy
    },
  }
}

// Tee con ratings de 18 y de cada mitad publicados (Los Leones-like).
const TEE = { rating: 72, slope: 130, front_course_rating: 35.8, front_slope_rating: 128, back_course_rating: 36.2, back_slope_rating: 132 }
const cancha = () => fake({
  courses: () => ({ data: { id: 'c1', slope_rating: 125, course_rating: 70 } }),
  course_tees: () => ({ data: TEE }),
})

const nueve = (desde: number, golpes: number[]): (number | null)[] => {
  const s: (number | null)[] = Array(18).fill(null)
  golpes.forEach((g, i) => { s[desde - 1 + i] = g })
  return s
}
const suma = (s: (number | null)[]) => s.reduce<number>((a, b) => a + (b ?? 0), 0)
const input = (scores: (number | null)[], over: Partial<RondaManualInput> = {}): RondaManualInput => ({
  userId: 'u1', courseName: 'Los Leones', teeColor: 'Azul', playedAt: '2026-10-09',
  scores, totalGross: suma(scores), notes: null, privacy: 'private', ...over,
})

describe('filaRondaManual — diferencial con la regla del cierre de ronda libre', () => {
  it('9 delanteros con bruto > 55: diferencial de 9 con el rating publicado del front, no la fórmula de 18', async () => {
    const scores = nueve(1, [7, 7, 6, 7, 6, 7, 6, 6, 6]) // 58
    const fila = await filaRondaManual(cancha() as never, input(scores))
    expect(fila.holes_played).toBe(9)
    // (58 − 35,8) × 113 / 128 × 2 = 39,20 — antes salía (58 − 72) × 113 / 130 = −12,17.
    expect(fila.diferencial).toBeCloseTo(((58 - 35.8) * 113 / 128) * 2, 2)
    expect(fila.diferencial).toBeGreaterThan(0)
  })

  it('9 traseros: usa el rating del back', async () => {
    const scores = nueve(10, [5, 5, 5, 5, 5, 5, 5, 5, 5]) // 45
    const fila = await filaRondaManual(cancha() as never, input(scores))
    expect(fila.diferencial).toBeCloseTo(((45 - 36.2) * 113 / 132) * 2, 2)
  })

  it('tarjeta de 17 hoyos sin completar: sin diferencial (no entra al índice subestimada)', async () => {
    const scores: (number | null)[] = [5, 5, 9, 4, 4, 3, 4, 4, 5, 4, 3, 4, 4, 3, 4, 4, 5, null] // 74 en 17
    const fila = await filaRondaManual(cancha() as never, input(scores))
    expect(fila.holes_played).toBe(17)
    expect(fila.diferencial).toBeNull()
  })

  it('18 hoyos: fórmula de 18 con el tee', async () => {
    const scores = Array(18).fill(5) // 90
    const fila = await filaRondaManual(cancha() as never, input(scores))
    expect(fila.holes_played).toBe(18)
    expect(fila.course_rating).toBe(72)
    expect(fila.slope_rating).toBe(130)
    expect(fila.diferencial).toBeCloseTo((90 - 72) * 113 / 130, 2)
  })

  it('sin tee: cae al CR/slope de la cancha', async () => {
    const fila = await filaRondaManual(cancha() as never, input(Array(18).fill(5), { teeColor: null }))
    expect(fila.course_rating).toBe(70)
    expect(fila.slope_rating).toBe(125)
  })

  it('cancha desconocida: guarda la ronda sin ratings ni diferencial', async () => {
    const sb = fake({ courses: () => ({ data: null, error: { code: 'PGRST116' } }) })
    const fila = await filaRondaManual(sb as never, input(Array(18).fill(5), { courseName: 'Inventada' }))
    expect(fila.course_id).toBeNull()
    expect(fila.diferencial).toBeNull()
    expect(fila.total_gross).toBe(90)
  })
})

describe('agregarRondaManual', () => {
  it('inserta la fila resuelta y devuelve el error de PostgREST', async () => {
    const err = { code: '23505', message: 'dup' }
    const sb = fake({
      courses: () => ({ data: { id: 'c1', slope_rating: 125, course_rating: 70 } }),
      course_tees: () => ({ data: TEE }),
      historical_rounds: () => ({ error: err }),
    })
    const { error } = await agregarRondaManual(sb as never, input(Array(18).fill(5)))
    expect(error).toBe(err)
    const insert = sb.llamadas.find(l => l.tabla === 'historical_rounds')?.cadena.find(c => c[0] === 'insert')?.[1][0] as Record<string, unknown>
    expect(insert).toMatchObject({ user_id: 'u1', course_id: 'c1', holes_played: 18, total_gross: 90 })
  })
})
