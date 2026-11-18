// Gestión con el torneo en juego (#814 · PR3): la capa de datos planifica con `motivoParaNoColocar`, arma los
// argumentos EXACTOS de la RPC `colocar_inscrito_en_grupo` (huella de `p_esperado`, política del servidor, hándicap
// de equipo con los que compiten) y reintenta solo lo que debe. La RPC va mockeada.
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

import { colocarInscrito, prechequearAltaConGrupo, MAX_REINTENTOS_COLOCAR, type ArgumentosDeColocar } from './colocarInscrito'
import type { TorneoParaEditar } from './editarHandicapInscrito'
import { handicapsDeEquipoDelGrupo } from './teamRounds'
import { MENSAJE_MOTIVO_DESCONOCIDO, mensajeDeMotivo } from '@/golf/torneo/gestion-en-juego'

// ── Base en memoria ──────────────────────────────────────────────────────────────────────────────────────────
type Fila = Record<string, unknown>
interface Db {
  players: Fila[]
  tournament_groups: Fila[]
  tournament_group_players: Fila[]
  rondas_libres: Fila[]
  rounds: Fila[]
}
let db: Db
let rpcRespuestas: Array<Record<string, unknown> | 'error'>
let rpcLlamadas: ArgumentosDeColocar[]

function query(tabla: keyof Db) {
  let filas = [...db[tabla]]
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filas = filas.filter((f) => f[c] === v); return q },
    in: (c: string, vs: unknown[]) => { filas = filas.filter((f) => vs.includes(f[c])); return q },
    maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
    then: (r: (v: { data: Fila[]; error: null }) => unknown) => r({ data: filas, error: null }),
  }
  return q
}
const svc = {
  from: (t: keyof Db) => query(t),
  rpc: async (_n: string, args: ArgumentosDeColocar) => {
    rpcLlamadas.push(args)
    const r = rpcRespuestas.shift() ?? { ok: true, operacion: 'mover', aprobado: false, jugador_ronda_id: 'jr' }
    if (r === 'error') return { data: null, error: { message: 'colocar_inscrito_en_grupo: p_esperado mal formado' } }
    return { data: r, error: null }
  },
} as unknown as SupabaseClient

const torneoDe = (formato_juego: string, extra: Partial<TorneoParaEditar> = {}): TorneoParaEditar => ({
  id: 'T', organizer_id: 'org', status: 'in_progress', format: null, formato_juego, modo_juego: null,
  tees: 'Blancas', course_name: null, course_id: null, hole_count: 18, date_start: null, total_rounds: 1,
  team_config: null, hcp_calc_mode: 'whs', courses: null, ...extra,
})

const jugador = (id: string, hcp: number | null, status = 'approved', extra: Fila = {}): Fila => ({
  id, tournament_id: 'T', user_id: 'u-' + id, player_name: id, status, handicap_at_registration: hcp,
  tee_id: null, genero: null, category_id: null, profiles: { name: id.toUpperCase(), indice: 9.9 }, categories: null, ...extra,
})

/** Un grupo con tarjeta en curso. `filas`: player_id → scores de su fila (sin entrada = sin fila). */
function grupo(id: string, filas: Record<string, Fila>, equipo: Fila | null = null, estado = 'en_curso') {
  const rl = 'rl-' + id
  db.tournament_groups.push({ id, tournament_id: 'T', ronda_libre_id: rl })
  db.rondas_libres.push({
    id: rl, estado, holes: 18, hoyo_inicio: 1,
    ronda_libre_jugadores: Object.entries(filas).map(([pid, scores]) => ({ id: 'jr-' + pid, scores })),
    ronda_equipos: equipo ? [equipo] : [],
  })
}
function enGrupo(groupId: string, playerId: string, conFila = true) {
  db.tournament_group_players.push({ group_id: groupId, player_id: playerId, jugador_ronda_id: conFila ? 'jr-' + playerId : null })
}

beforeEach(() => {
  db = { players: [], tournament_groups: [], tournament_group_players: [], rondas_libres: [], rounds: [] }
  rpcRespuestas = []
  rpcLlamadas = []
})

