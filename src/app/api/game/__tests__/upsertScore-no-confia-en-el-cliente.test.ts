// @vitest-environment node
//
// El servidor NO persiste el neto, los puntos ni el par que calcula el cliente.
//
// Los dos scorers (organizador y jugador) mandaban `net_score`, `points` y `par`
// en el POST de cada golpe y `upsertScore` los guardaba tal cual. Con la anon
// key, su propio JWT y un `fetch` a mano, el jugador de un torneo escribía el
// neto que quisiera sobre SU tarjeta (la autorización la pasa: es su ronda), y
// las pantallas que leen la columna (admin, GWI del torneo, resumen del scorer)
// y las estadísticas se comían el número inventado.
//
// Sin el arreglo, cada `it` de "no confía" falla: el row guardado trae el
// -50/99/5 del cliente en vez del derivado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

const fetchLegacyHcpContext = vi.fn()
vi.mock('@/lib/data/tournaments/leaderboard', () => ({
  fetchLegacyHcpContext: (...a: unknown[]) => fetchLegacyHcpContext(...a),
}))

const fetchRoundPlayConfig = vi.fn()
vi.mock('@/lib/data/tournaments/rounds', () => ({
  fetchRoundPlayConfig: (...a: unknown[]) => fetchRoundPlayConfig(...a),
}))

import { upsertScore } from '../actions'

const ROUND = '6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b'
const PLAYER = '11111111-2222-4333-8444-555555555555'
const TOURN = '22222222-3333-4444-8555-666666666666'
const COURSE = '33333333-4444-4555-8666-777777777777'
const HOLE_SCORE = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d'
const USER = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'

/** 18 hoyos par 4, stroke_index = número de hoyo (permutación 1..18). */
const CATALOGO = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

let upserted: Record<string, unknown> | null
/** Si está puesto, la lectura de `tournaments` revienta (derivación caída). */
let tournamentsRevienta: Error | null
/** `tournaments.formato_juego` del torneo del mock. */
let formatoJuego: string | null
/** `tournaments.modo_juego` del torneo del mock (sólo 'neto' reparte golpes). */
let modoJuego: string | null

function svc() {
  return {
    from: (table: string) => {
      if (table === 'rounds') {
        return {
          select: (cols: string) => ({
            eq: () => ({
              single: () =>
                Promise.resolve(
                  cols.includes('players(')
                    ? {
                        data: {
                          player_id: PLAYER,
                          round_number: 1,
                          players: {
                            handicap_at_registration: 18,
                            tee_id: null,
                            tournament_id: TOURN,
                            genero: null,
                            categories: null,
                          },
                        },
                        error: null,
                      }
                    : { data: { status: 'in_progress' }, error: null },
                ),
            }),
          }),
          // El recálculo de totales al final.
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        }
      }
      if (table === 'tournaments') {
        return {
          select: () => ({
            eq: () => ({
              single: () => {
                if (tournamentsRevienta) return Promise.reject(tournamentsRevienta)
                return Promise.resolve({
                  data: {
                    id: TOURN,
                    hole_count: 18,
                    formato_juego: formatoJuego,
                    format: null,
                    modo_juego: modoJuego,
                    course_id: COURSE,
                    date_start: null,
                    total_rounds: 1,
                  },
                  error: null,
                })
              },
            }),
          }),
        }
      }
      if (table === 'course_holes') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => Promise.resolve({ data: CATALOGO, error: null }),
            }),
          }),
        }
      }
      if (table === 'hole_scores') {
        return {
          upsert: (row: Record<string, unknown>) => {
            upserted = row
            return {
              select: () => ({ single: () => Promise.resolve({ data: { id: HOLE_SCORE }, error: null }) }),
            }
          },
          select: () => ({
            eq: () => ({
              not: () => Promise.resolve({ data: [{ gross_score: 5, net_score: 4, points: 3 }], error: null }),
            }),
          }),
        }
      }
      if (table === 'score_audit_log') return { insert: () => Promise.resolve({ data: null, error: null }) }
      throw new Error(`tabla inesperada: ${table}`)
    },
  }
}

/** Golpe real: 5 en el hoyo 1, par 4. El cliente miente en neto, puntos y par. */
const golpeConMentira = {
  round_id: ROUND,
  hole_number: 1,
  par: 5, // el catálogo dice 4
  gross_score: 5,
  net_score: -50,
  points: 99,
}

beforeEach(() => {
  vi.clearAllMocks()
  upserted = null
  tournamentsRevienta = null
  formatoJuego = null
  modoJuego = null
  fetchRoundPlayConfig.mockResolvedValue({ roundNumber: 1, courseId: COURSE, holeCount: 18 })
  fetchLegacyHcpContext.mockResolvedValue({
    mode: null, // legacy: el course handicap es handicap_at_registration tal cual
    tees: null,
    course: null,
    courseTees: [],
    hcpPct: 100,
  })
})

