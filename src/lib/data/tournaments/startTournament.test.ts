// Iniciar un torneo es TODO O NADA por grupo. Antes, si fallaba el insert de un
// jugador o de la ronda del grupo, el servidor lo anotaba como warning, el
// torneo pasaba a 'in_progress' y el grupo quedaba enlazado a una tarjeta
// incompleta que ningún reintento completaba (así quedó lb-open-2026-padre-e-hijo).

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TEAM_CONFIG_VIEJO_PAREJA_OFICIAL } from '@/lib/draft/team-config-legacy.fixtures'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import {
  ensureRound1Cards,
  ERROR_SIN_DESHACER,
  gruposSinTarjeta,
  materializeGroupScorecard,
  motivoParaNoIniciar,
  soloAprobados,
  type ContextoHcpDeEquipos,
  type StartGroup,
  type StartPlayer,
} from './startTournament'

type Filter = [string, string, unknown]
interface Op { kind: 'insert' | 'upsert' | 'update' | 'delete'; table: string; payload?: unknown; filters: Filter[]; options?: unknown }

/**
 * Base en memoria mínima: registra cada operación y deja programar fallos por
 * tabla (`failInsert`), códigos repetidos (`codigoRepetido` veces 23505) y que
 * otro inicio ya haya enlazado el grupo (`grupoYaEnlazado`).
 */
function fakeDb(opts: {
  failInsert?: Partial<Record<string, number>>
  codigoRepetido?: number
  grupoYaEnlazado?: boolean
  failUpdate?: string
  failUpsert?: boolean
  failDelete?: boolean
} = {}) {
  const ops: Op[] = []
  const insertCount: Record<string, number> = {}
  let codigoChoques = opts.codigoRepetido ?? 0
  let seq = 0

  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          const op: Op = { kind: 'insert', table, payload, filters: [] }
          ops.push(op)
          insertCount[table] = (insertCount[table] ?? 0) + 1
          let result: { data: unknown; error: unknown }
          if (table === 'rondas_libres' && codigoChoques > 0) {
            codigoChoques--
            result = { data: null, error: { code: '23505', message: 'duplicate key rondas_libres_codigo_key' } }
          } else if (opts.failInsert?.[table] === insertCount[table]) {
            result = { data: null, error: { code: 'XX000', message: `boom ${table}` } }
          } else {
            result = { data: { id: `${table}-${++seq}` }, error: null }
          }
          const p = Promise.resolve(result)
          return Object.assign(p, { select: () => ({ single: () => Promise.resolve(result) }) })
        },
        upsert(payload: unknown, options: unknown) {
          ops.push({ kind: 'upsert', table, payload, filters: [], options })
          return Promise.resolve({ error: opts.failUpsert ? { message: 'boom upsert' } : null })
        },
        update(payload: unknown) {
          const op: Op = { kind: 'update', table, payload, filters: [] }
          ops.push(op)
          const fail = opts.failUpdate === table
          const chain = {
            eq: (c: string, v: unknown) => { op.filters.push(['eq', c, v]); return chain },
            is: (c: string, v: unknown) => { op.filters.push(['is', c, v]); return chain },
            in: (c: string, v: unknown) => { op.filters.push(['in', c, v]); return chain },
            select: () => Promise.resolve(
              fail
                ? { data: null, error: { message: `boom ${table}` } }
                : { data: opts.grupoYaEnlazado ? [] : [{ id: 'g1' }], error: null },
            ),
            then: (resolve: (r: unknown) => unknown) =>
              Promise.resolve({ error: fail ? { message: `boom ${table}` } : null }).then(resolve),
          }
          return chain
        },
        delete() {
          const op: Op = { kind: 'delete', table, filters: [] }
          ops.push(op)
          return { eq: (c: string, v: unknown) => { op.filters.push(['eq', c, v]); return Promise.resolve({ error: opts.failDelete ? { message: 'fk' } : null }) } }
        },
      }
    },
  }
  return { svc: client as unknown as SupabaseClient, ops }
}