describe('colocarInscrito — huella de p_esperado y argumentos', () => {
  it('mover en stroke play: huella completa por jugador (status, handicap, tee_id, genero, category_id) y del inscrito', async () => {
    db.players.push(
      jugador('a', 10.4, 'approved', { tee_id: 'tee-1', genero: 'F', category_id: 'cat-1' }),
      jugador('b', null),
      jugador('c', 22, 'withdrawn'),
    )
    grupo('G1', { a: {}, b: { 1: 4 } })
    grupo('G2', { c: { 1: 6 } })
    enGrupo('G1', 'a'); enGrupo('G1', 'b'); enGrupo('G2', 'c')

    const res = await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G2', { desde: 'G1', confirmado: true })
    expect(res).toEqual({ ok: true, operacion: 'mover', aprobado: false, jugadorRondaId: 'jr' })
    expect(rpcLlamadas).toHaveLength(1)
    const huella = (id: string, status: string, handicap: number | null, extra: Fila = {}) =>
      ({ player_id: id, status, handicap, tee_id: null, genero: null, category_id: null, ...extra })
    expect(rpcLlamadas[0]).toEqual({
      p_tournament_id: 'T',
      p_player_id: 'a',
      p_grupo_destino: 'G2',
      p_esperado: {
        inscrito: { status: 'approved', handicap: 10.4, tee_id: 'tee-1', genero: 'F', category_id: 'cat-1', grupo: 'G1' },
        grupos: [
          { group_id: 'G1', ronda_libre_id: 'rl-G1', jugadores: [huella('a', 'approved', 10.4, { tee_id: 'tee-1', genero: 'F', category_id: 'cat-1' }), huella('b', 'approved', null)] },
          { group_id: 'G2', ronda_libre_id: 'rl-G2', jugadores: [huella('c', 'withdrawn', 22)] },
        ],
      },
      p_fila: null,
      p_equipos: [],
      p_politica: { formato: 'stroke_play', equipo: false, bola_compartida: false, match_play: false, al_pie_con_retirado: false, jugadores_por_equipo: null, jugadores_por_match: 2 },
      p_borrar_inscrito: false,
    })
  })

  it('agregar a un inscrito sin grupo: p_fila con el nombre y la fila de hándicap del inicio (WHS)', async () => {
    db.players.push(jugador('a', 12.3), jugador('b', 5))
    grupo('G1', { b: {} }); enGrupo('G1', 'b')
    await colocarInscrito(svc, torneoDe('stableford'), 'a', 'G1', { desde: null })
    expect(rpcLlamadas[0].p_fila).toEqual({ nombre: 'A', handicap: 12.3, handicap_de_inscripcion: true })
    expect(rpcLlamadas[0].p_esperado.inscrito.grupo).toBeNull()
    expect(rpcLlamadas[0].p_esperado.grupos.map((g) => g.group_id)).toEqual(['G1'])
  })

  it('borrar sin golpes: p_grupo_destino null, p_borrar_inscrito true, sin p_fila', async () => {
    db.players.push(jugador('a', 10))
    grupo('G1', { a: {} }); enGrupo('G1', 'a')
    rpcRespuestas = [{ ok: true, operacion: 'borrar', aprobado: false, jugador_ronda_id: null }]
    const res = await colocarInscrito(svc, torneoDe('stroke_play'), 'a', null)
    expect(res).toMatchObject({ ok: true, operacion: 'borrar' })
    expect(rpcLlamadas[0]).toMatchObject({ p_grupo_destino: null, p_borrar_inscrito: true, p_fila: null })
  })

  it('la política sale del torneo leído, no del cliente: un torneo match play manda match_play', async () => {
    db.players.push(jugador('a', 10), jugador('b', 5))
    grupo('G1', { a: {} }); grupo('G2', {})
    enGrupo('G1', 'a')
    await colocarInscrito(svc, torneoDe('match_play'), 'a', 'G2')
    expect(rpcLlamadas[0].p_politica).toMatchObject({ formato: 'match_play', match_play: true, equipo: false })
  })
})

