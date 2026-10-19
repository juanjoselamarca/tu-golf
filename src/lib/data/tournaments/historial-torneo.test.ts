import { describe, it, expect, vi } from 'vitest'
import { guardarRondaDeTorneoEnHistorial, tarjetaDeTorneo } from './historial-torneo'

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
// La cancha llega embebida en el torneo, como la trae `fetchLegacyHcpContext` (sin tees de catálogo:
// los ratings salen de la cancha). `fedegolf_club_id: null` → sin variante de género que buscar.
const CANCHA = {
  id: 'c1', nombre: 'Los Leones', fedegolf_club_id: null, par_total: 72, slope_rating: 128, course_rating: 71.3,
  course_tees: [] as unknown[],
}
const torneo = (extra: Record<string, unknown> = {}) => ({
  id: 't1', afecta_estadisticas: true, course_id: 'c1', hole_count: 18, date_start: '2026-10-01', total_rounds: 1,
  tees: 'azul', formato_juego: 'stroke_play', modo_juego: 'gross', hcp_calc_mode: 'whs', courses: CANCHA, ...extra,
})
const tablas = (extra: Record<string, Respuesta> = {}): Record<string, Respuesta> => ({
  rounds: { data: { player_id: 'p1', round_number: 1, total_gross: 95, tournament_id: 't1' } },
  tournaments: { data: torneo() },
  players: { data: { user_id: 'u1' } },
  courses: { data: { nombre: 'Los Leones' } },
  hole_scores: { data: holeScores(H18) },
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

  it('el índice del tope es el registrado en el torneo (el del día), no el del perfil de hoy', async () => {
    const sb = fake(tablas({
      players: { data: { user_id: 'u1', handicap_at_registration: 14 } },
      profiles: { data: { indice: 10, indice_golfers: null } },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    // CH = 14 × 128/113 + (71.3 − 72) = 15.2 → 15 (con el 10 del perfil: 10.6 → 11)
    const meta = sb.insertados[0].metadata as { ajuste_whs: { course_hcp: number; indice: number } }
    expect(meta.ajuste_whs).toMatchObject({ indice: 14, course_hcp: 15 })
    expect(sb.lecturas.find(l => l.tabla === 'players')?.select).toContain('handicap_at_registration')
  })

  it('torneo raw/legacy: handicap_at_registration es un course handicap, NO un índice → el del perfil', async () => {
    for (const modo of ['raw', null]) {
      const sb = fake(tablas({
        tournaments: { data: torneo({ hcp_calc_mode: modo }) },
        players: { data: { user_id: 'u1', handicap_at_registration: 15 } },
        profiles: { data: { indice: 10, indice_golfers: null } },
      }))
      await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
      const meta = sb.insertados[0].metadata as { ajuste_whs: { course_hcp: number; indice: number } }
      expect(meta.ajuste_whs).toMatchObject({ indice: 10, course_hcp: 11 })
      expect(sb.lecturas.find(l => l.tabla === 'tournaments')?.select).toContain('hcp_calc_mode')
    }
  })

  it('sin índice registrado en el torneo: el del perfil', async () => {
    const sb = fake(tablas({
      players: { data: { user_id: 'u1', handicap_at_registration: null } },
      profiles: { data: { indice: 10, indice_golfers: null } },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    const meta = sb.insertados[0].metadata as { ajuste_whs: { course_hcp: number; indice: number } }
    expect(meta.ajuste_whs).toMatchObject({ indice: 10, course_hcp: 11 })
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

  it('torneo de 18 jugado sólo el front 9: score de 9 con diferencial', async () => {
    const sb = fake(tablas({
      rounds: { data: { player_id: 'p1', round_number: 1, total_gross: 50, tournament_id: 't1' } },
      hole_scores: { data: holeScores(H18.slice(0, 9)) },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0].holes_played).toBe(9)
    expect(sb.insertados[0].diferencial).not.toBeNull()
  })

  it('9 hoyos sueltos de las dos mitades (1-5 y 10-13): no son un score de 9, sin diferencial', async () => {
    const sb = fake(tablas({
      rounds: { data: { player_id: 'p1', round_number: 1, total_gross: 44, tournament_id: 't1' } },
      hole_scores: { data: holeScores([1, 2, 3, 4, 5, 10, 11, 12, 13]) },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0].holes_played).toBe(9)
    expect(sb.insertados[0].diferencial).toBeNull()
  })

  it('torneo que no afecta estadísticas: no inserta', async () => {
    const sb = fake(tablas({ tournaments: { data: torneo({ afecta_estadisticas: false }) } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados).toHaveLength(0)
  })
})

// "Azul" con dos filas (varones primero, damas después), como queda la lista de tees cuando la fila
// DAMAS llega por la variante de género: `resolvePlayerTee` elige por género entre las dos.
const tee = (id: string, nombre: string, genero: string, rating: number, slope: number, extra: Record<string, unknown> = {}) =>
  ({ id, nombre, genero, rating, slope, yardaje_total: null, ...extra })
const CANCHA_CON_TEES = {
  ...CANCHA,
  course_tees: [tee('az-m', 'azul', 'M', 71.3, 128), tee('az-f', 'azul', 'F', 74.1, 133), tee('bl-m', 'blanco', 'M', 69.8, 124)],
}
const conTees = (extra: Record<string, unknown> = {}) => ({ data: torneo({ courses: CANCHA_CON_TEES, ...extra }) })

describe('guardarRondaDeTorneoEnHistorial — CR/slope del tee del jugador (#525)', () => {
  it('una dama en un torneo de tee "azul" usa el azul de DAMAS, no la primera fila "azul" (varones)', async () => {
    const sb = fake(tablas({ tournaments: conTees(), players: { data: { user_id: 'u1', genero: 'F' } } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    const fila = sb.insertados[0]
    expect(fila).toMatchObject({ course_rating: 74.1, slope_rating: 133 })
    expect(fila.diferencial).toBe(parseFloat((((fila.adjusted_gross as number) - 74.1) * 113 / 133).toFixed(2)))
  })

  it('la categoría Damas basta para saber el género', async () => {
    const sb = fake(tablas({
      tournaments: conTees(),
      players: { data: { user_id: 'u1', genero: null, categories: { default_tee_color: null, gender: 'F' } } },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0]).toMatchObject({ course_rating: 74.1, slope_rating: 133 })
  })

  it('el tee asignado al jugador gana sobre el del torneo', async () => {
    const sb = fake(tablas({ tournaments: conTees(), players: { data: { user_id: 'u1', genero: 'M', tee_id: 'bl-m' } } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0]).toMatchObject({ course_rating: 69.8, slope_rating: 124 })
    expect(sb.lecturas.find(l => l.tabla === 'players')?.select).toContain('tee_id')
  })

  it('el tee de la categoría gana sobre el del torneo', async () => {
    const sb = fake(tablas({
      tournaments: conTees(),
      players: { data: { user_id: 'u1', genero: 'M', categories: { default_tee_color: 'blanco', gender: null } } },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0]).toMatchObject({ course_rating: 69.8, slope_rating: 124 })
  })

  it('un tee sin rating no se mezcla con el slope de la cancha: usa el par CR/slope de la cancha entero', async () => {
    const sinRating = { ...CANCHA_CON_TEES, course_tees: [{ ...tee('az-m', 'azul', 'M', 0, 140), rating: null }] }
    const sb = fake(tablas({ tournaments: { data: torneo({ courses: sinRating }) } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0]).toMatchObject({ course_rating: 71.3, slope_rating: 128 })
  })

  it('sin género conocido y dos "azul": gana la primera fila (la del torneo)', async () => {
    const sb = fake(tablas({ tournaments: conTees(), players: { data: { user_id: 'u1' } } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0]).toMatchObject({ course_rating: 71.3, slope_rating: 128 })
  })

  it('9 hoyos: el diferencial usa el CR/slope de 9 publicado del tee (el mismo del board), no CR/2', async () => {
    const conFront = { ...CANCHA, course_tees: [tee('az-m', 'azul', 'M', 71.3, 128, { front_course_rating: 35.9, front_slope_rating: 127 })] }
    const sb = fake(tablas({
      tournaments: { data: torneo({ hole_count: 9, courses: conFront }) },
      rounds: { data: { player_id: 'p1', round_number: 1, total_gross: 50, tournament_id: 't1' } },
      hole_scores: { data: holeScores(H18.slice(0, 9)) },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    const fila = sb.insertados[0]
    // La fila guarda lo publicado del tee; el diferencial, el de 9: (ajustado − 35.9) × 113 / 127, en escala de 18.
    expect(fila).toMatchObject({ course_rating: 71.3, slope_rating: 128 })
    const ajustado = fila.adjusted_gross as number
    expect(fila.diferencial).toBe(parseFloat((((ajustado - 35.9) * 113 / 127) * 2).toFixed(2)))
    // Los de 9 quedan en la fila: un recálculo posterior (corregir un hoyo, backfill) no parte el CR al medio.
    expect(fila.metadata).toMatchObject({ ratings_9h: { cr9h: 35.9, slope9h: 127 } })
  })

  it('cancha de 9 hoyos con el rating ya en escala de 9: no se parte al medio', async () => {
    // Par 36 de 9 hoyos reales, rating 35.2 (de 9). Con CR/2 sería 17.6 y el diferencial saldría ~+40.
    const nueveHoyos = { ...CANCHA, par_total: 36, course_rating: 35.2, slope_rating: 120 }
    const sb = fake(tablas({
      tournaments: { data: torneo({ hole_count: 9, courses: nueveHoyos }) },
      rounds: { data: { player_id: 'p1', round_number: 1, total_gross: 50, tournament_id: 't1' } },
      hole_scores: { data: holeScores(H18.slice(0, 9)) },
      course_holes: { data: CATALOGO.slice(0, 9) },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    const fila = sb.insertados[0]
    const ajustado = fila.adjusted_gross as number
    expect(fila.diferencial).toBe(parseFloat((((ajustado - 35.2) * 113 / 120) * 2).toFixed(2)))
    expect(fila.metadata).toMatchObject({ ratings_9h: { cr9h: 35.2, slope9h: 120 } })
  })

  it('cancha de 9 hoyos jugada a 18: la fila y el diferencial usan el CR de las DOS vueltas', async () => {
    // Par 36 por vuelta, tee 37.0/126 (de 9). 18 hoyos = dos vueltas → CR 74. Con el de una vuelta
    // contra 18 hoyos el diferencial saldría ~+40 y el tope WHS se derrumbaría.
    const nueveHoyos = { ...CANCHA, par_total: 36, course_rating: 37.0, slope_rating: 126, course_tees: [tee('az-m', 'azul', 'M', 37.0, 126)] }
    const sb = fake(tablas({
      tournaments: { data: torneo({ courses: nueveHoyos }) },
      course_holes: { data: CATALOGO.slice(0, 9) },
    }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    const fila = sb.insertados[0]
    expect(fila).toMatchObject({ course_rating: 74, slope_rating: 126 })
    expect((fila.metadata as Record<string, unknown>).ratings_9h).toBeUndefined()
    const ajustado = fila.adjusted_gross as number
    expect(ajustado).toBeGreaterThan(80)
    expect(fila.diferencial).toBe(parseFloat(((ajustado - 74) * 113 / 126).toFixed(2)))
  })

  it('tee con rating imposible (55 en par 72): el guardarrail cae al rating de la cancha', async () => {
    const teeRoto = { ...CANCHA, course_tees: [tee('az-m', 'azul', 'M', 55, 120)] }
    const sb = fake(tablas({ tournaments: { data: torneo({ courses: teeRoto }) } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0]).toMatchObject({ course_rating: 71.3, slope_rating: 128, diferencial: dif(92) })
  })

  it('sin ratings creíbles (ni tee ni cancha): inserta la tarjeta sin diferencial y no lanza', async () => {
    const sinRatings = { ...CANCHA, slope_rating: null, course_rating: null }
    const sb = fake(tablas({ tournaments: { data: torneo({ courses: sinRatings }) } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0]).toMatchObject({ diferencial: null, course_rating: null, slope_rating: null })
  })

  it('formato legado: sin formato_juego, el de `format` (scramble viejo → bola compartida, sin diferencial)', async () => {
    const sb = fake(tablas({ tournaments: { data: torneo({ formato_juego: null, format: 'scramble' }) } }))
    await guardarRondaDeTorneoEnHistorial(sb as never, 'r1')
    expect(sb.insertados[0]).toMatchObject({ formato_juego: 'scramble', diferencial: null })
  })

  it('si falla la lectura del torneo o del jugador, lanza en vez de perder la tarjeta en silencio', async () => {
    const caida = { code: '57014', message: 'canceling statement due to statement timeout' }
    for (const t of ['tournaments', 'players']) {
      const sb = fake(tablas({ [t]: { data: null, error: caida } }))
      await expect(guardarRondaDeTorneoEnHistorial(sb as never, 'r1')).rejects.toBe(caida)
      expect(sb.insertados).toHaveLength(0)
    }
  })
})

describe('tarjetaDeTorneo', () => {
  it('posiciones 1..N, null en hoyos sin score, par sólo donde está cargado', () => {
    const t = tarjetaDeTorneo([{ hole_number: 1, gross_score: 5, par: 4 }, { hole_number: 3, gross_score: 3, par: null }], 4)
    expect(t).toEqual({ scores: [5, null, 3, null], parPerHole: { '1': 4 }, hoyos: [1, 2, 3, 4], jugados: 2, totalGross: 8 })
  })
})