const player = (id: string, over: Partial<StartPlayer> = {}): StartPlayer => ({
  id,
  user_id: `u-${id}`,
  player_name: null,
  handicap_at_registration: 12,
  status: 'approved',
  tee_id: null,
  profiles: { name: `Jugador ${id}`, indice: 12 },
  ...over,
})
const group = (playerIds: string[], name = 'Grupo 1'): StartGroup => ({
  id: 'g1',
  name,
  ronda_libre_id: null,
  players: playerIds.map((pid, i) => ({ id: `gp${i}`, player_id: pid })),
})
const tournament = (format: string | null = 'stroke_play', extra: { formato_juego?: string | null; modo_juego?: string | null; hcp_pct?: number | null; team_config?: unknown } = {}) =>
  ({ format, tees: 'azul', course_name: 'Los Leones', courses: null, ...extra })
const ronda1 = { courseId: 'c1', holeCount: 18, date: '2026-10-30' }

/**
 * Contexto de handicap de equipo de prueba: cancha par 72 con slope 113 y CR 72,
 * así el course handicap WHS de cada jugador es igual a su índice (WHS 6.1a:
 * índice × 113/113 + (72 − 72)). `mode: null` = torneo raw/legacy.
 */
const hcpEquipos = (mode: string | null = 'whs'): ContextoHcpDeEquipos => ({
  ctx: { mode, tees: 'azul', course: { par_total: 72, slope_rating: 113, course_rating: 72 }, courseTees: [], hcpPct: 100 },
  parTotal: 72,
  parDe18Hoyos: 72,
})

function run(db: ReturnType<typeof fakeDb>, g: StartGroup, players: StartPlayer[], format: string | null = 'stroke_play') {
  return materializeGroupScorecard(db.svc, { tournament: tournament(format), group: g, players, ronda1, creatorId: 'org', hcpEquipos: hcpEquipos() })
}

const rondaBorrada = (ops: Op[]) => ops.some((o) => o.kind === 'delete' && o.table === 'rondas_libres')
const grupoEnlazado = (ops: Op[]) =>
  ops.some((o) => o.kind === 'update' && o.table === 'tournament_groups' && (o.payload as { ronda_libre_id: unknown }).ronda_libre_id !== null)

