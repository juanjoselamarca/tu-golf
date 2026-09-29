import { describe, it, expect } from 'vitest'
import { deepMergeConfig, mergePartials } from './deep-merge-config'
import { listPatchFrom } from './list-markers'
import { createInitialConfig } from './initial-config'
import { tournamentConfigPartialSchema } from './schema'
import { eliminarRonda } from './rounds-defaults'
import type { CategoryConfig, RoundConfig, TournamentConfig } from './types'

const cat = (id: string, name = id): CategoryConfig => ({ id, name, handicap_min: 0, handicap_max: 54, gender: null })
const round = (n: number, course: string): RoundConfig => ({
  round_number: n, date: null, course_id: course, hole_count: 18, tee_assignment_mode: 'per_player',
})
const configCon = (patch: Partial<TournamentConfig>): TournamentConfig => ({ ...createInitialConfig(), ...patch })

describe('deepMergeConfig — borrar y reemplazar items de listas', () => {
  it('antes del fix: mandar la lista sin el item NO borra (el merge es por id)', () => {
    const base = configCon({ categories: [cat('a'), cat('b')] })
    expect(deepMergeConfig(base, { categories: [cat('a')] }).categories.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('una lápida borra el item y no deja marcas', () => {
    const base = configCon({ categories: [cat('a'), cat('b')] })
    const out = deepMergeConfig(base, { categories: [{ id: 'b', _delete: true }] })
    expect(out.categories).toEqual([cat('a')])
  })

  it('una lápida de un item que no existe no hace nada', () => {
    const base = configCon({ categories: [cat('a')] })
    expect(deepMergeConfig(base, { categories: [{ id: 'zzz', _delete: true }] }).categories).toEqual([cat('a')])
  })

  it('_replace reemplaza el item entero (no conserva campos viejos) y no deja la marca', () => {
    const base = configCon({ rounds: [{ ...round(1, 'x'), notes: 'vieja' }] })
    const out = deepMergeConfig(base, { rounds: [{ ...round(1, 'y'), _replace: true }] })
    expect(out.rounds).toEqual([round(1, 'y')])
  })

  it('las rondas quedan ordenadas por número', () => {
    const base = configCon({ rounds: [round(1, 'a'), round(2, 'b')] })
    const out = deepMergeConfig(base, { rounds: [{ ...round(1, 'b'), _replace: true }, { round_number: 2, _delete: true }] })
    expect(out.rounds.map((r) => [r.round_number, r.course_id])).toEqual([[1, 'b']])
  })
})

describe('mergePartials — la cola conserva el borrado para que viaje al server', () => {
  it('editar un item y después borrarlo deja la lápida (no desaparece el borrado)', () => {
    const pendiente = { categories: [cat('b', 'Damas editada')] }
    const combinado = mergePartials(pendiente, { categories: [{ id: 'b', _delete: true }] })
    expect(combinado.categories).toEqual([{ id: 'b', _delete: true }])
    // El server, que tiene 'b', la borra.
    const server = configCon({ categories: [cat('a'), cat('b')] })
    expect(deepMergeConfig(server, combinado).categories.map((c) => c.id)).toEqual(['a'])
  })

  it('borrar y volver a crear con la misma clave se vuelve un reemplazo', () => {
    const combinado = mergePartials({ rounds: [{ round_number: 2, _delete: true }] }, { rounds: [round(2, 'nueva')] })
    expect(combinado.rounds).toEqual([{ ...round(2, 'nueva'), _replace: true }])
  })

  it('ediciones sin marcas se siguen mergeando campo a campo', () => {
    const combinado = mergePartials(
      { categories: [{ ...cat('a'), name: 'A1' }] },
      { categories: [{ id: 'a', handicap_max: 20 } as unknown as CategoryConfig] },
    )
    expect(combinado.categories).toEqual([{ ...cat('a'), name: 'A1', handicap_max: 20 }])
  })
})

describe('listPatchFrom', () => {
  it('borrar una categoría → solo la lápida', () => {
    const prev = [cat('a'), cat('b'), cat('c')]
    expect(listPatchFrom(prev, [cat('a'), cat('c')], 'id')).toEqual([{ id: 'b', _delete: true }])
  })

  it('borrar la ronda del medio: renumera y aplicado sobre la config deja exactamente la lista nueva', () => {
    const prev = [round(1, 'a'), round(2, 'b'), round(3, 'c')]
    const next = eliminarRonda(prev, 1) // borra la 2 → [1:a, 2:c]
    const patch = listPatchFrom(prev, next, 'round_number')
    expect(deepMergeConfig(configCon({ rounds: prev }), { rounds: patch }).rounds).toEqual(next)
  })

  it('borrar la ronda 1', () => {
    const prev = [round(1, 'a'), round(2, 'b')]
    const next = eliminarRonda(prev, 0)
    expect(deepMergeConfig(configCon({ rounds: prev }), { rounds: listPatchFrom(prev, next, 'round_number') }).rounds).toEqual(next)
  })

  it('sin cambios → patch vacío', () => {
    expect(listPatchFrom([cat('a')], [cat('a')], 'id')).toEqual([])
  })
})

describe('schema parcial', () => {
  it('conserva las marcas (sin declararlas, zod las borraba y el borrado no llegaba)', () => {
    const parsed = tournamentConfigPartialSchema.parse({
      categories: [{ id: 'b', _delete: true }],
      rounds: [{ ...round(1, 'b6ba60b1-18f0-48a8-97c2-ef10e25fbe26'), _replace: true }],
    })
    expect(parsed.categories).toEqual([{ id: 'b', _delete: true }])
    expect(parsed.rounds?.[0]).toMatchObject({ _replace: true })
  })
})