describe('colocarInscrito — respuesta rápida antes de la RPC', () => {
  it('D10: match play con el destino lleno → motivo sin llamar a la RPC', async () => {
    db.players.push(jugador('a', 10), jugador('b', 5), jugador('c', 7))
    grupo('G1', { a: {} }); grupo('G2', { b: {}, c: {} })
    enGrupo('G1', 'a'); enGrupo('G2', 'b'); enGrupo('G2', 'c')
    const res = await colocarInscrito(svc, torneoDe('match_play'), 'a', 'G2')
    expect(res).toMatchObject({ ok: false, motivo: 'match-play-grupo-lleno', mensaje: mensajeDeMotivo('match-play-grupo-lleno') })
    expect(rpcLlamadas).toHaveLength(0)
  })

  it('D1: borrar con golpes → borrar-con-golpes, ofrece retirar, sin RPC', async () => {
    db.players.push(jugador('a', 10))
    grupo('G1', { a: { 1: 5 } }); enGrupo('G1', 'a')
    const res = await colocarInscrito(svc, torneoDe('stroke_play'), 'a', null)
    expect(res).toMatchObject({ ok: false, motivo: 'borrar-con-golpes', ofreceRetirar: true })
    expect(rpcLlamadas).toHaveLength(0)
  })

  it('#828: inscrito sin grupo con golpes en su tarjeta individual → agregar-con-tarjeta-individual', async () => {
    db.players.push(jugador('a', 10))
    db.rounds.push({ id: 'r1', tournament_id: 'T', player_id: 'a', hole_scores: [{ id: 'hs1' }] })
    grupo('G1', {})
    const res = await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G1')
    expect(res).toMatchObject({ ok: false, motivo: 'agregar-con-tarjeta-individual' })
    expect(rpcLlamadas).toHaveLength(0)
  })

  it.each([
    ['torneo sin iniciar', torneoDe('stroke_play', { status: 'open' }), 'torneo-no-en-juego'],
    ['varias rondas', torneoDe('stroke_play', { total_rounds: 2 }), 'torneo-varias-rondas'],
    ['formato desconocido', torneoDe('inventado'), 'formato-desconocido'],
  ])('%s → %s', async (_n, torneo, motivo) => {
    db.players.push(jugador('a', 10))
    grupo('G1', {})
    const res = await colocarInscrito(svc, torneo, 'a', 'G1')
    expect(res).toMatchObject({ ok: false, motivo })
    expect(rpcLlamadas).toHaveLength(0)
  })

  it('tarjeta del destino cerrada → tarjeta-cerrada', async () => {
    db.players.push(jugador('a', 10))
    grupo('G1', {}, null, 'finalizada')
    expect(await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G1')).toMatchObject({ ok: false, motivo: 'tarjeta-cerrada' })
  })

  it('el organizador lo vio en otro grupo (desde) → no escribe', async () => {
    db.players.push(jugador('a', 10))
    grupo('G1', { a: {} }); grupo('G2', {}); grupo('G3', {})
    enGrupo('G1', 'a')
    const res = await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G3', { desde: 'G2' })
    expect(res).toMatchObject({ ok: false, motivo: 'cambio-el-origen' })
    expect(rpcLlamadas).toHaveLength(0)
  })

  it('destino de otro torneo → grupo-no-existe; jugador de otro torneo → no-existe', async () => {
    db.players.push(jugador('a', 10), { ...jugador('x', 1), tournament_id: 'OTRO' })
    db.tournament_groups.push({ id: 'GX', tournament_id: 'OTRO', ronda_libre_id: null })
    expect(await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'GX')).toMatchObject({ ok: false, motivo: 'grupo-no-existe' })
    expect(await colocarInscrito(svc, torneoDe('stroke_play'), 'x', null)).toMatchObject({ ok: false, motivo: 'no-existe' })
  })

  it('D4: agregar a un grupo con golpes pide confirmar, con los hoyos del destino; confirmado, escribe', async () => {
    db.players.push(jugador('a', 10), jugador('b', 5))
    grupo('G1', { b: { 1: 4, 2: 5, 3: 3 } }); enGrupo('G1', 'b')
    const res = await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G1')
    expect(res).toMatchObject({ ok: false, motivo: 'requiere-confirmacion', golpes: { inscrito: 0, destino: 3 } })
    expect(rpcLlamadas).toHaveLength(0)
    expect(await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G1', { confirmado: true })).toMatchObject({ ok: true })
  })
})

describe('colocarInscrito — la RPC es la autoridad', () => {
  beforeEach(() => {
    db.players.push(jugador('a', 10))
    grupo('G1', { a: {} }); grupo('G2', {})
    enGrupo('G1', 'a')
  })

  it('conflicto: relee, replanifica y reintenta', async () => {
    rpcRespuestas = [{ ok: false, motivo: 'conflicto' }, { ok: false, motivo: 'conflicto' }, { ok: true, operacion: 'mover', aprobado: false, jugador_ronda_id: 'jr-a' }]
    expect(await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G2')).toMatchObject({ ok: true })
    expect(rpcLlamadas).toHaveLength(3)
  })

  it(`conflicto ${MAX_REINTENTOS_COLOCAR} veces: se rinde con conflicto`, async () => {
    rpcRespuestas = Array.from({ length: MAX_REINTENTOS_COLOCAR }, () => ({ ok: false, motivo: 'conflicto' }))
    expect(await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G2')).toEqual({
      ok: false, motivo: 'conflicto', mensaje: mensajeDeMotivo('conflicto'), ofreceRetirar: false,
    })
    expect(rpcLlamadas).toHaveLength(MAX_REINTENTOS_COLOCAR)
  })

  it.each(['tarjeta-con-timba', 'torneo-varias-rondas', 'mismo-grupo', 'cupo-lleno'] as const)('motivo %s de la RPC → su mensaje del mapa', async (motivo) => {
    rpcRespuestas = [{ ok: false, motivo, ofrece_retirar: false }]
    expect(await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G2')).toEqual({
      ok: false, motivo, mensaje: mensajeDeMotivo(motivo), ofreceRetirar: false,
    })
  })

  it('bajo lock aparecieron golpes: borrar-con-golpes con ofrece_retirar → mensaje de retirar', async () => {
    rpcRespuestas = [{ ok: false, motivo: 'borrar-con-golpes', ofrece_retirar: true }]
    const res = await colocarInscrito(svc, torneoDe('stroke_play'), 'a', null)
    expect(res).toMatchObject({ ok: false, motivo: 'borrar-con-golpes', ofreceRetirar: true })
    expect(!res.ok && res.mensaje).toMatch(/Retíralo/)
  })

  it('motivo que la app no conoce → error genérico (falla cerrado)', async () => {
    rpcRespuestas = [{ ok: false, motivo: 'algo-nuevo' }]
    expect(await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G2')).toEqual({
      ok: false, motivo: 'error', mensaje: MENSAJE_MOTIVO_DESCONOCIDO, ofreceRetirar: false,
    })
  })

  it('la RPC lanza (parámetro mal formado, RAISE) → error, sin reintentar', async () => {
    rpcRespuestas = ['error']
    expect(await colocarInscrito(svc, torneoDe('stroke_play'), 'a', 'G2')).toMatchObject({ ok: false, motivo: 'error' })
    expect(rpcLlamadas).toHaveLength(1)
  })
})

