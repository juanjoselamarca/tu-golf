// Corrección del hándicap inscrito con el torneo iniciado (plan 2026-11-16, pieza C):
// el plan escribe lo MISMO que el inicio, y el bucle de escritura reintenta solo lo que debe.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LegacyHcpContext } from '@/golf/leaderboard/types'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

const ctxWhs: LegacyHcpContext = {
  mode: 'whs',
  tees: 'Blancas',
  course: { par_total: 71, slope_rating: 125, course_rating: 71 },
  courseTees: [{ id: 't1', nombre: 'Blancas', rating: 71, slope: 125, yardaje_total: 6200 }],
  hcpPct: 100,
}
vi.mock('./leaderboard', () => ({
  fetchCourseHoles: async () => [],
  fetchLegacyHcpContext: async () => ctxWhs,
}))

import {
  editarHandicapInscrito,
  planDeEdicion,
  type LecturaDeEdicion,
  type TorneoParaEditar,
} from './editarHandicapInscrito'
import { handicapsDeEquipoDelGrupo } from './teamRounds'
import { filaDeHandicapDeTorneo } from '@/golf/ronda-libre/handicap-tarjeta-de-torneo'
import type { StartPlayer } from './startTournament'

const jugador = (id: string, hcp: number | null, user_id: string | null = 'u-' + id): StartPlayer => ({
  id,
  user_id,
  player_name: id,
  status: 'approved',
  handicap_at_registration: hcp,
  tee_id: null,
  profiles: user_id ? { name: id, indice: 9.9 } : null,
})

const torneoDe = (formato_juego: string, hcp_calc_mode: string | null = 'whs'): TorneoParaEditar => ({
  id: 'T',
  organizer_id: 'org',
  status: 'in_progress',
  format: null,
  formato_juego,
  modo_juego: null,
  tees: 'Blancas',
  course_name: null,
  course_id: null,
  hole_count: 18,
  date_start: null,
  total_rounds: 1,
  team_config: null,
  hcp_calc_mode,
  courses: null,
})

const contexto = { hcp: { ctx: ctxWhs, parTotal: 71, parDe18Hoyos: 71 }, holeCount: 18 }

describe('planDeEdicion — tarjeta', () => {
  it('WHS individual con tarjeta: la fila lleva el valor nuevo (misma regla que el inicio)', () => {
    const lectura: LecturaDeEdicion = { editado: jugador('a', null), jugadorRondaId: 'jr-a', equipo: null }
    const plan = planDeEdicion({ torneo: torneoDe('stroke_play'), lectura, esperado: null, valor: 12.3, contexto: null })
    expect(plan).toEqual({
      p_player_id: 'a', p_esperado: null, p_valor: 12.3,
      p_tocar_tarjeta: true, p_handicap_tarjeta: 12.3, p_base: [], p_equipos: [],
    })
  })

  it('sin tarjeta enlazada (torneo sin iniciar): solo players', () => {
    const lectura: LecturaDeEdicion = { editado: jugador('a', 5), jugadorRondaId: null, equipo: null }
    const plan = planDeEdicion({ torneo: torneoDe('stroke_play'), lectura, esperado: 5, valor: 6, contexto: null })
    expect(plan).toMatchObject({ p_tocar_tarjeta: false, p_handicap_tarjeta: null, p_equipos: [] })
  })

  // Riesgo 3 del plan: en raw lo inscrito es un course handicap y la tarjeta de un individual con
  // cuenta toma el índice del perfil (`filaDeHandicapDeTorneo` → {}): la corrección no la toca.
  it('raw individual con cuenta: NO toca la tarjeta (filaDeHandicapDeTorneo devuelve {})', () => {
    const editado = jugador('a', 14)
    expect(filaDeHandicapDeTorneo(editado, 'raw', false)).toEqual({})
    const plan = planDeEdicion({
      torneo: torneoDe('stroke_play', 'raw'),
      lectura: { editado, jugadorRondaId: 'jr-a', equipo: null },
      esperado: 14, valor: 16, contexto: null,
    })
    expect(plan).toMatchObject({ p_tocar_tarjeta: false, p_handicap_tarjeta: null, p_valor: 16 })
  })

  it('raw invitado (sin cuenta): la tarjeta lleva lo inscrito, igual que al iniciar', () => {
    const plan = planDeEdicion({
      torneo: torneoDe('stroke_play', 'raw'),
      lectura: { editado: jugador('g', 20, null), jugadorRondaId: 'jr-g', equipo: null },
      esperado: 20, valor: 22, contexto: null,
    })
    expect(plan).toMatchObject({ p_tocar_tarjeta: true, p_handicap_tarjeta: 22 })
  })
})

