import { describe, it, expect, vi } from 'vitest'
import { guardarRondaDeTorneoEnHistorial, tarjetaDeTorneo, tarjetaDeTorneoDaDiferencial } from './historial-torneo'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => undefined) }))

type Respuesta = { data?: unknown; error?: unknown; count?: number }

/** Cliente falso: cada `from(tabla)` resuelve `porTabla[tabla]` al hacer await; captura los insert. */
function fake(porTabla: Record<string, Respuesta>) {
  const insertados: Record<string, unknown>[] = []
  const lecturas: Array<{ tabla: string; select?: string }> = []
  const sb = {
    insertados,
    lecturas,
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from(tabla: string) {
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null, ...(porTabla[tabla] ?? {}) }).then(ok, ko)
          if (prop === 'insert') return (payload: Record<string, unknown>) => {
            insertados.push(payload)
            return Promise.resolve({ data: null, error: null })
          }
          if (prop === 'select') return (cols?: string) => { lecturas.push({ tabla, select: cols }); return proxy }
          return () => proxy
        },
      })
      return proxy
    },
  }
  return sb
}

const PAR: Record<number, number> = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5, 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
const H18 = Array.from({ length: 18 }, (_, i) => i + 1)
const CATALOGO = H18.map(n => ({ numero: n, par: PAR[n], stroke_index: n, recorrido: null }))
const dif = (gross: number, holes = 18) => holes <= 9
  ? parseFloat((((gross - 71.3 / 2) * 113 / 128) * 2).toFixed(2))
  : parseFloat(((gross - 71.3) * 113 / 128).toFixed(2))

// 18 bogeys con un 11 en el hoyo 4 (par 5, SI 4): bruto 95. Índice 12 → CH 13 → tope 8 → ajustado 92.
const golpes = H18.map(h => PAR[h] + 1); golpes[3] = 11
const holeScores = (hoyos: number[]) => hoyos.map(h => ({ hole_number: h, gross_score: golpes[h - 1], par: PAR[h] }))
const torneo = (extra: Record<string, unknown> = {}) => ({
  id: 't1', afecta_estadisticas: true, course_id: 'c1', hole_count: 18, date_start: '2026-10-01', total_rounds: 1,
  tees: 'azul', formato_juego: 'stroke_play', modo_juego: 'gross', ...extra,
})
const tablas = (extra: Record<string, Respuesta> = {}): Record<string, Respuesta> => ({
  rounds: { data: { player_id: 'p1', round_number: 1, total_gross: 95, tournament_id: 't1' } },
  tournaments: { data: torneo() },
  players: { data: { user_id: 'u1' } },
  courses: { data: { nombre: 'Los Leones', slope_rating: 128, course_rating: 71.3 } },
  hole_scores: { data: holeScores(H18) },
  course_tees: { data: { rating: 71.3, slope: 128 } },
  course_holes: { data: CATALOGO },
  profiles: { data: { indice: 12, indice_golfers: null } },
  historical_rounds: { count: 3 },
  ...extra,
})

describe('guardarRondaDeTorneoEnHistorial — WHS 3.1 (#545)', () => {
  it('el diferencial sale del gross ajustado; persiste par_per_hole, metadata.hoyos y adjusted_gross', async () => {
    const sb = fake(tablas())
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    const fila = sb.insertados[0]
    expect(fila.total_gross).toBe(95)
    expect(fila.adjusted_gross).toBe(92)
    expect(fila.diferencial).toBe(dif(92))
    expect(fila.holes_played).toBe(18)
    expect(fila.par_per_hole).toEqual(Object.fromEntries(H18.map(h => [String(h), PAR[h]])))
    const meta = fila.metadata as { hoyos: number[]; ajuste_whs: { course_hcp: number; indice: number } }
    expect(meta.hoyos).toEqual(H18)
    expect(meta.ajuste_whs).toMatchObject({ course_hcp: 13, indice: 12 })
  })

  it('el índice del tope sale del perfil del jugador (nunca un 18 inventado): sin índice → par + 5', async () => {
    const sb = fake(tablas({ profiles: { data: { indice: null, indice_golfers: null } } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    // tope del hoyo 4 = 5 + 5 = 10 → ajustado 94 (con un índice 18 inventado: CH 20 → tope 8 → 92)
    expect(sb.insertados[0].adjusted_gross).toBe(94)
    expect(sb.lecturas.some(l => l.tabla === 'profiles')).toBe(true)
  })

  it('torneo de 9 hoyos: tarjeta de 9 con su diferencial de 9 (antes se infería por el gross)', async () => {
    const nueve = H18.slice(0, 9)
    const sb = fake(tablas({
      tournaments: { data: torneo({ hole_count: 9 }) },
      rounds: { data: { player_id: 'p1', round_number: 1, total_gross: 50, tournament_id: 't1' } },
      hole_scores: { data: holeScores(nueve) },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    const fila = sb.insertados[0]
    expect(fila.scores).toHaveLength(9)
    expect(fila.holes_played).toBe(9)
    // 9 hoyos: bruto 50 (hoyo 4 con 11); CH 9h con CR/2 = round(6 + (35.65 − 36)) = 6 → tope 5+2+1 = 8 → 47
    expect(fila.adjusted_gross).toBe(47)
    expect(fila.diferencial).toBe(dif(47, 9))
  })

  it('bola compartida (scramble): diferencial null', async () => {
    const sb = fake(tablas({ tournaments: { data: torneo({ formato_juego: 'scramble' }) } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0].diferencial).toBeNull()
  })

  it('tarjeta a medias (retiro tras 12 hoyos): sin diferencial', async () => {
    const sb = fake(tablas({ hole_scores: { data: holeScores(H18.slice(0, 12)) } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0].holes_played).toBe(12)
    expect(sb.insertados[0].diferencial).toBeNull()
  })

  it('torneo que no afecta estadísticas: no inserta', async () => {
    const sb = fake(tablas({ tournaments: { data: torneo({ afecta_estadisticas: false }) } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados).toHaveLength(0)
  })
})

describe('tarjetaDeTorneo', () => {
  it('posiciones 1..N, null en hoyos sin score, par sólo donde está cargado', () => {
    const t = tarjetaDeTorneo([{ hole_number: 1, gross_score: 5, par: 4 }, { hole_number: 3, gross_score: 3, par: null }], 4)
    expect(t).toEqual({ scores: [5, null, 3, null], parPerHole: { '1': 4 }, hoyos: [1, 2, 3, 4], jugados: 2, totalGross: 8 })
  })
  it('da diferencial con la tarjeta completa o exactamente 9 hoyos', () => {
    expect(tarjetaDeTorneoDaDiferencial(18, 18)).toBe(true)
    expect(tarjetaDeTorneoDaDiferencial(9, 18)).toBe(true)
    expect(tarjetaDeTorneoDaDiferencial(12, 18)).toBe(false)
  })
})