describe('colocarInscrito — hándicap de equipo (bola compartida) con los que COMPITEN', () => {
  const hcpDe = (hcps: number[]) => handicapsDeEquipoDelGrupo({
    formato: 'scramble', members: hcps.map((h, i) => jugador('m' + i, h) as never), handicap: null,
    ctx: ctxWhs, parTotal: 71, holeCount: 18, parDe18Hoyos: 71,
  })

  it('mover en scramble sin golpes: los dos equipos se recalculan; el WD no cuenta', async () => {
    db.players.push(jugador('a', 30), jugador('b', 0), jugador('c', 20), jugador('w', 0, 'withdrawn'), jugador('d', 10))
    grupo('G1', { a: {}, b: {}, c: {}, w: {} }, { scores: {}, handicap_equipo: 1, handicap_equipo_juego: 1 })
    grupo('G2', { d: {} }, { scores: {}, handicap_equipo: null, handicap_equipo_juego: null })
    for (const p of ['a', 'b', 'c', 'w']) enGrupo('G1', p)
    enGrupo('G2', 'd')
    await colocarInscrito(svc, torneoDe('scramble'), 'a', 'G2')
    const origen = hcpDe([0, 20])
    const destino = hcpDe([10, 30])
    expect(rpcLlamadas[0].p_equipos).toEqual([
      { group_id: 'G1', handicap_equipo: origen.completo, handicap_equipo_juego: origen.juego },
      { group_id: 'G2', handicap_equipo: destino.completo, handicap_equipo_juego: destino.juego },
    ])
    expect(rpcLlamadas[0].p_politica).toMatchObject({ equipo: true, bola_compartida: true, jugadores_por_equipo: { min: 2, max: 4 } })
  })

  it('D12: un sin aprobar que llega cuenta como aprobado para el hándicap del destino; el origen sin cambios conserva el guardado', async () => {
    db.players.push(jugador('p', 30, 'pending'), jugador('a', 10), jugador('b', 20), jugador('d', 0))
    grupo('G1', { a: {}, b: {} }, { scores: { 1: 4 }, handicap_equipo: 3.3, handicap_equipo_juego: 3 })
    grupo('G2', { d: {} }, { scores: {}, handicap_equipo: null, handicap_equipo_juego: null })
    enGrupo('G1', 'p', false); enGrupo('G1', 'a'); enGrupo('G1', 'b'); enGrupo('G2', 'd')
    await colocarInscrito(svc, torneoDe('scramble'), 'p', 'G2', { confirmado: true })
    const destino = hcpDe([0, 30])
    expect(rpcLlamadas[0].p_equipos).toEqual([
      { group_id: 'G1', handicap_equipo: 3.3, handicap_equipo_juego: 3 },
      { group_id: 'G2', handicap_equipo: destino.completo, handicap_equipo_juego: destino.juego },
    ])
    expect(rpcLlamadas[0].p_fila).toEqual({ nombre: 'P', handicap: 30, handicap_de_inscripcion: true })
  })

  it('un equipo que queda bajo el mínimo y sin golpes va con hándicap null (D7); uno que queda vacío no va', async () => {
    db.players.push(jugador('a', 10), jugador('b', 20), jugador('c', 5))
    grupo('G1', { a: {}, b: {} }, { scores: {}, handicap_equipo: 5, handicap_equipo_juego: 5 })
    grupo('G2', { c: {} }, { scores: {}, handicap_equipo: null, handicap_equipo_juego: null })
    enGrupo('G1', 'a'); enGrupo('G1', 'b'); enGrupo('G2', 'c')
    await colocarInscrito(svc, torneoDe('scramble'), 'a', 'G2')
    expect(rpcLlamadas[0].p_equipos[0]).toEqual({ group_id: 'G1', handicap_equipo: null, handicap_equipo_juego: null })

    db = { players: [jugador('a', 10), jugador('c', 5)], tournament_groups: [], tournament_group_players: [], rondas_libres: [], rounds: [] }
    grupo('G1', { a: {} }, { scores: {}, handicap_equipo: null, handicap_equipo_juego: null })
    grupo('G2', { c: {} }, { scores: {}, handicap_equipo: null, handicap_equipo_juego: null })
    enGrupo('G1', 'a'); enGrupo('G2', 'c')
    await colocarInscrito(svc, torneoDe('scramble'), 'a', 'G2')
    expect(rpcLlamadas[1].p_equipos.map((e) => e.group_id)).toEqual(['G2'])
  })

  it('mejor bola: los equipos tocados van con hándicap null', async () => {
    db.players.push(jugador('a', 10), jugador('b', 20), jugador('c', 5))
    grupo('G1', { a: {}, b: {} }, { scores: {} }); grupo('G2', { c: {} }, { scores: {} })
    enGrupo('G1', 'a'); enGrupo('G1', 'b'); enGrupo('G2', 'c')
    await colocarInscrito(svc, torneoDe('best_ball'), 'a', 'G2')
    expect(rpcLlamadas[0].p_equipos).toEqual([
      { group_id: 'G1', handicap_equipo: null, handicap_equipo_juego: null },
      { group_id: 'G2', handicap_equipo: null, handicap_equipo_juego: null },
    ])
  })

  it('(a) borrar a un WD sin fila de un equipo de mejor bola con golpes: llega a la RPC (no resta una fila que no existe)', async () => {
    db.players.push(jugador('w', 10, 'withdrawn'), jugador('b', 20))
    grupo('G1', { b: { 1: 4 } }, { scores: {} })
    enGrupo('G1', 'w', false); enGrupo('G1', 'b')
    await colocarInscrito(svc, torneoDe('best_ball'), 'w', null)
    expect(rpcLlamadas).toHaveLength(1)
    expect(rpcLlamadas[0].p_equipos).toEqual([{ group_id: 'G1', handicap_equipo: null, handicap_equipo_juego: null }])
  })
})

