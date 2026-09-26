import { describe, it, expect } from 'vitest'
import { mapTournamentRoundsForInsert, fetchRoundPlayConfig, fetchAllRoundPlayConfigs } from './rounds'
import type { RoundConfig } from '@/lib/draft/types'

function ronda(over: Partial<RoundConfig> & { round_number: number }): RoundConfig {
  return {
    date: null,
    course_id: null,
    hole_count: 18,
    tee_assignment_mode: 'per_player',
    ...over,
  }
}

describe('mapTournamentRoundsForInsert — sólo las rondas 2..N, la 1 vive en tournaments', () => {
  it('torneo de una ronda → nada que insertar', () => {
    expect(mapTournamentRoundsForInsert({ rounds: [ronda({ round_number: 1, course_id: 'A' })] }, 't1')).toEqual([])
  })

  it('persiste cancha, fecha y hoyos propios de cada ronda ≥ 2 (el bug P0)', () => {
    const rows = mapTournamentRoundsForInsert(
      {
        rounds: [
          ronda({ round_number: 1, course_id: 'A', date: '2026-10-10' }),
          ronda({ round_number: 2, course_id: 'B', date: '2026-10-11', hole_count: 9, tee_assignment_mode: 'per_category' }),
        ],
      },
      't1',
    )
    expect(rows).toEqual([
      {
        tournament_id: 't1',
        round_number: 2,
        date: '2026-10-11',
        course_id: 'B',
        hole_count: 9,
      },
    ])
  })

  it('ordena por round_number aunque el config venga desordenado', () => {
    const rows = mapTournamentRoundsForInsert(
      { rounds: [ronda({ round_number: 3 }), ronda({ round_number: 1 }), ronda({ round_number: 2 })] },
      't1',
    )
    expect(rows.map((r) => r.round_number)).toEqual([2, 3])
  })

  it('sólo persiste lo que el motor lee: ni custom_si, ni notes, ni tee_assignment_mode', () => {
    const [row] = mapTournamentRoundsForInsert(
      { rounds: [ronda({ round_number: 2, custom_si: { '1': 7 }, notes: 'x', tee_assignment_mode: 'manual' })] },
      't1',
    )
    expect(Object.keys(row).sort()).toEqual(['course_id', 'date', 'hole_count', 'round_number', 'tournament_id'])
  })
})

// ── Cliente falso mínimo: sólo lo que usan las funciones de lectura. ──
function fakeClient(result: { data: unknown; error: { message: string } | null }, calls: string[] = []) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve(result),
  }
  return {
    client: {
      from: (table: string) => {
        calls.push(table)
        return builder
      },
    } as unknown as Parameters<typeof fetchRoundPlayConfig>[0],
    calls,
  }
}

const TORNEO = { id: 't1', course_id: 'A', hole_count: 18, date_start: '2026-10-10', total_rounds: 2 }

describe('fetchRoundPlayConfig', () => {
  it('la ronda 1 se resuelve sin ir a la BD', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    const r = await fetchRoundPlayConfig(client, TORNEO, 1)
    expect(r.courseId).toBe('A')
    expect(r.source).toBe('tournament')
    expect(calls).toEqual([])
  })

  it('la ronda 2 lee tournament_rounds y usa su cancha', async () => {
    const { client, calls } = fakeClient({
      data: [{ round_number: 2, course_id: 'B', hole_count: 9, date: '2026-10-11' }],
      error: null,
    })
    const r = await fetchRoundPlayConfig(client, TORNEO, 2)
    expect(calls).toEqual(['tournament_rounds'])
    expect(r).toMatchObject({ courseId: 'B', holeCount: 9, date: '2026-10-11', source: 'tournament_rounds' })
  })

  it('un error de la BD se PROPAGA — no se degrada a la cancha de la ronda 1', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'timeout' } })
    await expect(fetchRoundPlayConfig(client, TORNEO, 2)).rejects.toThrow(/configuración de rondas/)
  })
})

describe('fetchAllRoundPlayConfigs', () => {
  it('torneo de una ronda: no consulta tournament_rounds', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    const all = await fetchAllRoundPlayConfigs(client, { ...TORNEO, total_rounds: 1 })
    expect(all).toHaveLength(1)
    expect(calls).toEqual([])
  })

  it('multi-ronda: una sola query y N entradas', async () => {
    const { client, calls } = fakeClient({
      data: [{ round_number: 2, course_id: 'B', hole_count: 18, date: null }],
      error: null,
    })
    const all = await fetchAllRoundPlayConfigs(client, { ...TORNEO, total_rounds: 3 })
    expect(calls).toEqual(['tournament_rounds'])
    expect(all.map((r) => [r.roundNumber, r.courseId, r.source])).toEqual([
      [1, 'A', 'tournament'],
      [2, 'B', 'tournament_rounds'],
      [3, 'A', 'tournament_fallback'],
    ])
  })
})