describe('planDeEdicion — equipo', () => {
  const miembros = [jugador('a', null), jugador('b', 20)]
  const lectura: LecturaDeEdicion = { editado: miembros[0], jugadorRondaId: 'jr-a', equipo: { id: 'E', miembros } }

  it('scramble WHS: recalcula el equipo con handicapsDeEquipoDelGrupo, igual que si se hubiera inscrito con el valor', () => {
    const plan = planDeEdicion({ torneo: torneoDe('scramble'), lectura, esperado: null, valor: 10, contexto })
    const alIniciar = handicapsDeEquipoDelGrupo({
      formato: 'scramble', members: [jugador('a', 10), jugador('b', 20)], handicap: null,
      ctx: ctxWhs, parTotal: 71, holeCount: 18, parDe18Hoyos: 71,
    })
    expect(alIniciar).toEqual({ completo: 7, juego: 7 })
    expect(plan).toMatchObject({
      p_tocar_tarjeta: true,
      p_handicap_tarjeta: 10,
      p_base: [{ player_id: 'b', esperado: 20 }],
      p_equipos: [{ equipo_id: 'E', handicap_equipo: 7, handicap_equipo_juego: 7 }],
    })
  })

  it('best ball: el equipo no tiene hándicap propio, no se reescribe', () => {
    const plan = planDeEdicion({ torneo: torneoDe('best_ball'), lectura, esperado: null, valor: 10, contexto: null })
    expect(plan).toMatchObject({ p_base: [], p_equipos: [] })
  })

  it('bola compartida sin contexto: error, no un equipo con 0 golpes', () => {
    expect(planDeEdicion({ torneo: torneoDe('foursome'), lectura, esperado: null, valor: 10, contexto: null }))
      .toEqual({ error: 'equipo-sin-contexto' })
  })
})

// ── Bucle de escritura con una base en memoria ────────────────────────────────────────────────
type Fila = Record<string, unknown>
interface Db {
  players: Fila[]
  tournament_group_players: Fila[]
  ronda_equipo_jugadores: Fila[]
}
let db: Db
let rpcRespuestas: Array<{ ok: boolean; motivo?: string }>
let rpcLlamadas: Array<Record<string, unknown>>
let alEscribir: (() => void) | null

function query(tabla: keyof Db) {
  let filas = [...db[tabla]]
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filas = filas.filter((f) => f[c] === v); return q },
    not: (c: string) => { filas = filas.filter((f) => f[c] != null); return q },
    in: (c: string, vs: unknown[]) => { filas = filas.filter((f) => vs.includes(f[c])); return q },
    order: (c: string) => { filas = [...filas].sort((a, b) => Number(a[c]) - Number(b[c])); return q },
    maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
    then: (r: (v: { data: Fila[]; error: null }) => unknown) => r({ data: filas, error: null }),
  }
  return q
}
const svc = {
  from: (t: keyof Db) => query(t),
  rpc: async (_n: string, args: Record<string, unknown>) => {
    rpcLlamadas.push(args)
    const r = rpcRespuestas.shift() ?? { ok: true }
    if (r.ok) {
      const p = db.players.find((x) => x.id === args.p_player_id)!
      p.handicap_at_registration = args.p_valor
      alEscribir?.()
      alEscribir = null
    }
    return { data: r, error: null }
  },
} as unknown as SupabaseClient

