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

/** Cancha de 9 hoyos: lo que trae el catálogo cuando la vuelta se juega a 18. */
const CATALOGO_9 = CATALOGO.slice(0, 9)

let upserted: Record<string, unknown> | null
/** Si está puesto, la lectura de `tournaments` revienta (derivación caída). */
let tournamentsRevienta: Error | null
/** Las filas que devuelve `course_holes` (9 ó 18). */
let catalogo: typeof CATALOGO
/** `players.handicap_at_registration` del jugador del mock. */
let handicapInscrito: number | null
/** Si está puesto, la 2ª lectura de `rounds` devuelve ese error. */
let rondaRevienta: { code: string; message: string } | null
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
                    ? rondaRevienta
                      ? { data: null, error: rondaRevienta }
                      : {
                        data: {
                          player_id: PLAYER,
                          round_number: 1,
                          players: {
                            handicap_at_registration: handicapInscrito,
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
              lte: () => Promise.resolve({ data: catalogo, error: null }),
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
  catalogo = CATALOGO
  handicapInscrito = 18
  rondaRevienta = null
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

  it('un inscrito SIN índice recibe 0 golpes, no los 18 del default viejo', async () => {
    // `handicapInscrito` (fuente única, `?? 0`) es lo que usan los dos scorers:
    // sin índice el neto es el bruto. Un `?? 18` acá le regalaba un golpe por
    // hoyo justo en la columna que el servidor ahora firma.
    handicapInscrito = null
    formatoJuego = 'stableford'
    modoJuego = 'neto'
    await upsertScore(svc() as never, USER, golpeConMentira)
    expect(upserted).toMatchObject({ gross_score: 5, net_score: 5, points: 1 })
  })

  it('cancha de 9 hoyos jugada a 18: el SI se aloca sobre los hoyos de la VUELTA', async () => {
    // El catálogo trae 9 filas. Alocando sobre el crudo, el SI de los hoyos
    // 10..18 no existe y cae a `hole_number`: con hcp 9 el hoyo 10 (SI 10 crudo)
    // se quedaba sin golpe, cuando en la vuelta expandida le toca uno.
    catalogo = CATALOGO_9
    handicapInscrito = 9
    const res = await upsertScore(svc() as never, USER, { ...golpeConMentira, hole_number: 10 })
    expect(res.status).toBe(200)
    expect(upserted).toMatchObject({ gross_score: 5, net_score: 4, par: 4 })
  })

  it('si la derivación se cae, el neto guardado NO se toca ni se cae al del cliente', async () => {
    tournamentsRevienta = new TypeError('fetch failed')
    const res = await upsertScore(svc() as never, USER, golpeConMentira)
    // Sin 503: en un torneo real no se pierde un golpe por un fallo transitorio.
    expect(res.status).toBe(200)
    // Ni el -50 del cliente ni un null que borraría el neto bueno del hoyo en el
    // ON CONFLICT: las dos columnas quedan FUERA del payload.
    expect(upserted).toMatchObject({ gross_score: 5 })
    expect(upserted).not.toHaveProperty('net_score')
    expect(upserted).not.toHaveProperty('points')
    // El par del body sí sobrevive acá, y es a propósito: sin derivación no hay
    // puntos que inflar, y `hole_scores.par` es NOT NULL sin default — omitirlo
    // haría fallar el upsert que inserta la fila por primera vez.
    expect(upserted!.par).toBe(5)
    expect(captureError).toHaveBeenCalledWith(
      tournamentsRevienta,
      expect.objectContaining({ context: 'game-engine.upsertScore.derivarNeto' }),
    )
  })

  it('un error de la lectura de la ronda se reporta, no se traga en silencio', async () => {
    rondaRevienta = { code: '57014', message: 'canceling statement due to statement timeout' }
    await upsertScore(svc() as never, USER, golpeConMentira)
    expect(upserted).not.toHaveProperty('net_score')
    expect(captureError).toHaveBeenCalledWith(
      rondaRevienta,
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
