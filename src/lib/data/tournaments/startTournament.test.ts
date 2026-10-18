// Iniciar un torneo es TODO O NADA por grupo. Antes, si fallaba el insert de un
// jugador o de la ronda del grupo, el servidor lo anotaba como warning, el
// torneo pasaba a 'in_progress' y el grupo quedaba enlazado a una tarjeta
// incompleta que ningún reintento completaba (así quedó lb-open-2026-padre-e-hijo).

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import {
  ensureRound1Cards,
  materializeGroupScorecard,
  motivoParaNoIniciar,
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
          return { eq: (c: string, v: unknown) => { op.filters.push(['eq', c, v]); return Promise.resolve({ error: null }) } }
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
  profiles: { name: `Jugador ${id}`, indice: 12 },
  ...over,
})
const group = (playerIds: string[], name = 'Grupo 1'): StartGroup => ({
  id: 'g1',
  name,
  ronda_libre_id: null,
  players: playerIds.map((pid, i) => ({ id: `gp${i}`, player_id: pid })),
})
const tournament = (format: string | null = 'stroke_play') => ({ format, tees: 'azul', course_name: 'Los Leones', courses: null })
const ronda1 = { courseId: 'c1', holeCount: 18, date: '2026-10-30' }

function run(db: ReturnType<typeof fakeDb>, g: StartGroup, players: StartPlayer[], format: string | null = 'stroke_play') {
  return materializeGroupScorecard(db.svc, { tournament: tournament(format), group: g, players, ronda1, creatorId: 'org' })
}

const rondaBorrada = (ops: Op[]) => ops.some((o) => o.kind === 'delete' && o.table === 'rondas_libres')
const grupoEnlazado = (ops: Op[]) =>
  ops.some((o) => o.kind === 'update' && o.table === 'tournament_groups' && (o.payload as { ronda_libre_id: unknown }).ronda_libre_id !== null)

describe('materializeGroupScorecard', () => {
  it('camino feliz: ronda, un jugador por integrante, enlaza el grupo y a cada integrante', async () => {
    const db = fakeDb()
    const players = [player('p1'), player('p2')]
    expect(await run(db, group(['p1', 'p2']), players)).toEqual({ ok: true })
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
    expect(await run(db, group(['p1']), [player('p1')])).toEqual({ ok: true })
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

  it('otro inicio simultáneo ya enlazó el grupo: borra su copia y no toca los enlaces del otro', async () => {
    const db = fakeDb({ grupoYaEnlazado: true })
    expect(await run(db, group(['p1']), [player('p1')])).toEqual({ ok: true })
    expect(rondaBorrada(db.ops)).toBe(true)
    expect(db.ops.some((o) => o.kind === 'update' && o.table === 'tournament_group_players')).toBe(false)
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

  it('todo en orden', () => {
    expect(motivoParaNoIniciar('stroke_play', [player('p1')], [group(['p1'])])).toBeNull()
  })
})
