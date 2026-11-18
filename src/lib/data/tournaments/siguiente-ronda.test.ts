import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { abrirSiguienteRonda, contarTarjetasEnJuego } from './siguiente-ronda'

// Base de juguete: torneo + jugadores + tarjetas. El fake aplica los filtros que la capa de datos le pide
// (eq / not in / embebido players!inner), así el test mide la REGLA y no solo que se llamó a algo.
interface Jugador { id: string; status: string }
interface Tarjeta { id: string; player_id: string; round_number: number; status: string }
interface Db { total_rounds: number; players: Jugador[]; rounds: Tarjeta[]; fallaInsert?: boolean }

function fake(db: Db) {
  const insertados: Record<string, unknown>[] = []
  const svc = {
    from(table: string) {
      const filtros: Array<(row: Record<string, unknown>) => boolean> = []
      let head = false
      let orden: { col: string; asc: boolean } | null = null
      let limite: number | null = null
      const filas = (): Record<string, unknown>[] => {
        if (table === 'tournaments') return [{ id: 't1', total_rounds: db.total_rounds }]
        if (table === 'players') return db.players.map((p) => ({ ...p, tournament_id: 't1' }))
        return db.rounds.map((r) => ({ ...r, tournament_id: 't1', players: db.players.find((p) => p.id === r.player_id) }))
      }
      const valor = (row: Record<string, unknown>, col: string) =>
        col.includes('.') ? (row[col.split('.')[0]] as Record<string, unknown> | undefined)?.[col.split('.')[1]] : row[col]
      const resolver = () => {
        let out = filas().filter((r) => filtros.every((f) => f(r)))
        if (orden) { const o = orden; out = [...out].sort((a, b) => (Number(a[o.col]) - Number(b[o.col])) * (o.asc ? 1 : -1)) }
        if (limite !== null) out = out.slice(0, limite)
        return out
      }
      const b = {
        select(_cols: string, opts?: { head?: boolean }) { head = !!opts?.head; return b },
        eq(col: string, v: unknown) { if (col !== 'id' || table !== 'tournaments') filtros.push((r) => valor(r, col) === v); return b },
        not(col: string, _op: string, lista: string) {
          const excl = [...lista.matchAll(/"([^"]+)"/g)].map((m) => m[1])
          filtros.push((r) => !excl.includes(String(valor(r, col)))); return b
        },
        order(col: string, o: { ascending: boolean }) { orden = { col, asc: o.ascending }; return b },
        limit(n: number) { limite = n; return b },
        single: async () => ({ data: resolver()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: resolver()[0] ?? null, error: null }),
        insert: async (rows: Record<string, unknown>[]) => {
          if (db.fallaInsert) return { error: { message: 'boom' } }
          insertados.push(...rows); return { error: null }
        },
        then(res: (v: unknown) => void) {
          const out = resolver()
          res(head ? { count: out.length, error: null } : { data: out, error: null })
        },
      }
      return b
    },
  }
  return { svc: svc as unknown as SupabaseClient, insertados }
}

const J = (id: string, status = 'approved'): Jugador => ({ id, status })
const T = (player_id: string, round_number: number, status: string): Tarjeta => ({ id: `${player_id}-${round_number}`, player_id, round_number, status })

describe('contarTarjetasEnJuego — solo tarjetas abiertas de jugadores aprobados', () => {
  it('la tarjeta abierta de un WD, DQ o pendiente no deja la ronda en juego', async () => {
    const { svc } = fake({
      total_rounds: 2,
      players: [J('a'), J('w', 'withdrawn'), J('d', 'disqualified'), J('p', 'pending')],
      rounds: [T('a', 1, 'closed'), T('w', 1, 'in_progress'), T('d', 1, 'in_progress'), T('p', 1, 'in_progress')],
    })
    expect(await contarTarjetasEnJuego(svc, 't1', 1)).toBe(0)
  })

  it('cuenta la abierta de un aprobado; official y closed son cerradas', async () => {
    const { svc } = fake({
      total_rounds: 2,
      players: [J('a'), J('b'), J('c')],
      rounds: [T('a', 1, 'in_progress'), T('b', 1, 'official'), T('c', 1, 'closed')],
    })
    expect(await contarTarjetasEnJuego(svc, 't1', 1)).toBe(1)
  })
})

describe('abrirSiguienteRonda', () => {
  it('con un retirado que dejó la tarjeta abierta, abre la ronda 2 solo para los aprobados', async () => {
    const { svc, insertados } = fake({
      total_rounds: 2,
      players: [J('a'), J('b'), J('w', 'withdrawn'), J('d', 'disqualified'), J('p', 'pending')],
      rounds: [T('a', 1, 'closed'), T('b', 1, 'closed'), T('w', 1, 'in_progress'), T('d', 1, 'closed')],
    })
    const r = await abrirSiguienteRonda(svc, 't1')
    expect(r).toEqual({ ok: true, roundNumber: 2, playersCount: 2 })
    expect(insertados.map((x) => x.player_id).sort()).toEqual(['a', 'b'])
    expect(insertados.every((x) => x.round_number === 2 && x.status === 'in_progress')).toBe(true)
  })

  it('no abre mientras un aprobado siga con la tarjeta abierta', async () => {
    const { svc, insertados } = fake({
      total_rounds: 2, players: [J('a'), J('b')], rounds: [T('a', 1, 'closed'), T('b', 1, 'in_progress')],
    })
    expect(await abrirSiguienteRonda(svc, 't1')).toEqual({ ok: false, reason: 'ronda_en_juego', currentRound: 1 })
    expect(insertados).toEqual([])
  })

  it('no pasa del total de rondas', async () => {
    const { svc } = fake({ total_rounds: 2, players: [J('a')], rounds: [T('a', 1, 'closed'), T('a', 2, 'closed')] })
    expect(await abrirSiguienteRonda(svc, 't1')).toEqual({ ok: false, reason: 'todas_completadas' })
  })

  it('sin aprobados no crea nada', async () => {
    const { svc, insertados } = fake({ total_rounds: 2, players: [J('w', 'withdrawn')], rounds: [T('w', 1, 'closed')] })
    expect(await abrirSiguienteRonda(svc, 't1')).toEqual({ ok: false, reason: 'sin_jugadores' })
    expect(insertados).toEqual([])
  })

  it('si el insert falla devuelve error (la ruta responde 500 y lo reporta)', async () => {
    const { svc } = fake({ total_rounds: 2, players: [J('a')], rounds: [T('a', 1, 'closed')], fallaInsert: true })
    const r = await abrirSiguienteRonda(svc, 't1')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toBe('error')
  })
})