beforeEach(() => {
  db = {
    players: [{ ...jugador('a', 5), tournament_id: 'T' }],
    tournament_group_players: [{ player_id: 'a', jugador_ronda_id: 'jr-a' }],
    ronda_equipo_jugadores: [],
  }
  rpcRespuestas = []
  rpcLlamadas = []
  alEscribir = null
})

describe('editarHandicapInscrito', () => {
  it('camino feliz: una escritura y una relectura de verificación', async () => {
    expect(await editarHandicapInscrito(svc, torneoDe('stroke_play'), 'a', 5, 7)).toEqual({ ok: true, valor: 7 })
    expect(rpcLlamadas).toHaveLength(1)
    expect(rpcLlamadas[0]).toMatchObject({ p_esperado: 5, p_valor: 7, p_tocar_tarjeta: true, p_handicap_tarjeta: 7 })
  })

  it('el editado ya no tiene el valor que vio el organizador: conflicto sin escribir', async () => {
    expect(await editarHandicapInscrito(svc, torneoDe('stroke_play'), 'a', 4, 7)).toEqual({ ok: false, motivo: 'conflicto' })
    expect(rpcLlamadas).toHaveLength(0)
  })

  it('la RPC pierde la carrera una vez: relee y reintenta', async () => {
    rpcRespuestas = [{ ok: false, motivo: 'conflicto' }]
    expect(await editarHandicapInscrito(svc, torneoDe('stroke_play'), 'a', 5, 7)).toEqual({ ok: true, valor: 7 })
    expect(rpcLlamadas).toHaveLength(2)
  })

  it('conflicto 3 veces seguidas: se rinde con conflicto (409)', async () => {
    rpcRespuestas = [{ ok: false, motivo: 'conflicto' }, { ok: false, motivo: 'conflicto' }, { ok: false, motivo: 'conflicto' }]
    expect(await editarHandicapInscrito(svc, torneoDe('stroke_play'), 'a', 5, 7)).toEqual({ ok: false, motivo: 'conflicto' })
    expect(rpcLlamadas).toHaveLength(3)
  })

  it('jugador de otro torneo o inexistente: no-existe', async () => {
    expect(await editarHandicapInscrito(svc, torneoDe('stroke_play'), 'zzz', 5, 7)).toEqual({ ok: false, motivo: 'no-existe' })
  })

  it('un inicio enlaza la tarjeta entre la lectura y la escritura: se replanifica y la tarjeta queda con el valor', async () => {
    db.tournament_group_players = [{ player_id: 'a', jugador_ronda_id: null }]
    alEscribir = () => { db.tournament_group_players = [{ player_id: 'a', jugador_ronda_id: 'jr-a' }] }
    expect(await editarHandicapInscrito(svc, torneoDe('stroke_play'), 'a', 5, 7)).toEqual({ ok: true, valor: 7 })
    expect(rpcLlamadas).toHaveLength(2)
    expect(rpcLlamadas[0]).toMatchObject({ p_tocar_tarjeta: false })
    expect(rpcLlamadas[1]).toMatchObject({ p_esperado: 7, p_valor: 7, p_tocar_tarjeta: true, p_handicap_tarjeta: 7 })
  })

  it('scramble: lee los miembros materializados en su orden y reescribe el equipo', async () => {
    db.players.push({ ...jugador('b', 20), tournament_id: 'T' })
    db.tournament_group_players.push({ player_id: 'b', jugador_ronda_id: 'jr-b' })
    db.ronda_equipo_jugadores = [
      { equipo_id: 'E', jugador_id: 'jr-b', orden: 1 },
      { equipo_id: 'E', jugador_id: 'jr-a', orden: 0 },
    ]
    expect(await editarHandicapInscrito(svc, torneoDe('scramble'), 'a', 5, 10)).toEqual({ ok: true, valor: 10 })
    expect(rpcLlamadas[0]).toMatchObject({
      p_base: [{ player_id: 'b', esperado: 20 }],
      p_equipos: [{ equipo_id: 'E', handicap_equipo: 7, handicap_equipo_juego: 7 }],
    })
  })
})