describe('prechequearAltaConGrupo — lo que el alta con grupo sabe antes de inscribir', () => {
  it('match play con el destino lleno → match-play-grupo-lleno', async () => {
    db.players.push(jugador('b', 5), jugador('c', 7))
    grupo('G1', { b: {}, c: {} }); enGrupo('G1', 'b'); enGrupo('G1', 'c')
    expect(await prechequearAltaConGrupo(svc, torneoDe('match_play'), 'G1', true)).toMatchObject({ motivo: 'match-play-grupo-lleno' })
  })

  it('destino con golpes: sin confirmar → requiere-confirmacion con los hoyos; confirmado → null', async () => {
    db.players.push(jugador('b', 5))
    grupo('G1', { b: { 1: 4, 2: 5 } }); enGrupo('G1', 'b')
    expect(await prechequearAltaConGrupo(svc, torneoDe('stroke_play'), 'G1', false)).toMatchObject({ motivo: 'requiere-confirmacion', golpes: { inscrito: 0, destino: 2 } })
    expect(await prechequearAltaConGrupo(svc, torneoDe('stroke_play'), 'G1', true)).toBeNull()
  })

  it('tarjeta cerrada, grupo sin tarjeta, grupo de otro torneo, torneo sin iniciar', async () => {
    grupo('G1', {}, null, 'finalizada')
    db.tournament_groups.push({ id: 'G0', tournament_id: 'T', ronda_libre_id: null }, { id: 'GX', tournament_id: 'OTRO', ronda_libre_id: null })
    expect(await prechequearAltaConGrupo(svc, torneoDe('stroke_play'), 'G1', true)).toMatchObject({ motivo: 'tarjeta-cerrada' })
    expect(await prechequearAltaConGrupo(svc, torneoDe('stroke_play'), 'G0', true)).toMatchObject({ motivo: 'grupo-sin-tarjeta' })
    expect(await prechequearAltaConGrupo(svc, torneoDe('stroke_play'), 'GX', true)).toMatchObject({ motivo: 'grupo-no-existe' })
    expect(await prechequearAltaConGrupo(svc, torneoDe('stroke_play', { status: 'open' }), 'G1', true)).toMatchObject({ motivo: 'torneo-no-en-juego' })
  })

  it('scramble con lugar y sin golpes: null (el hándicap del equipo se resuelve al colocar)', async () => {
    db.players.push(jugador('b', 5))
    grupo('G1', { b: {} }, { scores: {}, handicap_equipo: null, handicap_equipo_juego: null }); enGrupo('G1', 'b')
    expect(await prechequearAltaConGrupo(svc, torneoDe('scramble'), 'G1', false)).toBeNull()
    expect(rpcLlamadas).toHaveLength(0)
  })
})