describe('materializeGroupScorecard', () => {
  // #510: la tarjeta del grupo hereda formato y modo del torneo (antes quedaba stroke_play / gross).
  const rondaInsertada = (db: ReturnType<typeof fakeDb>) =>
    db.ops.find((o) => o.kind === 'insert' && o.table === 'rondas_libres')!.payload as Record<string, unknown>
  it.each([
    ['stableford neto', 'stableford', 'stableford', 'neto'],
    ['scramble neto', 'scramble', 'scramble', 'neto'],
    ['stroke play gross', 'stroke_play', 'stroke_play', 'gross'],
  ])('%s: la ronda del grupo juega el formato y el modo del torneo', async (_n, formato_juego, esperado, modo_juego) => {
    const db = fakeDb()
    const players = [player('p1'), player('p2')]
    await materializeGroupScorecard(db.svc, {
      tournament: tournament('stroke_play', { formato_juego, modo_juego }), group: group(['p1', 'p2']), players, ronda1, creatorId: 'org',
    })
    expect(rondaInsertada(db)).toMatchObject({ formato_juego: esperado, modo_juego })
  })

  it('match play: un par juega match; un grupo de 4 anota en tarjeta stroke play plana', async () => {
    const par = fakeDb()
    await materializeGroupScorecard(par.svc, {
      tournament: tournament('stroke_play', { formato_juego: 'match_play', modo_juego: 'neto' }), group: group(['p1', 'p2']),
      players: [player('p1'), player('p2')], ronda1, creatorId: 'org',
    })
    expect(rondaInsertada(par)).toMatchObject({ formato_juego: 'match_play', modo_juego: 'neto' })
    const cuatro = fakeDb()
    const ids = ['p1', 'p2', 'p3', 'p4']
    await materializeGroupScorecard(cuatro.svc, {
      tournament: tournament('stroke_play', { formato_juego: 'match_play', modo_juego: 'neto' }), group: group(ids),
      players: ids.map((id) => player(id)), ronda1, creatorId: 'org',
    })
    expect(rondaInsertada(cuatro)).toMatchObject({ formato_juego: 'stroke_play', modo_juego: 'neto' })
  })

  // Handicap de juego: la tarjeta del grupo hereda el % EFECTIVO del torneo
  // (hcpPctEfectivo). Desde ahí lo leen scorer, board, /en-vivo y match play.
  it.each([
    ['stroke play neto al 85 %', 'stroke_play', 'neto', 85, 2, 85],
    ['match play neto al 85 % (un par)', 'match_play', 'neto', 85, 2, 85],
    ['match play neto al 85 %, grupo de 4 → stroke play plana, mismo %', 'match_play', 'neto', 85, 4, 85],
    ['scramble: el equipo ya aplica su asignación → 100', 'scramble', 'neto', 85, 2, 100],
    ['foursome: el equipo ya aplica su asignación → 100', 'foursome', 'neto', 85, 2, 100],
    ['best ball neto al 85 %: cada jugador su bola → 85', 'best_ball', 'neto', 85, 2, 85],
    ['gross → 100', 'stroke_play', 'gross', 85, 2, 100],
    ['torneo sin la columna → 100', 'stableford', 'neto', null, 2, 100],
  ])('%s', async (_n, formato_juego, modo_juego, hcp_pct, n, esperado) => {
    const db = fakeDb()
    const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`)
    await materializeGroupScorecard(db.svc, {
      tournament: tournament('stroke_play', { formato_juego, modo_juego, hcp_pct }), group: group(ids),
      players: ids.map((id) => player(id)), ronda1, creatorId: 'org',
    })
    expect(rondaInsertada(db)).toMatchObject({ hcp_pct: esperado })
  })

  it('torneo viejo sin formato_juego ni modo: cae a la columna format y a gross', async () => {
    const db = fakeDb()
    await run(db, group(['p1']), [player('p1')], 'stableford')
    expect(rondaInsertada(db)).toMatchObject({ formato_juego: 'stableford', modo_juego: 'gross' })
  })

  it('camino feliz: ronda, un jugador por integrante, enlaza el grupo y a cada integrante', async () => {
    const db = fakeDb()
    const players = [player('p1'), player('p2')]
    expect(await run(db, group(['p1', 'p2']), players)).toEqual({
      ok: true,
      groupId: 'g1',
      rondaId: 'rondas_libres-1',
      jugadorRondaIds: ['ronda_libre_jugadores-2', 'ronda_libre_jugadores-3'],
    })
    expect(db.ops.filter((o) => o.kind === 'insert' && o.table === 'ronda_libre_jugadores')).toHaveLength(2)
    const claim = db.ops.find((o) => o.kind === 'update' && o.table === 'tournament_groups')!
    expect(claim.filters).toContainEqual(['is', 'ronda_libre_id', null])
    expect(db.ops.filter((o) => o.kind === 'update' && o.table === 'tournament_group_players')).toHaveLength(2)
    expect(rondaBorrada(db.ops)).toBe(false)
  })

  it('el grupo se enlaza DESPUÉS de crear a todos los jugadores (si no, un reintento lo saltaría)', async () => {
    const db = fakeDb()
    await run(db, group(['p1', 'p2']), [player('p1'), player('p2')])
    const iClaim = db.ops.findIndex((o) => o.kind === 'update' && o.table === 'tournament_groups')
    const iUltimoJugador = db.ops.map((o) => o.table).lastIndexOf('ronda_libre_jugadores')
    expect(iClaim).toBeGreaterThan(iUltimoJugador)
  })

  it('si falla el insert de un jugador: borra la ronda, NO enlaza el grupo y devuelve error', async () => {
    const db = fakeDb({ failInsert: { ronda_libre_jugadores: 2 } })
    const res = await run(db, group(['p1', 'p2']), [player('p1'), player('p2')])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('Grupo 1')
    expect(rondaBorrada(db.ops)).toBe(true)
    expect(grupoEnlazado(db.ops)).toBe(false)
  })

  it('si falla crear la ronda: devuelve error sin crear jugadores', async () => {
    const db = fakeDb({ failInsert: { rondas_libres: 1 } })
    expect((await run(db, group(['p1']), [player('p1')])).ok).toBe(false)
    expect(db.ops.some((o) => o.table === 'ronda_libre_jugadores')).toBe(false)
  })

  it('código de ronda repetido (23505): reintenta con otro código', async () => {
    const db = fakeDb({ codigoRepetido: 2 })
    expect((await run(db, group(['p1']), [player('p1')])).ok).toBe(true)
    const codigos = db.ops.filter((o) => o.table === 'rondas_libres' && o.kind === 'insert')
    expect(codigos).toHaveLength(3)
  })

  it('código repetido 3 veces seguidas: se rinde con error, no deja el grupo a medias', async () => {
    const db = fakeDb({ codigoRepetido: 3 })
    expect((await run(db, group(['p1']), [player('p1')])).ok).toBe(false)
    expect(grupoEnlazado(db.ops)).toBe(false)
  })

  it('equipos: si falla el equipo, deshace todo', async () => {
    const db = fakeDb({ failInsert: { ronda_equipos: 1 } })
    const res = await run(db, group(['p1', 'p2', 'p3', 'p4']), ['p1', 'p2', 'p3', 'p4'].map((id) => player(id)), 'scramble')
    expect(res.ok).toBe(false)
    expect(rondaBorrada(db.ops)).toBe(true)
    expect(grupoEnlazado(db.ops)).toBe(false)
  })

  it('equipos: si fallan los integrantes del equipo, deshace todo', async () => {
    const db = fakeDb({ failInsert: { ronda_equipo_jugadores: 1 } })
    const res = await run(db, group(['p1', 'p2', 'p3', 'p4']), ['p1', 'p2', 'p3', 'p4'].map((id) => player(id)), 'scramble')
    expect(res.ok).toBe(false)
    expect(rondaBorrada(db.ops)).toBe(true)
  })

  it('si falla enlazar a un integrante: suelta SOLO los enlaces a esta tarjeta, desenlaza el grupo y borra la ronda', async () => {
    const db = fakeDb({ failUpdate: 'tournament_group_players' })
    const res = await run(db, group(['p1', 'p2']), [player('p1'), player('p2')])
    expect(res.ok).toBe(false)
    const soltar = db.ops.find(
      (o) => o.kind === 'update' && o.table === 'tournament_group_players' && (o.payload as { jugador_ronda_id: unknown }).jugador_ronda_id === null,
    )!
    expect(soltar.filters.find((f) => f[0] === 'in')?.[2]).toEqual(['ronda_libre_jugadores-2', 'ronda_libre_jugadores-3'])
    const desenlazar = db.ops.find(
      (o) => o.kind === 'update' && o.table === 'tournament_groups' && (o.payload as { ronda_libre_id: unknown }).ronda_libre_id === null,
    )!
    expect(desenlazar.filters).toContainEqual(['eq', 'ronda_libre_id', 'rondas_libres-1'])
    expect(rondaBorrada(db.ops)).toBe(true)
  })

  it('otro inicio simultáneo ya enlazó el grupo: borra su copia, no toca los enlaces del otro y NO sigue (conflicto)', async () => {
    const db = fakeDb({ grupoYaEnlazado: true })
    expect(await run(db, group(['p1']), [player('p1')])).toMatchObject({ ok: false, conflicto: true })
    expect(rondaBorrada(db.ops)).toBe(true)
    expect(db.ops.some((o) => o.kind === 'update' && o.table === 'tournament_group_players')).toBe(false)
  })

  it('si el deshacer mismo falla: error de soporte (sinDeshacer), no "intenta de nuevo"', async () => {
    const db = fakeDb({ failInsert: { ronda_libre_jugadores: 1 }, failDelete: true })
    const res = await run(db, group(['p1']), [player('p1')])
    expect(res).toMatchObject({ ok: false, sinDeshacer: true, error: ERROR_SIN_DESHACER })
  })

  it('excepción a mitad del grupo (datos raros, red): deshace la ronda, no la deja huérfana', async () => {
    const db = fakeDb()
    const roto = player('p1')
    Object.defineProperty(roto, 'profiles', { get: () => { throw new Error('dato raro') } })
    const res = await run(db, group(['p1']), [roto])
    expect(res.ok).toBe(false)
    expect(rondaBorrada(db.ops)).toBe(true)
  })

  it('integrante del grupo que no está en la lista de jugadores: error, no lo omite en silencio', async () => {
    const db = fakeDb()
    expect((await run(db, group(['p1', 'fantasma']), [player('p1')])).ok).toBe(false)
    expect(rondaBorrada(db.ops)).toBe(true)
  })

  it('invitado sin cuenta lleva su handicap en la tarjeta; con cuenta en individual no', async () => {
    const db = fakeDb()
    await run(db, group(['p1', 'inv']), [player('p1'), player('inv', { user_id: null, player_name: 'Invitado', profiles: null, handicap_at_registration: 20 })])
    const filas = db.ops.filter((o) => o.kind === 'insert' && o.table === 'ronda_libre_jugadores').map((o) => o.payload as Record<string, unknown>)
    expect(filas[0]).not.toHaveProperty('handicap')
    expect(filas[1]).toMatchObject({ nombre: 'Invitado', user_id: null, handicap: 20 })
  })
})

describe('ensureRound1Cards', () => {
  it('upsert idempotente sobre el UNIQUE (tournament_id, player_id, round_number)', async () => {
    const db = fakeDb()
    expect(await ensureRound1Cards(db.svc, 't1', [player('p1'), player('p2')])).toBe(true)
    const op = db.ops[0]
    expect(op.kind).toBe('upsert')
    expect(op.options).toEqual({ onConflict: 'tournament_id,player_id,round_number', ignoreDuplicates: true })
    expect(op.payload).toHaveLength(2)
  })

  it('si falla, devuelve false (antes solo avisaba y el torneo se iniciaba sin tarjetas)', async () => {
    expect(await ensureRound1Cards(fakeDb({ failUpsert: true }).svc, 't1', [player('p1')])).toBe(false)
  })
})

describe('gruposSinTarjeta', () => {
  it('sin ronda o con un integrante fuera = sin tarjeta; vacío o completo = ok', () => {
    const base = { name: 'G', players: [{ id: 'a', player_id: 'p1', jugador_ronda_id: 'j' }] }
    const lista: StartGroup[] = [
      { ...base, id: 'completo', ronda_libre_id: 'rl' },
      { ...base, id: 'sinRonda', ronda_libre_id: null },
      { id: 'aMedias', name: 'G', ronda_libre_id: 'rl', players: [{ id: 'b', player_id: 'p2', jugador_ronda_id: null }] },
      { id: 'vacio', name: 'G', ronda_libre_id: null, players: [] },
    ]
    expect(gruposSinTarjeta(lista).map((g) => g.id)).toEqual(['sinRonda', 'aMedias'])
  })
})

describe('soloAprobados', () => {
  it('saca de cada grupo a los inscritos que no están aprobados', () => {
    const g: StartGroup = {
      id: 'g', name: 'G', ronda_libre_id: 'rl',
      players: [{ id: 'a', player_id: 'p1', jugador_ronda_id: 'j' }, { id: 'b', player_id: 'p9', jugador_ronda_id: null }],
    }
    const [limpio] = soloAprobados([g], [player('p1')])
    expect(limpio.players.map((gp) => gp.player_id)).toEqual(['p1'])
    // El pendiente fuera de la tarjeta ya no la deja "incompleta".
    expect(gruposSinTarjeta([limpio])).toEqual([])
  })
})

describe('motivoParaNoIniciar', () => {
  it('sin aprobados', () => {
    expect(motivoParaNoIniciar('stroke_play', [], [])).toBe('Se necesita al menos 1 jugador aprobado')
  })

  it('aprobado sin grupo', () => {
    expect(motivoParaNoIniciar('stroke_play', [player('p1'), player('p2')], [group(['p1'])])).toBe(
      'Jugadores sin grupo: Jugador p2. Asigna a un grupo antes de iniciar.',
    )
  })

  it('equipo de tamaño incorrecto en formato por equipos', () => {
    const msg = motivoParaNoIniciar('scramble', [player('p1')], [group(['p1'], 'Equipo A')])
    expect(msg).toMatch(/^Tamaño de equipo incorrecto\..*"Equipo A" \(1\)\.$/)
  })

  it('grupo enlazado con un integrante fuera de la tarjeta (intento viejo): no inicia', () => {
    const g: StartGroup = { id: 'g1', name: 'Grupo 4', ronda_libre_id: 'rl', players: [{ id: 'a', player_id: 'p1', jugador_ronda_id: null }] }
    expect(motivoParaNoIniciar('stroke_play', [player('p1')], [g])).toMatch(/^La tarjeta de "Grupo 4" está incompleta/)
  })

  it('grupo enlazado y completo: se puede iniciar (el reintento lo salta)', () => {
    const g: StartGroup = { id: 'g1', name: 'Grupo 1', ronda_libre_id: 'rl', players: [{ id: 'a', player_id: 'p1', jugador_ronda_id: 'j1' }] }
    expect(motivoParaNoIniciar('stroke_play', [player('p1')], [g])).toBeNull()
  })

  it('todo en orden', () => {
    expect(motivoParaNoIniciar('stroke_play', [player('p1')], [group(['p1'])])).toBeNull()
  })

  const trio = ['p1', 'p2', 'p3']
  const config = (handicap: unknown) => ({ size: 4, formation_mode: 'manual', handicap })

  it('scramble personalizado definido para 4 y un equipo de 3: no inicia (no inventa el % que falta)', () => {
    const msg = motivoParaNoIniciar('scramble', trio.map((id) => player(id)), [group(trio, 'Equipo A')], config({ modo: 'personalizado', porcentajes: [25, 20, 15, 10] }))
    expect(msg).toBe('El equipo "Equipo A" tiene 3 jugadores y el handicap personalizado está definido para 4. Ajusta los porcentajes o el equipo antes de iniciar.')
  })

  it('scramble oficial con un equipo de 3: inicia (la asignación oficial usa los jugadores reales)', () => {
    expect(motivoParaNoIniciar('scramble', trio.map((id) => player(id)), [group(trio)], config({ modo: 'oficial' }))).toBeNull()
  })

  it('scramble sin team_config o con la forma vieja: oficial, inicia', () => {
    expect(motivoParaNoIniciar('scramble', trio.map((id) => player(id)), [group(trio)], null)).toBeNull()
    expect(motivoParaNoIniciar('scramble', trio.map((id) => player(id)), [group(trio)], { ...TEAM_CONFIG_VIEJO_PAREJA_OFICIAL, size: 3 })).toBeNull()
  })

  it('foursome personalizado sin % de la suma: no inicia', () => {
    const msg = motivoParaNoIniciar('foursome', [player('p1'), player('p2')], [group(['p1', 'p2'], 'Pareja 1')], config({ modo: 'personalizado', porcentajes: [50, 50] }))
    expect(msg).toBe('No se puede calcular el handicap de "Pareja 1" con la configuración del torneo. Revisa el handicap de equipo antes de iniciar.')
    const msg2 = motivoParaNoIniciar('foursome', [player('p1'), player('p2')], [group(['p1', 'p2'], 'Pareja 1')], config({ modo: 'raro' }))
    expect(msg2).toBe('No se puede calcular el handicap de "Pareja 1" con la configuración del torneo. Revisa el handicap de equipo antes de iniciar.')
  })

  it('5 jugadores en scramble: no inicia (tamaño fuera de rango)', () => {
    const cinco = ['p1', 'p2', 'p3', 'p4', 'p5']
    expect(motivoParaNoIniciar('scramble', cinco.map((id) => player(id)), [group(cinco, 'Equipo 5')])).toMatch(/^Tamaño de equipo incorrecto\..*"Equipo 5" \(5\)\.$/)
  })

  it('best ball no mira el handicap de equipo', () => {
    expect(motivoParaNoIniciar('best_ball', trio.map((id) => player(id)), [group(trio)], config({ modo: 'personalizado', porcentajes: [1] }))).toBeNull()
  })
})

describe('materializeGroupScorecard — handicap de equipo en ronda_equipos', () => {
  const equipoInsertado = (db: ReturnType<typeof fakeDb>) =>
    db.ops.find((o) => o.kind === 'insert' && o.table === 'ronda_equipos')?.payload as Record<string, unknown> | undefined
  // Índices 10 y 20 → course handicap 10 y 20 (cancha neutra de `hcpEquipos`).
  const pareja = () => [player('p1', { handicap_at_registration: 10 }), player('p2', { handicap_at_registration: 20 })]
  const armar = (db: ReturnType<typeof fakeDb>, formato: string, ctx: ContextoHcpDeEquipos | null, team_config?: unknown) =>
    materializeGroupScorecard(db.svc, {
      tournament: tournament(formato, { formato_juego: formato, team_config }), group: group(['p1', 'p2']), players: pareja(), ronda1, creatorId: 'org', hcpEquipos: ctx,
    })

  it('scramble WHS 18 hoyos: completo y de juego iguales (35 % × 10 + 15 % × 20 = 6,5 → 7)', async () => {
    const db = fakeDb()
    expect((await armar(db, 'scramble', hcpEquipos())).ok).toBe(true)
    expect(equipoInsertado(db)).toMatchObject({ handicap_equipo: 7, handicap_equipo_juego: 7 })
  })

  it('scramble personalizado [50, 50]: 5 + 10 = 15', async () => {
    const db = fakeDb()
    await armar(db, 'scramble', hcpEquipos(), { size: 2, formation_mode: 'manual', handicap: { modo: 'personalizado', porcentajes: [50, 50] } })
    expect(equipoInsertado(db)).toMatchObject({ handicap_equipo: 15, handicap_equipo_juego: 15 })
  })

  it('foursome WHS: 50 % de 10 + 20 = 15', async () => {
    const db = fakeDb()
    await armar(db, 'foursome', hcpEquipos())
    expect(equipoInsertado(db)).toMatchObject({ handicap_equipo: 15, handicap_equipo_juego: 15 })
  })

  it('torneo raw: usa lo inscrito (handicap_at_registration, no el índice del perfil) y deja el de juego en null', async () => {
    const db = fakeDb()
    await armar(db, 'scramble', hcpEquipos(null))
    expect(equipoInsertado(db)).toMatchObject({ handicap_equipo: 7, handicap_equipo_juego: null })
  })

  it('best ball: ambos handicaps de equipo en null (cada jugador juega con el suyo)', async () => {
    const db = fakeDb()
    expect((await armar(db, 'best_ball', null)).ok).toBe(true)
    expect(equipoInsertado(db)).toMatchObject({ handicap_equipo: null, handicap_equipo_juego: null })
  })

  it('scramble sin contexto de handicap: no arma el equipo y deshace la ronda', async () => {
    const db = fakeDb()
    expect((await armar(db, 'scramble', null)).ok).toBe(false)
    expect(equipoInsertado(db)).toBeUndefined()
    expect(rondaBorrada(db.ops)).toBe(true)
  })

  it('personalizado que no calza con el equipo (llegó sin pasar por el bloqueo): no arma un equipo con 0 golpes', async () => {
    const db = fakeDb()
    const res = await armar(db, 'scramble', hcpEquipos(), { size: 3, formation_mode: 'manual', handicap: { modo: 'personalizado', porcentajes: [30, 20, 10] } })
    expect(res.ok).toBe(false)
    expect(equipoInsertado(db)).toBeUndefined()
    expect(rondaBorrada(db.ops)).toBe(true)
  })
})