describe('upsertScore · el neto y los puntos los firma el servidor', () => {
  it('ignora el net_score y los points que manda el cliente y guarda los derivados', async () => {
    const res = await upsertScore(svc() as never, USER, golpeConMentira)
    expect(res.status).toBe(200)
    // hcp 18 sobre 18 hoyos = 1 golpe en el SI 1 → neto 5 − 1 = 4. Los puntos
    // quedan en 0 porque el torneo no es stableford (`puntajeDeHoyo`).
    expect(upserted).toMatchObject({ gross_score: 5, net_score: 4, points: 0 })
    expect(upserted!.net_score).not.toBe(-50)
    expect(upserted!.points).not.toBe(99)
  })

  it('en un stableford GROSS los puntos se derivan contra el par, sin golpes', async () => {
    formatoJuego = 'stableford'
    const res = await upsertScore(svc() as never, USER, golpeConMentira)
    expect(res.status).toBe(200)
    // `modo_juego` null = gross (`handicapQueJuega`): 5 en un par 4 es bogey = 1 punto.
    // El neto de la columna sigue con el course handicap completo.
    expect(upserted).toMatchObject({ net_score: 4, points: 1 })
    expect(upserted!.points).not.toBe(99)
  })

  it('en un stableford NETO los puntos se derivan con los golpes del jugador', async () => {
    formatoJuego = 'stableford'
    modoJuego = 'neto'
    const res = await upsertScore(svc() as never, USER, golpeConMentira)
    expect(res.status).toBe(200)
    // Con su golpe en el SI 1: neto 4 en un par 4 = par neto = 2 puntos.
    expect(upserted).toMatchObject({ net_score: 4, points: 2 })
    expect(upserted!.points).not.toBe(99)
  })

  it('el par sale del catálogo de la cancha, no del body', async () => {
    await upsertScore(svc() as never, USER, golpeConMentira)
    expect(upserted!.par).toBe(4)
  })

  it('si la derivación se cae, el golpe se guarda con neto y puntos en NULL — nunca con los del cliente', async () => {
    tournamentsRevienta = new TypeError('fetch failed')
    const res = await upsertScore(svc() as never, USER, golpeConMentira)
    // Sin 503: en un torneo real no se pierde un golpe por un fallo transitorio.
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, derivado: false })
    expect(upserted).toMatchObject({ gross_score: 5, net_score: null, points: null })
    expect(captureError).toHaveBeenCalledWith(
      tournamentsRevienta,
      expect.objectContaining({ context: 'game-engine.upsertScore.derivarNeto' }),
    )
  })

  it('borrar el golpe (gross null) deja neto y puntos en NULL sin derivar nada', async () => {
    await upsertScore(svc() as never, USER, { ...golpeConMentira, gross_score: null })
    expect(upserted).toMatchObject({ gross_score: null, net_score: null, points: null })
  })

  it('un save de putts (sin par en el body) no borra el par guardado del hoyo', async () => {
    const { par: _par, ...sinPar } = golpeConMentira
    await upsertScore(svc() as never, USER, { ...sinPar, putts: 2 })
    // Con catálogo, el par se completa; lo que no puede pasar es escribir null.
    expect(upserted!.par).toBe(4)
    expect(upserted!.putts).toBe(2)
  })
})

describe('upsertScore · validación de las estadísticas del hoyo', () => {
  const casos: Array<[string, Record<string, unknown>, string]> = [
    ['putts fuera de rango', { putts: 99 }, 'Los putts deben ser un entero entre 0 y 19'],
    ['putts negativos', { putts: -1 }, 'Los putts deben ser un entero entre 0 y 19'],
    ['putts no entero', { putts: 2.5 }, 'Los putts deben ser un entero entre 0 y 19'],
    ['putts que no es número', { putts: '2' }, 'Los putts deben ser un entero entre 0 y 19'],
    ['fairway_hit que no es booleano', { fairway_hit: 'si' }, 'fairway_hit debe ser booleano'],
    ['gir que no es booleano', { gir: 1 }, 'gir debe ser booleano'],
  ]

  for (const [nombre, extra, mensaje] of casos) {
    it(`rechaza ${nombre} con 400 y no escribe`, async () => {
      const res = await upsertScore(svc() as never, USER, { ...golpeConMentira, ...extra })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: mensaje })
      expect(upserted).toBeNull()
    })
  }

  it('acepta los valores legítimos (0 putts, fairway/GIR booleanos)', async () => {
    const res = await upsertScore(svc() as never, USER, {
      ...golpeConMentira,
      putts: 0,
      fairway_hit: false,
      gir: true,
    })
    expect(res.status).toBe(200)
    expect(upserted).toMatchObject({ putts: 0, fairway_hit: false, gir: true })
  })
})
